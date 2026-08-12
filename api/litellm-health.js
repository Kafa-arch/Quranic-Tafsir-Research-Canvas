const { cors } = require("./_lib");

module.exports = async (req, res) => {
  cors(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const baseUrl = String(process.env.LITELLM_BASE_URL || "").replace(/\/$/, "");

  if (!baseUrl) {
    return res.status(503).json({
      ready: false,
      error: "LITELLM_BASE_URL is not configured."
    });
  }

  try {
    const response = await fetch(`${baseUrl}/health/liveliness`, {
      headers: {
        Authorization: `Bearer ${process.env.LITELLM_API_KEY || ""}`
      }
    });

    return res.status(response.ok ? 200 : 503).json({
      ready: response.ok,
      status: response.status
    });
  } catch (error) {
    return res.status(503).json({
      ready: false,
      error: error?.message || "LiteLLM is unreachable."
    });
  }
};
