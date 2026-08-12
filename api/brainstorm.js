const { cors, callGroq } = require("./_lib");

const BLOCKS = [
  {
    index: 0,
    name: "Topic",
    definition: "Area kajian umum yang mengarahkan bangunan metodologi, analisis, dan hasil.",
    dependency: "Terutama terhubung dengan Research Question, Context, dan Corpus Qur’aniyyah."
  },
  {
    index: 1,
    name: "Research Question",
    definition: "Pertanyaan kritis yang akan dijawab melalui riset; menjadi pengarah fokus dan karakter penelitian.",
    dependency: "Selaraskan dengan Objective, Method of Tafsir, dan Contribution & Novelty."
  },
  {
    index: 2,
    name: "Objective",
    definition: "Rumusan Research Question dalam bentuk deklaratif; menjelaskan arah dan capaian riset.",
    dependency: "Pastikan tujuan tidak melampaui pertanyaan penelitian."
  },
  {
    index: 3,
    name: "Corpus Qur’aniyyah",
    definition: "Kumpulan ayat yang menjadi objek analisis; pemilihannya perlu justifikasi metodologis.",
    dependency: "Tentukan ayat, surah, atau tema dan alasan pemilihannya secara transparan."
  },
  {
    index: 4,
    name: "Context",
    definition: "Dunia teks dan dunia peneliti; konteks historis serta sosial-kontemporer yang relevan.",
    dependency: "Bedakan konteks masa lalu, mikro/makro, dan konteks masa kini."
  },
  {
    index: 5,
    name: "Data & Sources",
    definition: "Sumber primer dan sekunder yang digunakan dalam proses analisis.",
    dependency: "Sumber perlu ditelusuri, diverifikasi, dan dikelola secara bertanggung jawab."
  },
  {
    index: 6,
    name: "Theoretical Framework",
    definition: "Teori atau lensa konseptual yang digunakan untuk membaca dan menjelaskan data.",
    dependency: "Harus benar-benar bekerja dalam analisis, bukan sekadar disebut."
  },
  {
    index: 7,
    name: "Method of Tafsir",
    definition: "Cara atau metode penafsiran yang digunakan untuk membangun pembacaan.",
    dependency: "Harus selaras dengan Research Question dan objek kajian."
  },
  {
    index: 8,
    name: "Analysis Strategy",
    definition: "Strategi konkret untuk menganalisis data dan menghubungkan teori, corpus, dan metode.",
    dependency: "Tidak boleh melompat melampaui data dan method yang tersedia."
  },
  {
    index: 9,
    name: "Contribution & Novelty",
    definition: "Kontribusi dan kebaruan yang ditawarkan penelitian.",
    dependency: "Harus dapat ditelusuri kembali ke masalah, question, dan analysis."
  },
  {
    index: 10,
    name: "Title",
    definition: "Sintesis ringkas dari arsitektur penelitian.",
    dependency: "Title sebaiknya mencerminkan Topic, Question, Corpus, dan fokus analisis."
  }
];

module.exports = async (req, res) => {

  cors(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    const body = req.body || {};

    const basePrompt =
      process.env.QTRC_SYSTEM_PROMPT;

    if (!basePrompt) {
      return res.status(500).json({
        error:
          "QTRC_SYSTEM_PROMPT is not configured on the backend."
      });
    }

    const input =
      String(body.input || "").slice(0, 16000);

    const sourceText =
      String(body.sourceText || "").slice(0, 30000);

    const sourceFiles =
      Array.isArray(body.files)
        ? body.files.slice(0, 10)
        : [];

    const context =
      body.context || {};

    const instruction = `
You are QTRC's conversational research partner inside the Brainstorming workspace.

VOICE:
Talk like a smart research partner in casual-professional American English.
Natural, direct, warm, conversational.
Think California / Reddit-style conversation, but never sloppy with research.
Do not sound like a professor, corporate assistant, or formal chatbot.

CORE RULE:
Do not silently finalize or invent research information.
Treat user-provided material as exploratory unless the evidence clearly supports something.
When something is missing, say it is missing.
When something is ambiguous, say it is ambiguous.
Do not fabricate Qur'anic references, sources, quotations, theories, or methodological details.

QTRC MODE:
${context.mode || "Thinking Mode"}

QTRC LEVEL:
${context.level || "Basic"}

CURRENT CANVAS:
${context.canvasName || "(none)"}

11 QTRC BLOCKS:
${JSON.stringify(BLOCKS, null, 2)}

USER MESSAGE:
${input || "(no message)"}

UPLOADED SOURCE FILES:
${JSON.stringify(sourceFiles, null, 2)}

EXTRACTED SOURCE TEXT:
${sourceText || "(no uploaded text)"}

TASK:
Review the user's message and uploaded source material together.

Cross-check the material against ALL 11 QTRC blocks.

For every block, determine one status:
- Found
- Partial
- Missing
- Needs Clarification

For each block:
1. Explain what you found.
2. Give evidence when available.
3. Explain why it does or does not satisfy that block.
4. Do not infer unsupported information.

Then determine which blocks are strong enough to PROPOSE for transfer.

Only propose a block when the user-provided material actually supports it.

IMPORTANT:
A proposed block is NOT yet accepted.
The user must explicitly approve the transfer.

Return ONLY valid JSON in this exact structure:

{
  "analysis": "A concise conversational explanation for the researcher.",
  "assessment": [
    {
      "index": 0,
      "block": "Topic",
      "status": "Found",
      "evidence": "Evidence from the supplied material or empty string.",
      "explanation": "Why this status applies."
    }
  ],
  "proposal": {
    "blocks": [
      {
        "index": 0,
        "content": "Proposed block content derived only from supplied material.",
        "reason": "Why this is ready to propose."
      }
    ]
  }
}

Do not return markdown.
Do not wrap JSON in code fences.
`;

    const raw =
      await callGroq([
        {
          role: "system",
          content: basePrompt
        },
        {
          role: "user",
          content: instruction
        }
      ]);

    let result;

    try {
      result = JSON.parse(raw);
    } catch (parseError) {

      return res.status(200).json({
        analysis: raw,
        assessment: [],
        proposal: {
          blocks: []
        }
      });

    }

    return res.status(200).json(result);

  } catch (e) {

    return res.status(500).json({
      error:
        e.message ||
        "Unexpected server error."
    });

  }

};
