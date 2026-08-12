const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(s => s.trim()).filter(Boolean)
  : ["*"];

function cors(req, res) {
  const origin = req.headers.origin || "*";
  const allowed = ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin);
  res.setHeader("Access-Control-Allow-Origin", allowed ? (ALLOWED_ORIGINS.includes("*") ? "*" : origin) : ALLOWED_ORIGINS[0] || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

async function callGroq(messages) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not configured on the backend.");
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {"Content-Type":"application/json","Authorization":`Bearer ${key}`},
    body: JSON.stringify({model, temperature: 0.2, messages})
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || "Groq API request failed.");
  return data?.choices?.[0]?.message?.content || "";
}

module.exports = { cors, callGroq };
