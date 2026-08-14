const crypto = require("crypto");
const officeParser = require("officeparser");

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 120000;
const CHUNK_SIZE = 1800;
const CHUNK_OVERLAP = 180;

function clean(value, max = 1200){
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}

async function getAuthenticatedUser(accessToken){
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!supabaseUrl || !serviceRoleKey) throw new Error("Supabase server configuration is missing.");
  if(!accessToken) throw new Error("Authenticated Supabase session is required.");
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {headers:{apikey:serviceRoleKey,Authorization:`Bearer ${accessToken}`}});
  if(!response.ok) throw new Error("Invalid or expired Supabase session.");
  const user = await response.json();
  if(!user?.id) throw new Error("Authenticated Supabase user not found.");
  return user;
}

function authToken(req){
  const header=req.headers?.authorization||"";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function supabaseConfig(){
  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!supabaseUrl || !serviceRoleKey) throw new Error("Supabase server configuration is missing.");
  return {supabaseUrl,serviceRoleKey};
}

function restHeaders(key){return {apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"};}

async function rest(path,{method="GET",body,prefer}={}){
  const {supabaseUrl,serviceRoleKey}=supabaseConfig();
  const headers=restHeaders(serviceRoleKey);
  if(prefer) headers.Prefer=prefer;
  const response=await fetch(`${supabaseUrl}/rest/v1/${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const text=await response.text();
  let data={}; try{data=text?JSON.parse(text):{}}catch(_){data={raw:text};}
  if(!response.ok) throw new Error(data?.message||data?.hint||data?.details||data?.error||`Supabase request failed (${response.status}).`);
  return data;
}

function storageObjectUrl(base,bucket,path){
  return `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

async function readStorageFile({bucket,storagePath,accessToken}){
  const user=await getAuthenticatedUser(accessToken);
  if(!storagePath || !storagePath.startsWith(`${user.id}/`)) throw new Error("File path does not belong to the authenticated user.");
  const {supabaseUrl,serviceRoleKey}=supabaseConfig();
  const response=await fetch(storageObjectUrl(supabaseUrl,bucket,storagePath),{headers:{apikey:serviceRoleKey,Authorization:`Bearer ${serviceRoleKey}`}});
  if(!response.ok) throw new Error("The cloud file could not be retrieved.");
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength>MAX_FILE_BYTES) throw new Error("File exceeds the current 50 MB ingestion limit.");
  return {user,bytes,contentType:response.headers.get("content-type")||""};
}

async function extractText(bytes){
  const ast=await officeParser.parseOffice(new Uint8Array(bytes));
  return String(await ast.toText()||"").replace(/\u0000/g,"").trim().slice(0,MAX_EXTRACTED_CHARS);
}

function hashText(text){return crypto.createHash("sha256").update(text).digest("hex");}

function chunkText(text){
  const chunks=[]; const value=String(text||"").trim(); if(!value) return chunks;
  let start=0,index=0;
  while(start<value.length && index<1000){
    const end=Math.min(value.length,start+CHUNK_SIZE);
    const content=value.slice(start,end).trim();
    if(content) chunks.push({index,content});
    if(end>=value.length) break;
    start=Math.max(0,end-CHUNK_OVERLAP); index++;
  }
  return chunks;
}

async function registerDocument({accessToken,bucket="qtrc-research",storagePath,name,mimeType,sizeBytes}){
  const {user,bytes}=await readStorageFile({bucket,storagePath,accessToken});
  const extracted=await extractText(bytes);
  const documentId=crypto.randomUUID();
  const now=new Date().toISOString();
  const document={
    id:documentId,user_id:user.id,name:clean(name,240),mime_type:clean(mimeType,160),size_bytes:Number(sizeBytes||bytes.byteLength),
    storage_bucket:bucket,storage_path:storagePath,extracted_chars:extracted.length,content_hash:hashText(extracted),status:extracted?"indexed":"empty",
    metadata:{source:"QTRC Library",index_version:1},created_at:now,updated_at:now
  };
  await rest("qtrc_library_documents",{method:"POST",body:[document],prefer:"return=minimal"});

  const chunks=chunkText(extracted).map(item=>({
    id:crypto.randomUUID(),document_id:documentId,user_id:user.id,document_name:document.name,mime_type:document.mime_type,
    chunk_index:item.index,chunk_label:`chunk-${String(item.index+1).padStart(3,"0")}`,content_text:item.content,
    content_hash:hashText(item.content),created_at:now
  }));
  if(chunks.length) await rest("qtrc_library_chunks",{method:"POST",body:chunks,prefer:"return=minimal"});
  return document;
}

async function listDocuments(accessToken){
  const user=await getAuthenticatedUser(accessToken);
  const encoded=encodeURIComponent(`eq.${user.id}`);
  return rest(`qtrc_library_documents?select=id,name,mime_type,size_bytes,storage_bucket,storage_path,extracted_chars,status,metadata,created_at,updated_at&user_id=${encoded}&order=updated_at.desc`);
}

function queryTerms(query){
  return [...new Set(String(query||"").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu," ").split(/\s+/).filter(w=>w.length>=4).slice(0,5))];
}

async function searchEvidence(accessToken,query,{limit=8}={}){
  const user=await getAuthenticatedUser(accessToken);
  const terms=queryTerms(query);
  if(!terms.length) return [];
  const out=[]; const seen=new Set();
  for(const term of terms){
    const filter=`eq.${user.id}`;
    const content=`ilike.*${encodeURIComponent(term)}*`;
    const path=`qtrc_library_chunks?select=id,document_id,document_name,mime_type,chunk_index,chunk_label,content_text&user_id=${encodeURIComponent(filter)}&content_text=${content}&limit=${Math.max(2,Math.ceil(limit/terms.length)+2)}`;
    const rows=await rest(path);
    for(const row of rows){
      if(seen.has(row.id)) continue;
      seen.add(row.id);
      out.push({
        evidenceId:`E${out.length+1}`,
        documentId:row.document_id,
        chunkId:row.id,
        documentName:row.document_name,
        mimeType:row.mime_type,
        chunkIndex:row.chunk_index,
        chunkLabel:row.chunk_label,
        excerpt:clean(row.content_text,2200),
        matchTerm:term
      });
      if(out.length>=limit) return out;
    }
  }
  return out;
}

async function deleteDocument(accessToken,documentId){
  const user=await getAuthenticatedUser(accessToken);
  const docs=await rest(`qtrc_library_documents?select=id,storage_bucket,storage_path&user_id=eq.${encodeURIComponent(user.id)}&id=eq.${encodeURIComponent(documentId)}&limit=1`);
  const doc=docs[0]; if(!doc) return {deleted:false};
  const {supabaseUrl,serviceRoleKey}=supabaseConfig();
  await fetch(`${supabaseUrl}/storage/v1/object/${encodeURIComponent(doc.storage_bucket)}/${doc.storage_path.split("/").map(encodeURIComponent).join("/")}`,{method:"DELETE",headers:{apikey:serviceRoleKey,Authorization:`Bearer ${serviceRoleKey}`}});
  await rest(`qtrc_library_documents?id=eq.${encodeURIComponent(documentId)}&user_id=eq.${encodeURIComponent(user.id)}`,{method:"DELETE",prefer:"return=minimal"});
  return {deleted:true};
}

module.exports={authToken,getAuthenticatedUser,registerDocument,listDocuments,searchEvidence,deleteDocument};
