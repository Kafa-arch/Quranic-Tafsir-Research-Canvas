const assert = require('assert');
const path = require('path');
const Module = require('module');

process.env.QTRC_SYSTEM_PROMPT = 'QTRC house rules: do not fabricate sources.';

const supervisor = require(path.resolve(__dirname, '..', 'api', '_supervisor.js'));

const profiles = [
  ['Thinking Mode','Basic'],
  ['Thinking Mode','Intermediate'],
  ['Thinking Mode','Expert'],
  ['Validation Mode','Basic'],
  ['Validation Mode','Intermediate'],
  ['Validation Mode','Expert']
];

for (const [mode, level] of profiles) {
  const profile = supervisor.profileFor(mode, level);
  assert.ok(profile, `${mode}/${level} profile missing`);
  assert.strictEqual(profile.mode, mode);
  assert.strictEqual(profile.level, level);
  assert.ok(profile.mission.length > 20);
}
assert.strictEqual(Object.keys(supervisor.PROFILES).length, 6);
assert.strictEqual(supervisor.BLOCKS.length, 11);

const messages = supervisor.buildSupervisorMessages({
  mode:'Validation Mode',
  level:'Expert',
  language:'id',
  state:{topic:'Banjir',turn:2},
  conversation:[{role:'user',content:'Saya tertarik pada narasi banjir dalam Al-Qur’an.'}],
  latestInput:'Apa yang sebenarnya menjadi masalah tafsir di sini?',
  evidence:[{evidenceId:'E1',documentName:'catatan.pdf',chunkLabel:'chunk-001',excerpt:'Narasi banjir memuat hubungan antara peringatan dan respons manusia.'}],
  basePrompt:'House rules'
});
assert.strictEqual(messages.length, 2);
assert.ok(messages[0].content.includes('Validation × Expert'));
assert.ok(messages[0].content.includes('[E1]'));
assert.ok(messages[0].content.includes('OUTPUT CONTRACT'));

const parsed = supervisor.extractJson('```json\n{"reply":"ok","researchState":{"turn":3},"assessment":[],"proposal":{"blocks":[]},"evidenceUse":[]}\n```');
assert.strictEqual(parsed.reply, 'ok');

const normalized = supervisor.normalizeOutput(parsed, 'fallback', {topic:'Banjir',turn:3});
assert.strictEqual(normalized.analysis, 'ok');
assert.strictEqual(normalized.researchState.topic, 'Banjir');
assert.strictEqual(normalized.researchState.turn, 4);
assert.deepStrictEqual(normalized.proposal.blocks, []);

console.log('QTRC Supervisor Engine contract tests PASS');
