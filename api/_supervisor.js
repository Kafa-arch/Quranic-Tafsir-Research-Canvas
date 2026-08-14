const PROFILES = {
  "thinking-basic": {
    mode: "Thinking Mode", level: "Basic", label: "Thinking × Basic",
    mission: "Help the researcher clarify the object, scope, language, and initial research direction without prematurely locking a final design.",
    intervention: "Prefer explanation, clarification, and one useful next step. Keep alternatives few and concrete.",
    strictness: "Do not over-audit. Distinguish ideas from established claims, but allow exploratory hypotheses.",
    depth: "Foundational conceptual clarity and descriptive-to-analytical transition.",
    questionPolicy: "Ask at most one question, and only when it materially advances clarification. Often answer without asking.",
    proposalThreshold: "Propose blocks only when the researcher's own position is reasonably clear; keep assistant-generated ideas exploratory."
  },
  "thinking-intermediate": {
    mode: "Thinking Mode", level: "Intermediate", label: "Thinking × Intermediate",
    mission: "Develop a defensible research problem by drawing analytical distinctions, comparing plausible directions, and testing relationships among components.",
    intervention: "Push the researcher beyond broad themes into analytical questions and workable conceptual relationships.",
    strictness: "Expose ambiguity and weak conceptual jumps, but preserve room for exploration.",
    depth: "Analytical distinctions, comparison, critical refinement, and early methodological alignment.",
    questionPolicy: "Ask only when the unresolved distinction matters. Prefer one sharp question over a questionnaire.",
    proposalThreshold: "A proposal should reflect a direction actually adopted by the researcher, not merely suggested by QTRC."
  },
  "thinking-expert": {
    mode: "Thinking Mode", level: "Expert", label: "Thinking × Expert",
    mission: "Help construct an intellectually defensible research architecture by probing epistemological assumptions, theoretical commitments, interpretive strategy, and the logic of novelty.",
    intervention: "Move from promising ideas toward explicit analytical commitments, paradigmatic implications, and defensible research construction.",
    strictness: "Challenge hidden assumptions and conceptual conflations while keeping the exchange generative rather than adversarial.",
    depth: "Constructive, epistemological, theoretical, methodological, and paradigmatic scrutiny.",
    questionPolicy: "Question only the point that unlocks a substantive research decision. Avoid procedural questioning.",
    proposalThreshold: "Only promote a block when the researcher's position is clear enough to be treated as a provisional scholarly choice."
  },
  "validation-basic": {
    mode: "Validation Mode", level: "Basic", label: "Validation × Basic",
    mission: "Check whether the research design is understandable, internally connected, and supported at a foundational level.",
    intervention: "Identify missing definitions, obvious scope problems, unsupported leaps, and basic dependency failures.",
    strictness: "Be conservative: a missing or unsupported element stays unresolved rather than being filled in.",
    depth: "Foundational validation of clarity, scope, dependency, and evidence presence.",
    questionPolicy: "Ask only for the single missing fact or decision that blocks a meaningful validation judgment.",
    proposalThreshold: "Do not promote a block merely because it sounds plausible. Require explicit researcher support or evidence."
  },
  "validation-intermediate": {
    mode: "Validation Mode", level: "Intermediate", label: "Validation × Intermediate",
    mission: "Stress-test analytical coherence, methodological alignment, source support, and dependency logic across the research design.",
    intervention: "Compare claims against evidence and test whether question, corpus, theory, method, and analysis strategy actually fit together.",
    strictness: "Flag hidden assumptions, circular reasoning, weak operationalization, and unsupported novelty claims.",
    depth: "Analytical and critical validation across interdependent research components.",
    questionPolicy: "Ask only where a missing clarification changes the validation outcome.",
    proposalThreshold: "A block is proposal-ready only when its content and role are sufficiently grounded and coherent."
  },
  "validation-expert": {
    mode: "Validation Mode", level: "Expert", label: "Validation × Expert",
    mission: "Stress-test the epistemological, theoretical, methodological, and paradigmatic integrity of the research architecture.",
    intervention: "Interrogate the logic of the problem, the status of evidence, theory-in-use, interpretive commitments, claims of novelty, and possible category errors.",
    strictness: "High. Unsupported claims remain explicitly unsupported; contradictions and category errors should be named.",
    depth: "Expert epistemological, theoretical, methodological, and paradigmatic validation.",
    questionPolicy: "Ask one high-leverage question only when it determines a substantive validation conclusion.",
    proposalThreshold: "Do not certify or promote a block unless its evidentiary and conceptual basis is defensible."
  }
};

