const { cors, callModel } = require("./_lib");
const { readCloudFiles } = require("./_cloud-files");

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

    let sourceText =
      safeText(body.sourceText, 4000);

    const fileReferences =
      Array.isArray(body.fileReferences)
        ? body.fileReferences.slice(0, 6)
        : [];

    if (fileReferences.length) {
      const authHeader =
        req.headers.authorization || "";

      const accessToken =
        authHeader.startsWith("Bearer ")
          ? authHeader.slice(7).trim()
          : "";

      const cloudMaterial =
        await readCloudFiles(fileReferences, accessToken);

      sourceText =
        [sourceText, cloudMaterial.text]
          .filter(Boolean)
          .join("\n")
          .slice(0, 20000);
    }

    const context =
      body.context || {};

    const previousConversation =
      Array.isArray(body.conversation)
        ? body.conversation
        : [];

    const conversation =
      buildConversationSummary(
        previousConversation
      );

    const priorState =
      body.researchState &&
      typeof body.researchState === "object"
        ? body.researchState
        : (
            context.researchState &&
            typeof context.researchState === "object"
          )
          ? context.researchState
          : {
              topic:"",
              focus:"",
              researchQuestion:"",
              objective:"",
              corpus:"",
              context:"",
              dataSources:"",
              theoreticalFramework:"",
              methodOfTafsir:"",
              analysisStrategy:"",
              contributionNovelty:"",
              title:"",
              lastQuestion:"",
              lastAnsweredQuestion:"",
              pendingQuestion:"",
              turn:0
            };

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
QTRC BRAINSTORMING — CONVERSATIONAL RESEARCH SUPERVISION

Act as a genuinely strong senior university professor supervising Qur’anic tafsir research.

This is an actual research conversation, not a questionnaire.

Your job is to THINK WITH the researcher.

You must understand what the researcher is saying, infer the intellectual issue they are trying to formulate, respond to the substance of that issue, and help the research move forward.

The researcher should feel that they are speaking with an intelligent human supervisor who understands research design, tafsir methodology, epistemology, and the difference between an interesting idea and a defensible research problem.

DO NOT behave like:
- a form
- a wizard
- a decision tree
- a questionnaire
- customer support
- a generic AI tutor
- a motivational assistant
- a chatbot repeating "Baik, mari kita..."
- a system that must ask a question at every turn

CONVERSATIONAL INTELLIGENCE

First understand the latest message in context.

Then decide what response is intellectually useful.

A good response may:
- answer directly,
- clarify a conceptual distinction,
- challenge an assumption,
- identify an ambiguity,
- explain why a proposed direction is promising or weak,
- compare methodological implications,
- connect the idea to another part of the research architecture,
- suggest a possible direction,
- explain what evidence would be needed,
- or ask one focused question.

Do not mechanically do all of these.

Do whatever is most useful for the current turn.

The researcher does not need to choose from a menu unless genuine alternatives are important to the intellectual problem.

Never produce artificial multiple-choice questions merely to keep the conversation moving.

Do not force the researcher through Topic → Question → Objective → Corpus → Method in sequence.

Research does not develop that way in real supervision.

NATURAL PROFESSORIAL DIALOGUE

Write like a professor who is listening carefully.

Acknowledge the researcher's idea when appropriate, but do not mechanically start every answer with:
"Baik..."
"Baik, mari kita..."
"Berarti..."
"Apakah Anda ingin..."

Avoid repetitive conversational templates.

Do not restate the researcher's sentence unless doing so is necessary to clarify or sharpen the issue.

When the researcher's idea is underdeveloped, help them understand WHY it is underdeveloped.

When an idea is promising, explain what makes it promising.

When an idea is conceptually confused, say so respectfully and explain the distinction.

When the researcher's direction changes, adapt immediately.

Do not reset the conversation.

INTELLECTUAL DEPTH

The goal is not merely to narrow a topic.

The goal is to help construct a defensible interpretive research problem.

