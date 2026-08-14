const { cors } = require("./_lib");
const { profileFor, PROFILES } = require("./_supervisor");

module.exports = (req,res)=>{
  cors(req,res);
  if(req.method==="OPTIONS") return res.status(204).end();
  if(req.method!=="GET") return res.status(405).json({error:"Method not allowed"});
  const mode=String(req.query?.mode||"Thinking Mode");
  const level=String(req.query?.level||"Basic");
  return res.status(200).json({profile:profileFor(mode,level),profiles:Object.values(PROFILES)});
};
