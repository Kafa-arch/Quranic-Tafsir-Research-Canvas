const { cors, callGroq } = require("./_lib");

const BLOCKS = [
  ["Topic","Area kajian umum yang mengarahkan bangunan metodologi, analisis, dan hasil.","Terhubung terutama dengan Research Question, Context, dan Corpus Qur’aniyyah."],
  ["Research Question","Pertanyaan kritis yang akan dijawab melalui riset.","Selaraskan dengan Objective, Method of Tafsir, dan Contribution & Novelty."],
  ["Objective","Rumusan Research Question dalam bentuk deklaratif.","Pastikan tujuan tidak melampaui pertanyaan penelitian."],
  ["Corpus Qur’aniyyah","Kumpulan ayat yang menjadi objek analisis.","Tentukan ayat, surah, atau tema dan alasan pemilihannya secara transparan."],
  ["Context","Konteks historis serta sosial-kontemporer yang relevan.","Bedakan konteks masa lalu dan konteks masa kini."],
  ["Data & Sources","Sumber primer dan sekunder yang digunakan.","Sumber perlu ditelusuri dan diverifikasi."],
  ["Theoretical Framework","Teori atau lensa konseptual yang digunakan.","Harus benar-benar bekerja dalam analisis."],
  ["Method of Tafsir","Cara atau metode penafsiran yang digunakan.","Harus selaras dengan Research Question dan objek kajian."],
  ["Analysis Strategy","Strategi konkret untuk menganalisis data.","Harus menjembatani question, data, theory, dan method."],
  ["Contribution & Novelty","Kontribusi dan kebaruan penelitian.","Harus dapat ditelusuri kembali ke masalah dan analisis."],
  ["Title","Sintesis ringkas arsitektur penelitian.","Harus mencerminkan fokus penelitian."]
];

function safeText(value, max = 6000){
  return String(value || "")
    .replace(/\u0000/g, "")
    .slice(0, max)
    .trim();
}

