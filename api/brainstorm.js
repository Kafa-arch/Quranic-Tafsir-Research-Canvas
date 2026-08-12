const { cors, callGroq } = require("./_lib");

module.exports = async (req, res) => {
  cors(req,res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({error:"Method not allowed"});
  try {
    const body=req.body||{};
    const basePrompt=process.env.QTRC_SYSTEM_PROMPT;
    if(!basePrompt) return res.status(500).json({error:"QTRC_SYSTEM_PROMPT is not configured on the backend."});
    const input=String(body.input||"").slice(0,12000);
    const mode=String(body.brainMode||"explore");
    const context=body.context||{};
    const instruction=`This is the QTRC Brainstorming Workspace. Treat the user's message as exploratory material, not as a finalized research claim.

Brainstorming mode: ${mode}
QTRC mode: ${context.mode||"Thinking Mode"}
QTRC level: ${context.level||"Basic"}

Researcher's brainstorming:
${input}

Respond as a methodological brainstorming partner. Help the researcher surface possibilities, ambiguities, dependencies, and questions. Do not fabricate sources or Qur'anic references. Do not silently finalize any QTRC block. Clearly distinguish exploratory suggestions from validated information.`;
    const analysis=await callGroq([
      {role:"system",content:basePrompt},
      {role:"user",content:instruction}
    ]);
    return res.status(200).json({analysis});
  }catch(e){return res.status(500).json({error:e.message||"Unexpected server error."});}
};