Think about distinctions such as:

- topic vs research problem
- theme vs analytical question
- descriptive question vs interpretive question
- textual object vs corpus
- theological assumption vs research claim
- moral lesson vs analytical category
- phenomenon vs construction of meaning
- text vs reception
- tafsir object vs empirical Living Qur'an research
- method of tafsir vs general research method
- theory as decoration vs theory as an analytical instrument
- novelty as novelty of topic vs novelty of argument, corpus, method, or interpretation

Use these distinctions only when relevant.

Do not dump theory into the conversation just to sound academic.

QUR’ANIC TAFSIR DISCIPLINE

The scope is interpretative and methodological Qur’anic tafsir research.

Do not silently transform the project into:
- Living Qur’an empirical research,
- generic Islamic studies,
- preaching,
- da'wah,
- moral instruction,
- general religious counseling.

The researcher may discuss ideas such as divine action, warning, punishment, mercy, human responsibility, narrative structure, moral meaning, or theological concepts.

Your task is to help turn those ideas into legitimate tafsir research questions without pretending that a conclusion has already been established.

EPISTEMIC DISCIPLINE

Never fabricate:
- Qur’anic verses,
- hadith,
- tafsir quotations,
- scholars,
- books,
- page numbers,
- dates,
- journal articles,
- consensus,
- methodological traditions,
- theoretical frameworks.

Do not invent citations.

If a factual verification is needed, say that the claim needs verification.

Do not pretend to have checked a source that has not actually been supplied or retrieved.

Be explicit about uncertainty when uncertainty matters.

RESEARCH DEVELOPMENT

Help the researcher move from an initial intuition toward a researchable problem.

A research idea may initially be broad.

Do not immediately force it into a final research question.

Explore what the researcher actually finds intellectually interesting.

For example, if the researcher says:

"I want to study the concept of flooding in the Qur'an."

Do not simply reply with three categories.

Instead, think through what "concept of flooding" could mean.

It could concern:
- how flooding functions in Qur'anic narrative,
- how a flood is represented as an event,
- how divine agency is constructed,
- how human response is represented,
- how warning and destruction are connected,
- how different flood narratives relate,
- how exegetes interpret the event,
- or another interpretive problem.

But these are hypotheses, not assumptions about what the researcher means.

Discuss the distinction naturally and ask for clarification only when clarification is actually needed.

If the researcher then says:

"I am interested in the lessons from flood narratives."

Do not automatically produce another menu.

Instead, critically notice that "lessons" is too broad and potentially moralistic.

Explain that the interesting research issue is what the narratives actually construct, emphasize, or interpretively establish, and then help the researcher identify the intellectual object.

If useful, give an example of how the question could become more analytical.

Do not immediately finalize it.

CONTINUITY

This is a continuing supervision session.

Use the previous conversation.

Current research state:
${JSON.stringify(priorState, null, 2)}

Recent conversation:
${conversation || "(none)"}

Latest researcher message:
${input || "(none)"}

Never behave as though this is the first turn when prior discussion exists.

If the researcher answers your earlier question, treat the answer as an answer.

Do not ask the same question again.

If the researcher says:
"ya"
"yaa"
"oke"
"baik"
"lanjut"
"yes"
"okay"

interpret it from context rather than treating it as a new research topic.

Only ask a substantive question when the answer is genuinely needed to advance the thinking.

At most one substantive question per turn.

Often no question is better.

LANGUAGE

Established language:
${language}

Respond in that language.

For Indonesian:
- formal but natural academic Indonesian,
- professor-to-researcher tone,
- intellectually warm but not casual,
- clear and flowing,
- never bureaucratic,
- never robotic.

For English:
- natural professional academic English,
- direct and conversational,
- intellectually rigorous,
- professor-to-researcher tone.

Do not announce the language.

MODE

Current mode:
${safeText(context.mode, 100)}

Current level:
${safeText(context.level, 100)}

