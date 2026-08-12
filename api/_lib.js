const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(s => s.trim()).filter(Boolean)
  : ["*"];

function cors(req, res) {
  const origin = req.headers.origin || "*";
  const allowed = ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin);
  res.setHeader(
    "Access-Control-Allow-Origin",
    allowed
      ? (ALLOWED_ORIGINS.includes("*") ? "*" : origin)
      : ALLOWED_ORIGINS[0] || "*"
  );
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/$/, "");
}

async function callModel(messages, options = {}) {
  const baseUrl = normalizeBaseUrl(process.env.LITELLM_BASE_URL);
  const model = options.model || process.env.LITELLM_MODEL || "qtrc-supervisor";

  if (baseUrl) {
    const key = process.env.LITELLM_API_KEY;
    if (!key) throw new Error("LITELLM_API_KEY is not configured on the backend.");

    const body = {
      model,
      temperature: typeof options.temperature === "number" ? options.temperature : 0.2,
      messages
    };

    if (options.response_format) body.response_format = options.response_format;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || data?.message || "LiteLLM request failed.");
    }

    return data?.choices?.[0]?.message?.content || "";
  }

  // Temporary local/development fallback until LiteLLM is configured.
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    throw new Error(
      "LITELLM_BASE_URL/LITELLM_API_KEY are not configured, and GROQ_API_KEY is also unavailable."
    );
  }

  const body = {
    model: options.groqModel || process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    temperature: typeof options.temperature === "number" ? options.temperature : 0.2,
    messages
  };

  if (options.response_format) body.response_format = options.response_format;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${groqKey}`
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Groq API request failed.");
  }

  return data?.choices?.[0]?.message?.content || "";
}

// Backward compatibility for existing endpoints.
async function callGroq(messages, options = {}) {
  return callModel(messages, options);
}

module.exports = { cors, callModel, callGroq };
