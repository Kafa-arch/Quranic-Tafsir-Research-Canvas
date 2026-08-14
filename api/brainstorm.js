const { cors, callModel } = require("./_lib");
const { readCloudFiles } = require("./_cloud-files");
const { authToken } = require("./_library");
const { buildSupervisorMessages, extractJson, normalizeOutput, normalizeState, profileFor } = require("./_supervisor");
const { searchEvidence } = require("./_library");

function safeText(value,max=6000){return String(value||"").replace(/\u0000/g,"").trim().slice(0,max);}
function detectLanguage(text){
  const value=String(text||"").toLowerCase();
  const id=["saya","aku","ingin","tentang","penelitian","riset","tafsir","quran","ayat","bagaimana","kenapa","apa","untuk","dalam","yang","ini","itu"];
  const en=["research","verse","how","why","what","about","the","with","from"];
  const score=(words)=>words.reduce((n,w)=>n+(value.includes(w)?1:0),0);
  return score(id)>=score(en)?"id":"en";
}

function normalizeCloudRefs(refs){
  if(!Array.isArray(refs)) return [];
  return refs.slice(0,6).map(ref=>({
    name:safeText(ref?.name,240),type:safeText(ref?.type,160),size:Number(ref?.size||0),
    bucket:safeText(ref?.bucket||"qtrc-research",100),storagePath:safeText(ref?.storagePath,1500),cloud:Boolean(ref?.cloud)
  })).filter(ref=>ref.storagePath);
}

module.exports=async(req,res)=>{
  cors(req,res);
  if(req.method==="OPTIONS") return res.status(204).end();
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  try{
    const body=req.body||{};
    const mode=String(body.context?.mode||body.mode||"Thinking Mode");
    const level=String(body.context?.level||body.level||"Basic");
    const profile=profileFor(mode,level);
    const input=safeText(body.input,6000);
    const token=authToken(req);
    const previousState=normalizeState(body.researchState||body.context?.researchState||{});
    const conversation=Array.isArray(body.conversation)?body.conversation.slice(-12):[];
    const language=safeText(body.languageHint||detectLanguage(input),10);

    const fileRefs=normalizeCloudRefs(body.fileReferences);
    let sourceText=safeText(body.sourceText,5000);
    let cloudFiles=[];
    if(fileRefs.length){
      const cloud=await readCloudFiles(fileRefs,token);
      sourceText=[sourceText,cloud.text].filter(Boolean).join("\n").slice(0,30000);
      cloudFiles=cloud.files||[];
    }

    let evidence=[];
    if(token){
      try{
        const evidenceQuery=[input,previousState.researchQuestion,previousState.topic].filter(Boolean).join(" ").slice(0,500);
        evidence=await searchEvidence(token,evidenceQuery,{limit:8});
      }catch(error){
        console.warn("QTRC evidence lookup skipped:",error.message);
      }
    }

    const basePrompt=process.env.QTRC_SYSTEM_PROMPT||"";
    const messages=buildSupervisorMessages({mode,level,language,state:previousState,conversation,latestInput:input,evidence,basePrompt});
    const raw=await callModel(messages,{temperature:profile.mode==="Validation Mode"?0.15:0.25,max_tokens:3500});
    const parsed=extractJson(raw);
    const normalized=normalizeOutput(parsed,raw,previousState);

    return res.status(200).json({
      profile:{key:`${mode}-${level}`,label:profile.label,mode:profile.mode,level:profile.level},
      analysis:normalized.analysis,
      researchState:normalized.researchState,
      assessment:normalized.assessment,
      proposal:normalized.proposal,
      evidence:normalized.evidenceUse.map(use=>({
        ...use,
        source:evidence.find(e=>e.evidenceId===use.evidenceId)||null
      })),
      availableEvidence:evidence,
      cloudFiles
    });
  }catch(error){
    console.error("QTRC Supervisor Engine error:",error);
    return res.status(500).json({error:error.message||"Unexpected supervisor error."});
  }
};