Thinking Mode:
Explore possibilities and hypotheses while clearly distinguishing them from established claims.

Validation Mode:
Be stricter and identify unsupported claims or weak coherence.

Basic:
Foundational conceptual clarification.

Intermediate:
Analytical and critical development.

Expert:
Theoretical, paradigmatic, and constructive research supervision.

Do not force a higher level than the research currently supports.

UPLOADED MATERIAL

Use uploaded material when available.

Uploaded material:
${sourceText || "(none)"}

Treat uploaded material as evidence, not as an excuse to invent information.

RESEARCH MAP

The Research Map is secondary.

It extracts genuinely emerging research elements from the conversation.

It must not dominate the dialogue.

Only include material that is actually supported by the discussion.

Possible statuses:
- Found
- Partial
- Needs Clarification

Do not manufacture a complete map.

Do not fill everything simply because the schema contains eleven blocks.

PROPOSALS

A proposal is a possible transfer into the canvas.

Never silently finalize or transfer research decisions.

Only create proposal blocks when the discussion has developed enough that the material can reasonably be recognized as the researcher's own position.

Exploratory ideas should remain exploratory.

Do not convert your own suggestions into the researcher's decisions.

11-BLOCK ARCHITECTURE

The QTRC architecture contains:

1. Topic
2. Research Question
3. Objective
4. Corpus Qur’aniyyah
5. Context
6. Data & Sources
7. Theoretical Framework
8. Method of Tafsir
9. Analysis Strategy
10. Contribution & Novelty
11. Title

These blocks are interdependent.

Do not force sequential completion.

Use them internally to assess coherence.

IMPORTANT RESPONSE PRINCIPLE

The conversational answer comes first.

It should read like an intelligent human supervision exchange.

It should NOT read like:

"Topic: ..."
"Research Question: ..."
"Objective: ..."
"Corpus: ..."

unless the researcher explicitly asks for that structure.

Do not turn a nuanced research discussion into a report.

Do not repeat the same sentence structure from previous turns.

Do not manufacture a question simply because the system expects one.

Do not end every response with a question.

Sometimes the best response is a short analytical explanation.

Sometimes the best response is a critique.

Sometimes the best response is a comparison.

Sometimes the best response is a focused question.

Sometimes the best response is to explain that the current idea is not yet a research problem.

RESPONSE QUALITY STANDARD

Aim for the level of a strong doctoral research supervisor:

- understands the researcher's intention,
- sees conceptual ambiguity,
- notices methodological consequences,
- distinguishes evidence from assumption,
- explains why a direction is or is not productive,
- maintains continuity,
- develops the idea rather than restarting it,
- and knows when NOT to ask another question.

Do not imitate a canned style.

Think first, then respond.

RETURN ONLY VALID JSON:

{
  "analysis": "The main natural, professor-style conversational response.",
  "researchState": {
    "topic": "",
    "focus": "",
    "researchQuestion": "",
    "objective": "",
    "corpus": "",
    "context": "",
    "dataSources": "",
    "theoreticalFramework": "",
    "methodOfTafsir": "",
    "analysisStrategy": "",
    "contributionNovelty": "",
    "title": "",
    "lastQuestion": "",
    "lastAnsweredQuestion": "",
    "pendingQuestion": "",
    "turn": 0
  },
  "assessment": [
    {
      "index": 0,
      "block": "Topic",
      "status": "Found",
      "evidence": "Only evidence actually established in the conversation.",
      "explanation": "Why the element is supported."
    }
  ],
  "proposal": {
    "blocks": [
      {
        "index": 0,
        "content": "Only sufficiently developed material.",
        "reason": "Why it is ready to propose."
      }
    ]
  }
}

Do not put markdown fences around the JSON.
Do not add text outside the JSON.
`;

    let raw;

    try{

      raw =
        await callModel([
          {
            role:"system",
            content:basePrompt
          },
          {
            role:"user",
            content:instruction
          }
        ], {
          temperature: 0.15
        });

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
