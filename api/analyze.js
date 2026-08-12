const { cors, callGroq } = require("./_lib");

module.exports = async (req, res) => {
  cors(req,res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({error:"Method not allowed"});
  try {
    const body = req.body || {};
    const basePrompt = process.env.QTRC_SYSTEM_PROMPT;
    if (!basePrompt) return res.status(500).json({error:"QTRC_SYSTEM_PROMPT is not configured on the backend."});

    const context = body.context || {};
    const block = body.block || {};
    const blockIndex = body.blockIndex;
    const question = String(body.question || "").slice(0,12000);

    const userMessage = `QTRC contextual analysis request.
Current mode: ${context.mode || "Thinking Mode"}
Current level: ${context.level || "Basic"}
Current canvas: ${context.canvasName || ""}
Current block index: ${blockIndex}
Current block: ${JSON.stringify(block)}

Researcher's request:
${question}

Return the QTRC structured response for this block. Do not invent missing research information.`;
    const analysis = await callGroq([
      {role:"system",content:basePrompt},
      {role:"user",content:userMessage}
    ]);
    return res.status(200).json({analysis});
  } catch (e) {
    return res.status(500).json({error:e.message || "Unexpected server error."});
  }
};
