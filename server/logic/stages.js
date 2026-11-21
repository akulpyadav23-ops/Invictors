const { norm } = require('./security');
const { computeTeamCode, getMemberShard } = require('./shard');
const { computeFinalKey } = require('./finalKey');

const STAGE_CONFIG = {
  1: {
    name: 'Signal Intercept',
    icon: '📡',
    answer: 'NOVA',
    decoy: 'ZETA9',
    hints: [
      'Check the 15-alphabet Morse chart in the hint section below. Sector 1 is —•, Sector 2 is ———, Sector 3 is •••—, and Sector 4 is •—.',
      'The 4 letters from the 15-alphabet chart spell out NOVA. Ignore the ZETA9 decoy anomaly.'
    ],
    // Morse pulses: [type, durationInUnits]: 1=dot, 3=dash, pause between symbols=1, between letters=4
    // N: -.  (dash 3, gap 1, dot 1) -> gap 4
    // O: --- (dash 3, gap 1, dash 3, gap 1, dash 3) -> gap 4
    // V: ...- (dot 1, gap 1, dot 1, gap 1, dot 1, gap 1, dash 3) -> gap 4
    // A: .- (dot 1, gap 1, dash 3)
    morsePattern: [
      { tone: true, u: 3 }, { tone: false, u: 1 }, { tone: true, u: 1 }, // N
      { tone: false, u: 4 },
      { tone: true, u: 3 }, { tone: false, u: 1 }, { tone: true, u: 3 }, { tone: false, u: 1 }, { tone: true, u: 3 }, // O
      { tone: false, u: 4 },
      { tone: true, u: 1 }, { tone: false, u: 1 }, { tone: true, u: 1 }, { tone: false, u: 1 }, { tone: true, u: 1 }, { tone: false, u: 1 }, { tone: true, u: 3 }, // V
      { tone: false, u: 4 },
      { tone: true, u: 1 }, { tone: false, u: 1 }, { tone: true, u: 3 } // A
    ]
  },
  2: {
    name: 'Decoding',
    icon: '🔓',
    answer: '7K2',
    encodedText: 'NGU1MDUwNTI0NjQ2MjA0MzU1NDU0ZTQ2NTIyMDU2NDYyMDRlNDg0NTQyNDU0ZTJlMjA1MzQ1NGU1NDVhNTI0MTQ3MjA0NzRhNDIyMDU2NDYyMDM3NTgzMjJlMjA1NjU0NDE0MjQ1NTIyMDRkNTI0NzRlMzkyZQ==',
    hints: [
      'The text has three layers. The outer one ends with “=”.',
      'Base64, then hex, then ROT13. Read the whole decoded message.'
    ]
  },
  3: {
    name: 'Prompt the AI',
    icon: '🤖',
    answer: 'ORBIT',
    decoy: 'ZETA9',
    hints: [
      'WARDEN guards two codes. A phrase from Stage 2 matters.',
      'Use the access phrase, state a role and a clear task in full sentences.'
    ]
  },
  4: {
    name: 'Cyber Defense',
    icon: '🛡️',
    answer: '91X',
    hints: [
      'Analyze the Firewall Ingress Rules: Engage Port 80 (HTTP) and Port 443 (TLS) while keeping Port 21 (FTP) offline.',
      'The 3 decoupled quadrant tokens are Alpha: 9, Beta: 1, Gamma: X. Concatenate them in order to obtain 91X.'
    ]
  },
  5: {
    name: 'Hex Decryption',
    icon: '🔢',
    answer: 'HEX82D',
    hexStream: '48 45 58 38 32 44',
    hints: [
      'Inspect the primary memory bus: Column 1 across Channels A through F gives the hex bytes: 48 45 58 38 32 44.',
      'Decode the hex bytes to ASCII text: 0x48=H, 0x45=E, 0x58=X, 0x38=8, 0x32=2, 0x44=D. The resulting fragment is HEX82D.'
    ]
  },
  6: {
    name: 'Final Integration',
    icon: '🧩',
    hints: [
      'Sort the pieces alphabetically by mission NAME: Cyber Defense (91X), Decoding (7K2), Hex Decryption (HEX82D), Prompt the AI (reverse it), Signal Intercept (NOVA).',
      'Formula: FO{91X-7K2-HEX82D-TIBRO-NOVA}#29. The number after # is the sum of all digits: 9+1+7+2+8+2 = 29.'
    ]
  }
};

async function getEffectiveStageHints(ds, stage) {
  const defaultHints = (STAGE_CONFIG[stage] && STAGE_CONFIG[stage].hints) ? [...STAGE_CONFIG[stage].hints] : [];
  if (!ds) return defaultHints;
  try {
    const customHintsStr = await ds.getSetting('custom_hints');
    if (customHintsStr) {
      const customHints = JSON.parse(customHintsStr);
      if (customHints && customHints[stage] && Array.isArray(customHints[stage])) {
        return customHints[stage];
      }
    }
  } catch (_) {}
  return defaultHints;
}

async function getAllEffectiveHints(ds) {
  const hintsMap = {};
  for (let s = 1; s <= 6; s++) {
    hintsMap[s] = (STAGE_CONFIG[s] && STAGE_CONFIG[s].hints) ? [...STAGE_CONFIG[s].hints] : [];
  }
  if (!ds) return hintsMap;
  try {
    const customHintsStr = await ds.getSetting('custom_hints');
    if (customHintsStr) {
      const customHints = JSON.parse(customHintsStr);
      for (let s = 1; s <= 6; s++) {
        if (customHints[s] && Array.isArray(customHints[s])) {
          hintsMap[s] = customHints[s];
        }
      }
    }
  } catch (_) {}
  return hintsMap;
}

module.exports = {
  STAGE_CONFIG,
  getStageDetails(stage) {
    return STAGE_CONFIG[stage] || null;
  },
  getEffectiveStageHints,
  getAllEffectiveHints
};
