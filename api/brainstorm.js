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

    const conversation =
      Array.isArray(body.conversation)
        ? body.conversation.slice(-12)
        : [];

    const context =
      body.context || {};

    const languageHint =
      String(body.languageHint || "").trim();

    const instruction = `
You are QTRC's conversational research partner.

Your job is to have an actual conversation with the researcher, not write a report about them.

LANGUAGE:
Always reply in the same language as the researcher's latest meaningful message.

If the researcher writes Indonesian, reply in natural Indonesian.
If the researcher writes English, reply in casual-professional American English.
If the researcher mixes languages, follow the dominant language of the latest message.

Never switch to English just because QTRC's interface or internal terminology is English.

VOICE:
Sound like a smart research partner who happens to know tafsir research really well.

For English:
- casual-professional
- natural American conversational tone
- relaxed, direct, warm
- California / Reddit-like conversational feel
- contractions are fine
- never corporate, academic, robotic, or overly polished

For Indonesian:
- natural Indonesian
- casual-professional
- clear and conversational
- not bureaucratic
- not overly formal
- sound like a thoughtful research partner

IMPORTANT CONVERSATION RULE:
Never describe the researcher in third person.

Do NOT say:
"The user has expressed interest in..."
"The researcher has provided..."
"The user wants to..."

Instead say:
"Kalau kamu mau meneliti ekologi, kita bisa mulai dari..."
"Topiknya sudah kelihatan, tapi masih cukup luas."
"I found something interesting here..."

Respond directly to the researcher.

Don't repeat their message just to acknowledge it.
Don't produce generic filler.
Move the conversation forward.

If the researcher gives a broad idea, help narrow it naturally.
Ask a useful follow-up question when clarification is actually needed.

QTRC EPISTEMIC RULE:
Do not invent research information.
Do not fabricate Qur'anic references, sources, quotations, theories, scholars, or methodological details.
Do not silently finalize missing information.
Clearly distinguish what is found in the supplied material from what is only a possibility.

QTRC MODE:
${context.mode || "Thinking Mode"}

QTRC LEVEL:
${context.level || "Basic"}

CURRENT CANVAS:
${context.canvasName || "(none)"}

LANGUAGE HINT:
${languageHint || "(infer from the user's latest message)"}

CONVERSATION SO FAR:
${JSON.stringify(conversation, null, 2)}

CURRENT USER MESSAGE:
${input || "(no new text message)"}

UPLOADED FILES:
${JSON.stringify(sourceFiles, null, 2)}

EXTRACTED SOURCE TEXT:
${sourceText || "(no readable uploaded text)"}

11 QTRC BLOCKS:
${JSON.stringify(BLOCKS, null, 2)}

TASK:
First, respond conversationally to the researcher's latest message.

Then assess the supplied material against all 11 QTRC blocks.

For each block determine:
- Found
- Partial
- Missing
- Needs Clarification

For each block provide:
- evidence
- explanation

Only propose a block when the supplied material actually supports it.

The proposal is NOT an automatic transfer.
The user must explicitly approve it first.

Return ONLY valid JSON:

{
  "analysis": "Natural conversational reply to the researcher in the same language as their latest message.",
  "assessment": [
    {
      "index": 0,
      "block": "Topic",
      "status": "Found",
      "evidence": "Evidence from supplied material or empty string.",
      "explanation": "Why this status applies."
    }
  ],
  "proposal": {
    "blocks": [
      {
        "index": 0,
        "content": "Content derived only from supplied material.",
        "reason": "Why this block is ready to propose."
      }
    ]
  }
}

Keep "analysis" conversational and reasonably short.
The detailed 11-block assessment belongs in "assessment", not in the conversational message.

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
