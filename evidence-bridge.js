<script id="QTRC_EVIDENCE_LAYER_BRIDGE_V1">
(function(){
  "use strict";

  const LIBRARY_KEY="qtrc_library_files";
  const safeJson=(value,fallback)=>{try{return JSON.parse(value)}catch(_){return fallback}};
  const getLocal=()=>safeJson(localStorage.getItem(LIBRARY_KEY)||"[]",[]);
  const setLocal=(items)=>localStorage.setItem(LIBRARY_KEY,JSON.stringify(items));

  async function getToken(){
    try{
      if(!window.qtrcSupabaseReady) return "";
      const supabase=await window.qtrcSupabaseReady;
      const result=await supabase.auth.getSession();
      return result?.data?.session?.access_token||"";
    }catch(_){return "";}
  }

  async function api(path,options={}){
    const token=await getToken();
    const headers={"Content-Type":"application/json",...(options.headers||{})};
    if(token) headers.Authorization="Bearer "+token;
    const response=await fetch(path,{...options,headers});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error||"QTRC evidence request failed.");
    return data;
  }

  async function uploadToLibrary(file){
    const supabase=await window.qtrcSupabaseReady;
    const userResult=await supabase.auth.getUser();
    const user=userResult?.data?.user;
    if(!user?.id) throw new Error("Cloud identity is not available.");

    const safeName=file.name.replace(/[\\/]+/g,"_").replace(/\.\.+/g,"_");
    const storagePath=`${user.id}/${Date.now()}-${safeName}`;
    const result=await supabase.storage.from("qtrc-research").upload(storagePath,file,{contentType:file.type||"application/octet-stream",upsert:false});
    if(result.error) throw result.error;

    const registered=await api("/api/library",{
      method:"POST",
      body:JSON.stringify({action:"register",bucket:"qtrc-research",storagePath,name:file.name,mimeType:file.type,sizeBytes:file.size})
    });

    return registered.document;
  }

  async function refreshLibrary(){
    const grid=document.getElementById("libraryGrid");
    if(!grid) return;
    try{
      const data=await api("/api/library");
      const docs=Array.isArray(data.documents)?data.documents:[];
      setLocal(docs);
      grid.innerHTML="";
      if(!docs.length){
        grid.innerHTML='<div class="empty" style="grid-column:1/-1">No evidence documents indexed yet.</div>';
        return;
      }
      docs.forEach(doc=>{
        const el=document.createElement("div");
        el.className="library-card";
        el.innerHTML=`<div class="library-card-head"><div><div class="library-file-name">${esc(doc.name)}</div><div class="library-file-meta">${String(doc.status||"pending")} · ${Number(doc.extracted_chars||0).toLocaleString()} chars indexed</div></div><span class="library-file-status">Evidence layer</span></div><div class="library-card-actions"><button class="btn" type="button" data-evidence-search="${doc.id}">Use in Session</button><button class="btn danger" type="button" data-evidence-delete="${doc.id}">Remove</button></div>`;
        const use=el.querySelector("[data-evidence-search]");
        use.onclick=()=>{
          if(typeof go==="function") go("brainstorm");
          setTimeout(()=>{
            const input=document.getElementById("brainInput");
            if(input){input.value=`Please use evidence from ${doc.name} in this discussion.`;input.focus();}
          },50);
        };
        el.querySelector("[data-evidence-delete]").onclick=async()=>{
          if(!confirm("Remove this evidence document from QTRC Library?")) return;
          await api(`/api/library?id=${encodeURIComponent(doc.id)}`,{method:"DELETE"});
          refreshLibrary();
        };
        grid.appendChild(el);
      });
    }catch(error){
      grid.innerHTML=`<div class="empty" style="grid-column:1/-1">${esc(error.message)}</div>`;
    }
  }

  window.qtrcEvidenceRefreshLibrary=refreshLibrary;
  window.qtrcEvidenceUploadFiles=async files=>{
    const results=[];
    for(const file of files){
      try{results.push(await uploadToLibrary(file));}
      catch(error){console.error("QTRC Library upload failed",error);}
    }
    await refreshLibrary();
    return results;
  };

  function patchLibrary(){
    const button=document.getElementById("libraryUploadButton");
    const input=document.getElementById("libraryFileInput");
    if(button && input){
      button.onclick=()=>input.click();
      input.onchange=async()=>{
        const files=Array.from(input.files||[]);
        if(files.length) await window.qtrcEvidenceUploadFiles(files);
        input.value="";
      };
    }
  }

  function renderEvidenceInBrain(data){
    const card=document.getElementById("brainSourcesCard");
    const box=document.getElementById("brainSources");
    if(!card||!box) return;
    const evidence=Array.isArray(data?.availableEvidence)?data.availableEvidence:[];
    if(!evidence.length){card.style.display="none";box.innerHTML="";return;}
    card.style.display="block";box.innerHTML="";
    evidence.slice(0,8).forEach(item=>{
      const row=document.createElement("div");row.className="qtrc-source";
      row.innerHTML=`<div class="qtrc-source-title">${esc(item.documentName||"Untitled source")}</div><div class="qtrc-source-meta">${esc(item.chunkLabel||"")} · ${esc(item.matchTerm||"")}</div><div class="qtrc-source-meta">${esc(item.excerpt||"")}</div><div class="qtrc-source-provider">${esc(item.evidenceId||"")}</div>`;
      box.appendChild(row);
    });
  }

  async function sendWithSupervisor(){
    const inputElement=document.getElementById("brainInput");
    const sendButton=document.getElementById("brainThink");
    if(!inputElement||!sendButton) return;
    const input=inputElement.value.trim();
    const files=typeof brainV3Files!=="undefined"?brainV3Files:[];
    if(!input&&!files.length){
      if(typeof brainV3AddMessage==="function") brainV3AddMessage("qtrc","Silakan mulai dengan ide, pertanyaan, atau bahan penelitian yang ingin kita bahas.");
      return;
    }
    if(input && typeof brainV3AddMessage==="function") brainV3AddMessage("user",input);
    inputElement.value="";
    sendButton.disabled=true;
    if(typeof brainV3ShowProcessing==="function") brainV3ShowProcessing("analyzing");

    try{
      const conversation=typeof brainV3Conversation!=="undefined"?brainV3Conversation.slice(-12):[];
      const refs=files.map(file=>({name:file.name,type:file.type,size:file.size,bucket:file.bucket||"qtrc-research",storagePath:file.storagePath||"",cloud:!!file.cloud}));
      const mode=(typeof current!=="undefined"&&current?.mode)||selectedMode||"Thinking Mode";
      const level=(typeof current!=="undefined"&&current?.level)||selectedLevel||"Basic";
      const payload={input,conversation,languageHint:typeof brainV3DetectLanguage==="function"?brainV3DetectLanguage(input):"id",fileReferences:refs,files:refs,context:{mode,level,researchState:(typeof current!=="undefined"&&current?.researchState)||{}}};
      const data=await api("/api/brainstorm",{method:"POST",body:JSON.stringify(payload)});
      if(typeof brainV3HideProcessing==="function") brainV3HideProcessing();
      if(typeof brainV3AddMessage==="function") brainV3AddMessage("qtrc",data.analysis||"Saya sudah menelaah bahan yang Anda berikan.");
      if(typeof brainV3RenderMap==="function") brainV3RenderMap(data.assessment||[]);
      if(typeof brainV3RenderProposal==="function") brainV3RenderProposal(data.proposal||{blocks:[]});
      renderEvidenceInBrain(data);
      if(typeof current!=="undefined"&&current){current.researchState=data.researchState||current.researchState;}
    }catch(error){
      if(typeof brainV3HideProcessing==="function") brainV3HideProcessing();
      if(typeof brainV3AddMessage==="function") brainV3AddMessage("qtrc","Saya belum dapat menyelesaikan analisis ini. "+error.message);
    }finally{sendButton.disabled=false;}
  }

  function patchBrain(){
    const button=document.getElementById("brainThink");
    if(button){button.onclick=sendWithSupervisor;}
    const input=document.getElementById("brainFileInput");
    if(input){
      input.addEventListener("change",async()=>{
        const files=Array.from(input.files||[]);
        if(!files.length)return;
        for(const file of files){
          try{
            if(typeof brainV3ShowProcessing==="function") brainV3ShowProcessing("reading");
            const ref=typeof brainV3UploadFileToCloud==="function"?await brainV3UploadFileToCloud(file):null;
            if(ref){
              if(typeof brainV3Files!=="undefined") brainV3Files.push(ref);
              await api("/api/library",{method:"POST",body:JSON.stringify({action:"register",bucket:ref.bucket||"qtrc-research",storagePath:ref.storagePath,name:ref.name,mimeType:ref.type,sizeBytes:ref.size})});
            }
          }catch(error){console.error("QTRC evidence upload failed",error)}
        }
        if(typeof brainV3HideProcessing==="function") brainV3HideProcessing();
        if(typeof brainV3RenderAttachments==="function") brainV3RenderAttachments();
        input.value="";
      },{once:true});
    }
  }

  function boot(){
    patchLibrary();
    patchBrain();
    if(typeof go==="function"){
      const originalGo=go;
      go=function(view){originalGo(view);if(view==="library")setTimeout(refreshLibrary,60);};
    }
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot,{once:true}); else boot();
})();
</script>
