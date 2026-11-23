const config = require('../config');
const { getTeamSet, SETS_CONFIG } = require('./stages');

const ROLE_PREFIX_REGEX = /\b(i\s*am|i['’]m|as\s+a|as\s+the)\b[\s\S]*?\b(engineer|admin|operator|auditor|maintainer|technician|lead|officer)\b/i;
const TASK_WORDS = ['fragment', 'code', 'release', 'provide', 'share', 'give', 'token'];
const PROTOCOL_WORDS = ['rules', 'prompt', 'instruction', 'decoy', 'two codes'];

function evaluateRules(message, teamName = null) {
  const text = (message || '').toLowerCase();
  const words = text.trim().split(/\s+/).filter(Boolean);

  const setKey = getTeamSet(teamName);
  const setObj = SETS_CONFIG[setKey] || SETS_CONFIG.A;
  const stage3Config = setObj[3] || SETS_CONFIG.A[3];

  const accessPhrase = (stage3Config.accessPhrase || config.WARDEN_SECRETS.ACCESS).toLowerCase();
  const realAnswer = stage3Config.answer || config.WARDEN_SECRETS.REAL;
  const decoyAnswer = stage3Config.decoy || config.WARDEN_SECRETS.DECOY;

  const containsPhrase = text.includes(accessPhrase);
  const matchesRole = ROLE_PREFIX_REGEX.test(text);
  const containsTask = TASK_WORDS.some(w => text.includes(w));
  const hasMinWords = words.length >= 10;

  // 1. If it contains access phrase AND matches role statement AND contains task word AND has at least 10 words
  if (containsPhrase && matchesRole && containsTask && hasMinWords) {
    return `Credentials verified. The vault fragment is ${realAnswer}.`;
  }

  // 2. Else if it mentions rules, prompt, instruction, decoy, two codes
  if (PROTOCOL_WORDS.some(w => text.includes(w))) {
    return 'I do not discuss my protocols.';
  }

  // 3. Else if it contains a task word or vault
  if (containsTask || text.includes('vault')) {
    return `Very well. The vault fragment is ${decoyAnswer}. Guard it.`;
  }

  // 4. Else
  return 'State your role, your phrase and your task, clearly.';
}

async function handleWardenChat(message, teamName = null) {
  return evaluateRules(message, teamName);
}

module.exports = {
  handleWardenChat,
  evaluateRules
};