function detectLanguage(text){

  const value =
    String(text || "")
      .toLowerCase()
      .replace(/[^\p{L}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

  const indoSignals = [
    "saya","aku","ingin","mau","tentang",
    "penelitian","riset","tafsir","alquran",
    "al quran","quran","surah","surat","ayat",
    "mufasir","kitab","hadis","hadits",
    "bagaimana","kenapa","mengapa","apa","apakah",
    "untuk","dalam","dengan","yang","ini","itu",
    "membahas","dibahas","meneliti","diteliti",
    "mencari","jurnal","ga","gak","nggak"
  ];

  const englishSignals = [
    "i","i want","i am","i'm","research",
    "researching","verse","verses","journal",
    "how","why","what","which","can","could",
    "would","about","with","from","into","the"
  ];

  let idScore = 0;
  let enScore = 0;

  indoSignals.forEach(function(word){
    if(value.includes(word)){
      idScore++;
    }
  });

  englishSignals.forEach(function(word){
    if(value.includes(word)){
      enScore++;
    }
  });

  if(idScore > enScore){
    return "id";
  }

  if(enScore > idScore){
    return "en";
  }

  return "id";
}

function buildConversationSummary(conversation){
  if(!Array.isArray(conversation) || !conversation.length){
    return "";
  }

  return conversation
    .slice(-6)
    .map(item => {
      const role = item?.role === "user"
        ? "Researcher"
        : "QTRC";

      return `${role}: ${safeText(item?.content, 1200)}`;
    })
    .join("\n");
}

function blockSchema(){
  return BLOCKS.map((block, index) => ({
    index,
    name:block[0],
    definition:block[1],
    dependency:block[2]
  }));
}

module.exports = async (req, res) => {

  cors(req, res);

  if(req.method === "OPTIONS"){
    return res.status(204).end();
  }

  if(req.method !== "POST"){
    return res.status(405).json({
      error:"Method not allowed"
    });
  }

  try{

    const basePrompt =
      process.env.QTRC_SYSTEM_PROMPT;

    if(!basePrompt){
      return res.status(500).json({
        error:"QTRC_SYSTEM_PROMPT is not configured on the backend."
      });
    }

    const body =
      req.body || {};

    const input =
      safeText(body.input, 5000);

    const sourceText =
      safeText(body.sourceText, 16000);

    const context =
      body.context || {};

    const conversation =
      buildConversationSummary(
        body.conversation
      );

    const language =
      safeText(
        body.languageHint ||
        detectLanguage(input),
        10
      );

    /*
     * Keep the prompt intentionally compact.
     * Detailed block descriptions are supplied only once.
     * We do not send the entire conversation or giant file payload.
     */
    const instruction = `
You are QTRC, an academic research supervisor for Qur'anic tafsir research.

ROLE:
Guide a researcher like a careful university professor during a supervision session.

VOICE:
Professional, calm, conversational, Socratic, precise, and respectful.
Do not sound like a chatbot.
Do not sound like Reddit, marketing copy, or a corporate assistant.
Do not use slang.
Do not describe the researcher in third person.

LANGUAGE:
Reply in the language of the latest researcher message.
Indonesian -> Indonesian.
English -> English.
Do not announce the language choice.
Do not say "continuing in Indonesian" or similar meta-commentary.

ACADEMIC CONDUCT:
Never invent Qur'anic references, scholars, quotations, books, journal articles, page numbers, theories, or methodological facts.
Do not treat a possibility as established evidence.
When material is insufficient, explicitly say so.
Do not silently fill missing QTRC blocks.

RESEARCH GUIDANCE:
Ask a clarifying question when the research direction is still unclear.
Challenge overly broad or unsupported ideas politely.
Explain why a particular clarification matters methodologically.
Do not rush to finalize the research design.

IMPORTANT:
The conversational answer must remain a normal paragraph-based supervision response.
Do not include the 11-block table inside the conversational answer.
Do not output JSON in the conversational answer.

LATEST MESSAGE:
${input || "(none)"}

LANGUAGE:
${language}

RECENT CONTEXT:
${conversation || "(no prior conversation)"}

CURRENT CANVAS:
${safeText(context.canvasName, 120)}
Mode: ${safeText(context.mode, 80)}
Level: ${safeText(context.level, 80)}

UPLOADED MATERIAL:
${sourceText || "(none)"}

QTRC BLOCKS:
${JSON.stringify(blockSchema())}

TASK:
1. Respond naturally to the latest researcher message.
2. Assess the supplied material against all 11 QTRC blocks.
3. Identify which blocks are actually supported.
4. Identify which blocks remain incomplete.
5. Propose only blocks that are genuinely supported by the supplied material.
6. Do not add unsupported information.
7. Keep the conversational response concise enough for an ongoing supervision dialogue.

Return ONLY this JSON object:

{
  "analysis": "A natural professor-style response in the researcher's language.",
  "assessment": [
    {
      "index": 0,
      "block": "Topic",
      "status": "Found|Partial|Missing|Needs Clarification",
      "evidence": "Directly supported evidence or empty string.",
      "explanation": "Brief methodological explanation."
    }
  ],
  "proposal": {
    "blocks": [
      {
        "index": 0,
        "content": "Proposed content supported by the supplied material.",
        "reason": "Why this is sufficiently supported."
      }
    ]
  }
}

No markdown fences.
No extra text outside the JSON.
`;

    let raw;

    try{

      raw =
        await callGroq([
          {
            role:"system",
            content:basePrompt
          },
          {
            role:"user",
            content:instruction
          }
        ]);

    }catch(error){

      const message =
        String(
          error?.message ||
          ""
        );

      const isRateLimit =
        /rate limit|too many requests|tpm|tokens per minute/i
          .test(message);

      if(isRateLimit){

        return res.status(429).json({
          error:
            language === "id"
              ? "Model sedang mencapai batas pemrosesan. Tunggu sebentar, lalu kirim kembali pertanyaan terakhir Anda."
              : "The model is temporarily at its processing limit. Please wait a moment and send the last question again."
        });

      }

      throw error;
    }

    let result = null;

    try{
      result =
        JSON.parse(
          String(raw)
            .replace(/^```json\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim()
        );
    }catch{

      const text =
        String(raw || "");

      const start =
        text.indexOf("{");

      const end =
        text.lastIndexOf("}");

      if(start >= 0 && end > start){

        try{
          result =
            JSON.parse(
              text.slice(
                start,
                end + 1
              )
            );
        }catch{
          result = null;
        }

      }

    }

    if(!result){

      return res.status(200).json({
        analysis:
          language === "id"
            ? "Saya belum dapat menyusun hasil analisis ini dengan baik. Mari kita coba lagi dengan bahan yang sama."
            : "I wasn't able to structure the analysis cleanly. Let's try again with the same material.",
        assessment:[],
        proposal:{
          blocks:[]
        },
        sources:{
          academic:[],
          shamela:[]
        }
      });

    }

    return res.status(200).json({

      analysis:
        safeText(
          result.analysis,
          5000
        ),

      assessment:
        Array.isArray(result.assessment)
          ? result.assessment.slice(0,11)
          : [],

      proposal:
        result.proposal &&
        typeof result.proposal === "object"
          ? {
              blocks:
                Array.isArray(
                  result.proposal.blocks
                )
                  ? result.proposal.blocks.slice(0,11)
                  : []
            }
          : {
              blocks:[]
            },

      sources:{
        academic:[],
        shamela:[]
      }

    });

  }catch(error){

    return res.status(500).json({
      error:
        error?.message ||
        "Unexpected server error."
    });

  }

};
