const ALLOWED_ORIGINS =
  process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)
    : ["*"];

function cors(req, res) {
  const origin =
    req.headers.origin || "*";

  const allowed =
    ALLOWED_ORIGINS.includes("*") ||
    ALLOWED_ORIGINS.includes(origin);

  res.setHeader(
    "Access-Control-Allow-Origin",
    allowed
      ? (
          ALLOWED_ORIGINS.includes("*")
            ? "*"
            : origin
        )
      : (
          ALLOWED_ORIGINS[0] || "*"
        )
  );

  res.setHeader(
    "Vary",
    "Origin"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );
}

function cleanBaseUrl(value) {
  return String(value || "")
    .replace(/\/+$/, "");
}

function isRetryableStatus(status) {
  return (
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

async function fetchJson(
  url,
  options,
  providerName
) {
  const response =
    await fetch(url, options);

  let data = {};

  try {
    data =
      await response.json();
  } catch (_) {}

  if (!response.ok) {
    const error =
      new Error(
        data?.error?.message ||
        data?.error ||
        data?.message ||
        `${providerName} request failed (${response.status}).`
      );

    error.status =
      response.status;

    error.retryable =
      isRetryableStatus(
        response.status
      );

    throw error;
  }

  return data;
}

function buildOpenAICompatibleBody(
  model,
  messages,
  options
) {
  const body = {
    model,
    messages,
    temperature:
      typeof options.temperature === "number"
        ? options.temperature
        : 0.2
  };

  if (options.response_format) {
    body.response_format =
      options.response_format;
  }

  if (options.max_tokens) {
    body.max_tokens =
      options.max_tokens;
  }

  if (options.reasoning_effort) {
    body.reasoning_effort =
      options.reasoning_effort;
  }

  if (options.extra_body) {
    Object.assign(
      body,
      options.extra_body
    );
  }

  return body;
}

/*
 * Provider 1:
 * Google Gemini
 *
 * Gemini exposes an OpenAI-compatible
 * chat completions endpoint, so QTRC
 * can keep one common message format.
 */
async function callGemini(
  messages,
  options = {}
) {
  const key =
    process.env.GEMINI_API_KEY;

  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not configured."
    );
  }

  const model =
    options.geminiModel ||
    process.env.GEMINI_MODEL ||
    "gemini-2.5-flash";

  const body =
    buildOpenAICompatibleBody(
      model,
      messages,
      options
    );

  const data =
    await fetchJson(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Authorization:
            `Bearer ${key}`
        },
        body:
          JSON.stringify(body)
      },
      "Gemini"
    );

  return {
    provider: "gemini",
    model,
    content:
      data?.choices?.[0]?.message?.content ||
      ""
  };
}

/*
 * Provider 2:
 * Groq
 */
async function callGroqProvider(
  messages,
  options = {}
) {
  const key =
    process.env.GROQ_API_KEY;

  if (!key) {
    throw new Error(
      "GROQ_API_KEY is not configured."
    );
  }

  const model =
    options.groqModel ||
    process.env.GROQ_MODEL ||
    "llama-3.3-70b-versatile";

  const body =
    buildOpenAICompatibleBody(
      model,
      messages,
      options
    );

  const data =
    await fetchJson(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Authorization:
            `Bearer ${key}`
        },
        body:
          JSON.stringify(body)
      },
      "Groq"
    );

  return {
    provider: "groq",
    model,
    content:
      data?.choices?.[0]?.message?.content ||
      ""
  };
}

/*
 * Provider 3:
 * OpenRouter free router.
 *
 * We deliberately use openrouter/free
 * instead of pinning a single free model.
 * OpenRouter automatically selects a
 * currently available compatible free model.
 */
async function callOpenRouter(
  messages,
  options = {}
) {
  const key =
    process.env.OPENROUTER_API_KEY;

  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured."
    );
  }

  const model =
    options.openRouterModel ||
    process.env.OPENROUTER_MODEL ||
    "openrouter/free";

  const body =
    buildOpenAICompatibleBody(
      model,
      messages,
      options
    );

  const data =
    await fetchJson(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Authorization:
            `Bearer ${key}`,
          "HTTP-Referer":
            process.env.OPENROUTER_HTTP_REFERER ||
            "https://quranic-tafsir-research-canvas.vercel.app",
          "X-Title":
            process.env.OPENROUTER_X_TITLE ||
            "QTRC — Qur'anic Tafsir Research Canvas"
        },
        body:
          JSON.stringify(body)
      },
      "OpenRouter"
    );

  return {
    provider: "openrouter",
    model,
    content:
      data?.choices?.[0]?.message?.content ||
      ""
  };
}

/*
 * Main QTRC router
 *
 * Order:
 *   1. Gemini
 *   2. Groq
 *   3. OpenRouter free
 *
 * Only retryable/provider-availability
 * errors move us to the next provider.
 * Ordinary application errors are surfaced.
 */
async function callModel(
  messages,
  options = {}
) {
  const providers = [
    {
      name: "gemini",
      fn: callGemini
    },
    {
      name: "groq",
      fn: callGroqProvider
    },
    {
      name: "openrouter",
      fn: callOpenRouter
    }
  ];

  const errors = [];

  for (
    const provider of providers
  ) {
    try {

      const result =
        await provider.fn(
          messages,
          options
        );

      if (
        !result ||
        typeof result.content !== "string" ||
        !result.content.trim()
      ) {
        throw new Error(
          `${provider.name} returned an empty response.`
        );
      }

      return result.content;

    } catch (error) {

      errors.push({
        provider:
          provider.name,
        status:
          error?.status || null,
        message:
          error?.message ||
          "Unknown provider error.",
        retryable:
          error?.retryable !== false
      });

      /*
       * Missing key or malformed request:
       * try the next available provider.
       *
       * For ordinary 4xx application errors,
       * we do not keep hammering the same provider,
       * but we still allow fallback.
       */
      continue;
    }
  }

  const summary =
    errors
      .map(
        item =>
          `${item.provider}: ${item.message}`
      )
      .join(" | ");

  throw new Error(
    `All QTRC AI providers failed. ${summary}`
  );
}

/*
 * Backward compatibility.
 * Existing code that still calls callGroq()
 * will use the same provider router.
 */
async function callGroq(
  messages,
  options = {}
) {
  return callModel(
    messages,
    options
  );
}

module.exports = {
  cors,
  callModel,
  callGroq
};