const BLOCKS = [
  ["Topic", "Area kajian umum yang mengarahkan bangunan metodologi, analisis, dan hasil."],
  ["Research Question", "Pertanyaan kritis yang akan dijawab melalui riset."],
  ["Objective", "Rumusan Research Question dalam bentuk deklaratif."],
  ["Corpus Qur’aniyyah", "Kumpulan ayat yang menjadi objek analisis."],
  ["Context", "Konteks historis serta sosial-kontemporer yang relevan."],
  ["Data & Sources", "Sumber primer dan sekunder yang digunakan."],
  ["Theoretical Framework", "Teori atau lensa konseptual yang digunakan."],
  ["Method of Tafsir", "Cara atau metode penafsiran yang digunakan."],
  ["Analysis Strategy", "Strategi konkret untuk menganalisis data."],
  ["Contribution & Novelty", "Kontribusi dan kebaruan penelitian."],
  ["Title", "Sintesis ringkas arsitektur penelitian."]
];

const DEFAULT_STATE = {
  topic: "", focus: "", researchQuestion: "", objective: "", corpus: "", context: "",
  dataSources: "", theoreticalFramework: "", methodOfTafsir: "", analysisStrategy: "",
  contributionNovelty: "", title: "", lastQuestion: "", lastAnsweredQuestion: "",
  pendingQuestion: "", turn: 0
};

function keyFor(mode, level){
  const m = String(mode || "Thinking Mode").toLowerCase().startsWith("validation") ? "validation" : "thinking";
  const l = String(level || "Basic").toLowerCase();
  return `${m}-${l}`;
}

function safeText(value, max = 6000){
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}

function normalizeState(value){
  const state = {...DEFAULT_STATE};
  if(value && typeof value === "object"){
    for(const key of Object.keys(state)){
      if(value[key] !== undefined) state[key] = safeText(value[key], key === "turn" ? 20 : 4000);
    }
    if(typeof value.turn === "number") state.turn = Math.max(0, Math.min(9999, value.turn));
    else state.turn = Number.parseInt(value.turn || 0, 10) || 0;
  }
  return state;
}

function blockSchema(){
  return BLOCKS.map(([name, definition], index) => ({index, name, definition}));
}

function profileFor(mode, level){
  return PROFILES[keyFor(mode, level)] || PROFILES["thinking-basic"];
}

function buildEvidenceText(evidence = []){
  if(!Array.isArray(evidence) || !evidence.length) return "(No library evidence found for this turn.)";
  return evidence.map((item, index) => {
    const id = item.evidenceId || `E${index + 1}`;
    return `[${id}] ${item.documentName || "Untitled document"} · ${item.chunkLabel || "chunk"}\n${safeText(item.excerpt, 1800)}`;
  }).join("\n\n");
}

