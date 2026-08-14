const { cors } = require("./_lib");
const { authToken, registerDocument, listDocuments, searchEvidence, deleteDocument } = require("./_library");

module.exports = async (req,res)=>{
  cors(req,res);
  if(req.method==="OPTIONS") return res.status(204).end();
  const token=authToken(req);
  if(!token) return res.status(401).json({error:"Authenticated Supabase session is required."});
  try{
    if(req.method==="GET"){
      const action=String(req.query?.action||"list");
      if(action==="search") return res.status(200).json({evidence:await searchEvidence(token,String(req.query?.q||""),{limit:Number(req.query?.limit||8)})});
      return res.status(200).json({documents:await listDocuments(token)});
    }
    if(req.method==="POST"){
      const body=req.body||{};
      if(body.action!=="register") return res.status(400).json({error:"Unsupported library action."});
      const document=await registerDocument({accessToken:token,bucket:body.bucket||"qtrc-research",storagePath:body.storagePath,name:body.name,mimeType:body.mimeType,sizeBytes:body.sizeBytes});
      return res.status(201).json({document});
    }
    if(req.method==="DELETE"){
      const id=String(req.query?.id||"");
      if(!id) return res.status(400).json({error:"Document id is required."});
      return res.status(200).json(await deleteDocument(token,id));
    }
    return res.status(405).json({error:"Method not allowed"});
  }catch(error){
    console.error("QTRC Library error:",error);
    return res.status(500).json({error:error.message||"Unexpected library error."});
  }
};