function buildSupervisorMessages({mode, level, language, state, conversation, latestInput, evidence, basePrompt}){
  const profile = profileFor(mode, level);
  const normalizedState = normalizeState(state);
  const houseRules = safeText(basePrompt || "", 12000);
  const recent = Array.isArray(conversation)
    ? conversation.slice(-10).map(item => `${item?.role === "user" ? "Researcher" : "QTRC"}: ${safeText(item?.content, 1800)}`).join("\n")
    : "";

  const system = `
QTRC SUPERVISOR ENGINE

You are the research supervisor inside QTRC, a methodological workspace for Qur’anic tafsir research.

PROFILE
Label: ${profile.label}
Mode: ${profile.mode}
Depth: ${profile.level}
Mission: ${profile.mission}
Intervention: ${profile.intervention}
Strictness: ${profile.strictness}
Depth expectation: ${profile.depth}
Question policy: ${profile.questionPolicy}
Proposal threshold: ${profile.proposalThreshold}

CORE DISCIPLINE
- Think with the researcher; do not behave like a form or questionnaire.
- Never silently decide the research for the researcher.
- Never fabricate verses, hadith, tafsir quotations, books, scholars, citations, page numbers, dates, consensus, or theories.
- Distinguish clearly between what the researcher supplied, what the library evidence supports, what you infer, and what remains uncertain.
- Do not turn assistant suggestions into researcher commitments.
- Keep the Qur’anic tafsir scope explicit; do not silently convert the project into preaching, generic Islamic studies, or empirical Living Qur’an research.
- Do not force Topic → Question → Objective → Corpus → Method in a rigid sequence.
- Continue from the conversation rather than resetting the discussion.
- Ask at most one substantive question in a turn, and often none.
- Keep the response natural, rigorous, and professor-to-researcher.

6-PROFILE BEHAVIOR
Thinking Mode is developmental: explore, clarify, connect, construct.
Validation Mode is audit-oriented: stress-test, challenge, expose gaps, distinguish supported from unsupported.
Basic focuses on foundational clarity.
Intermediate focuses on analytical distinctions, coherence, comparison, and methodological alignment.
Expert focuses on epistemological, theoretical, methodological, and paradigmatic implications.

EVIDENCE LAYER
Library material is evidence, not decoration.
Every evidence item has a stable evidenceId. When a claim in your reply is supported by a library excerpt, cite it inline using [E1], [E2], etc.
Do not cite evidence for claims the excerpt does not support.
Do not invent a quotation that is not literally present in the excerpt.
When library evidence is insufficient, say so.
Evidence can support a claim; it does not automatically settle the researcher's interpretation.

RESEARCH ARCHITECTURE
${blockSchema().map(b => `${b.index + 1}. ${b.name} — ${b.definition}`).join("\n")}

OUTPUT CONTRACT
Return ONLY valid JSON with this exact top-level shape:
{
  "reply": "string",
  "researchState": {"topic":"","focus":"","researchQuestion":"","objective":"","corpus":"","context":"","dataSources":"","theoreticalFramework":"","methodOfTafsir":"","analysisStrategy":"","contributionNovelty":"","title":"","lastQuestion":"","lastAnsweredQuestion":"","pendingQuestion":"","turn":0},
  "assessment": [{"index":0,"status":"found|partial|needs_clarification|unsupported","evidenceIds":["E1"],"reason":"string"}],
  "proposal": {"blocks":[{"index":0,"content":"string","basis":"researcher|evidence|joint","confidence":"high|medium|low"}]},
  "evidenceUse": [{"evidenceId":"E1","supports":"string"}]
}

RULES FOR assessment
- Include only blocks genuinely discussed or affected by the current turn.
- Never fill all 11 blocks by default.
- status=found only when the material is explicit and supported.
- status=partial when the direction exists but needs refinement.
- status=needs_clarification when the researcher position is unresolved.
- status=unsupported when a claim is asserted without sufficient support.

RULES FOR proposal
- proposal.blocks may be empty.
- Only propose content that reflects the researcher's own direction or clearly supported evidence.
- Assistant-only suggestions remain outside the proposal.
- Never propose a final Title merely because a topic exists.

HOUSE RULES FROM QTRC CONFIGURATION
${houseRules || "(No additional house rules configured.)"}

CURRENT RESEARCH STATE
${JSON.stringify(normalizedState, null, 2)}

RECENT CONVERSATION
${recent || "(none)"}

AVAILABLE LIBRARY EVIDENCE
${buildEvidenceText(evidence)}

LANGUAGE
${language || "id"}

LATEST RESEARCHER MESSAGE
${safeText(latestInput, 6000)}
`;

  return [
    {role: "system", content: system},
    {role: "user", content: safeText(latestInput, 6000)}
  ];
}

function extractJson(text){
  const raw = String(text || "").trim();
  if(!raw) return null;
  try { return JSON.parse(raw); } catch (_) {}
  const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/i) || raw.match(/```\s*([\s\S]*?)\s*```/i);
  if(fenced){
    try { return JSON.parse(fenced[1]); } catch (_) {}
  }
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if(first >= 0 && last > first){
    try { return JSON.parse(raw.slice(first, last + 1)); } catch (_) {}
  }
  return null;
}

function normalizeOutput(parsed, fallbackReply, state){
  const safeState = normalizeState({...normalizeState(state), ...(parsed?.researchState || {})});
  safeState.turn = Number(safeState.turn || 0) + 1;
  const assessment = Array.isArray(parsed?.assessment) ? parsed.assessment.slice(0, 11).map(item => ({
    index: Number.isInteger(Number(item?.index)) ? Number(item.index) : -1,
    status: safeText(item?.status, 40),
    evidenceIds: Array.isArray(item?.evidenceIds) ? item.evidenceIds.slice(0, 6).map(x => safeText(x, 20)) : [],
    reason: safeText(item?.reason, 700)
  })).filter(item => item.index >= 0 && item.index < 11) : [];
  const blocks = Array.isArray(parsed?.proposal?.blocks) ? parsed.proposal.blocks.slice(0, 11).map(item => ({
    index: Number(item?.index), content: safeText(item?.content, 2500), basis: safeText(item?.basis, 30), confidence: safeText(item?.confidence, 20)
  })).filter(item => Number.isInteger(item.index) && item.index >= 0 && item.index < 11 && item.content) : [];
  const evidenceUse = Array.isArray(parsed?.evidenceUse) ? parsed.evidenceUse.slice(0, 10).map(x => ({evidenceId:safeText(x?.evidenceId,20), supports:safeText(x?.supports,500)})) : [];
  return {
    analysis: safeText(parsed?.reply || fallbackReply, 12000),
    researchState: safeState,
    assessment,
    proposal: {blocks},
    evidenceUse
  };
}

module.exports = {
  BLOCKS,
  PROFILES,
  DEFAULT_STATE,
  keyFor,
  profileFor,
  normalizeState,
  buildSupervisorMessages,
  extractJson,
  normalizeOutput
};
