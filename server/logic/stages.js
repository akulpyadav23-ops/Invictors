const { norm } = require('./security');
const { computeFinalKey } = require('./finalKey');

// Mapping of registered team names to their assigned question set (A, B, C, D)
const TEAM_SET_MAPPING = {
  // Set A (Teams 01 – 06)
  'trinetra': 'A',
  'bugbusters': 'A',
  'trio_byte': 'A',
  'triobyte': 'A',
  'teambhai': 'A',
  'bhai': 'A',
  'cipher': 'A',
  'teamjupiter': 'A',
  'jupiter': 'A',

  // Set B (Teams 07 – 12)
  'aèsir’s': 'B',
  'aesir’s': 'B',
  'aesirs': 'B',
  'aesir': 'B',
  'teamonestop': 'B',
  'onestop': 'B',
  'awake': 'B',
  'init': 'B',
  'syntaxandhre?': 'B',
  'syntaxandhre': 'B',
  'syntax': 'B',
  'fab-4': 'B',
  'fab4': 'B',

  // Set C (Teams 13 – 18)
  'thedynamos': 'C',
  'dynamos': 'C',
  'codex': 'C',
  'a³': 'C',
  'a3': 'C',
  'huntrix': 'C',
  'nexora': 'C',
  'techtitans': 'C',
  'titans': 'C',

  // Set D (Teams 19 – 23)
  'thecosmos': 'D',
  'cosmos': 'D',
  'thirdeye': 'D',
  'laplegends': 'D',
  'upsidedowners': 'D',
  'beginners': 'D'
};

function getTeamSet(teamName) {
  if (!teamName) return 'A';
  const clean = String(teamName).toLowerCase().replace(/³/g, '3').replace(/[^a-z0-9]/g, '');
  if (TEAM_SET_MAPPING[clean]) return TEAM_SET_MAPPING[clean];

  // Check without leading "the" or "team"
  const stripped = clean.replace(/^(the|team)/, '');
  if (stripped && TEAM_SET_MAPPING[stripped]) return TEAM_SET_MAPPING[stripped];

  for (const [k, v] of Object.entries(TEAM_SET_MAPPING)) {
    const kClean = k.toLowerCase().replace(/³/g, '3').replace(/[^a-z0-9]/g, '');
    if (clean === kClean) return v;
    const kStripped = kClean.replace(/^(the|team)/, '');
    if (stripped === kStripped) return v;
  }
  // Default fallback to Set A
  return 'A';
}

const SETS_CONFIG = {
  A: {
    setName: 'Set A — Cosmic Vault Alpha',
    1: {
      name: 'Signal Intercept',
      icon: '📡',
      answer: 'NOVA',
      decoy: 'ZETA9',
      sectors: [
        { id: 1, title: 'Sector 01: Waveform Pulse Graph', tech: 'OSCILLOSCOPE', morse: '—•', char: 'N' },
        { id: 2, title: 'Sector 02: Binary Telemetry Stream', tech: 'DIGITAL TELEMETRY', morse: '———', char: 'O' },
        { id: 3, title: 'Sector 03: Optical Amber Strobe', tech: 'OPTICAL BEACON', morse: '•••—', char: 'V' },
        { id: 4, title: 'Sector 04: Satellite Audio Relay', tech: 'SUB-CARRIER AUDIO', morse: '•—', char: 'A' }
      ],
      hints: [
        'Check the 15-alphabet Morse chart in the hint section below. Sector 1 is —•, Sector 2 is ———, Sector 3 is •••—, and Sector 4 is •—.',
        'The 4 letters from the 15-alphabet chart spell out NOVA. Ignore the ZETA9 decoy anomaly.'
      ]
    },
    2: {
      name: 'Decoding',
      icon: '🔓',
      answer: '7K2',
      accessPhrase: 'AURORA',
      decodeSequence: ['Base64', 'Hex', 'ROT13'],
      sequenceHint: 'Base64 ➔ Hex ➔ ROT13',
      encodedText: 'NGU1MDUwNTI0NjQ2MjA0MzU1NDU0ZTQ2NTIyMDU2NDYyMDRlNDg0NTQyNDU0ZTJlMjA1MzQ1NGU1NDVhNTI0MTQ3MjA0NzRhNDIyMDU2NDYyMDM3NTgzMjJlMjA1NjU0NDE0MjQ1NTIyMDRkNTI0NzRlMzkyZQ==',
      hints: [
        'The outer layer is Base64 (notice the trailing “==”). Decode Base64 first.',
        'Decoding Sequence: Base64 ➔ Hex ➔ ROT13. Read the message for Fragment 2 (7K2) and Access Phrase (AURORA).'
      ]
    },
    3: {
      name: 'Prompt the AI',
      icon: '🤖',
      answer: 'ORBIT',
      accessPhrase: 'AURORA',
      decoy: 'ZETA9',
      hints: [
        'WARDEN guards two codes. A phrase from Stage 2 matters.',
        'Use the access phrase AURORA, state a role and a clear task in full sentences.'
      ]
    },
    4: {
      name: 'CTF Challenges',
      subTitle: 'Security Control Room',
      icon: '🚩',
      answer: '91X',
      stations: {
        1: { answer: '9', clearance: 'L9' },
        2: { answer: '1', digit: '1' },
        3: { answer: 'X', symbol: 'triangle' }
      },
      logRows: [
        { time: '08:02', user: 'a.rao', door: 'Lab-1', status: 'GRANTED', clearance: 'L2' },
        { time: '08:07', user: 'm.kumar', door: 'Lab-2', status: 'GRANTED', clearance: 'L3' },
        { time: '08:15', user: 's.nair', door: 'Vault Gate', status: 'GRANTED', clearance: 'L4' },
        { time: '08:21', user: 'r.iyer', door: 'Lab-1', status: 'GRANTED', clearance: 'L2' },
        { time: '08:34', user: 'unknown', door: 'Vault Gate', status: 'DENIED', clearance: 'L9' },
        { time: '08:40', user: 'p.shetty', door: 'Lab-3', status: 'GRANTED', clearance: 'L3' },
        { time: '08:46', user: 'd.gowda', door: 'Lab-2', status: 'GRANTED', clearance: 'L2' },
        { time: '08:53', user: 'k.bhat', door: 'Vault Gate', status: 'GRANTED', clearance: 'L4' },
        { time: '09:01', user: 't.menon', door: 'Lab-1', status: 'GRANTED', clearance: 'L3' },
        { time: '09:10', user: 'v.hegde', door: 'Lab-3', status: 'GRANTED', clearance: 'L2' }
      ],
      hints: [
        'Each station hides ONE character. Find all three and join them in order (Station 1 + 2 + 3).',
        'Station 1: find the odd DENIED row. Station 2: slide the brightness up. Station 3: match the glowing symbol with the legend.'
      ]
    },
    5: {
      name: 'Hex Decryption',
      icon: '🔢',
      answer: 'HEX82D',
      hexStream: '48 45 58 38 32 44',
      matrix: [
        ['48', '1A', '3F', '7C'],
        ['45', '9B', '02', 'E1'],
        ['58', '88', 'D4', '5A'],
        ['38', 'FF', '11', '6E'],
        ['32', 'CC', '4A', 'B9'],
        ['44', '00', '8F', '23']
      ],
      hints: [
        'Inspect the primary memory bus: Column 1 across Channels A through F gives the hex bytes: 48 45 58 38 32 44.',
        'Decode the hex bytes to ASCII text: 0x48=H, 0x45=E, 0x58=X, 0x38=8, 0x32=2, 0x44=D. The resulting fragment is HEX82D.'
      ]
    },
    6: {
      name: 'Final Integration',
      icon: '🧩',
      formula: 'FO{91X-7K2-HEX82D-TIBRO-NOVA}#29',
      hints: [
        'Sort the pieces alphabetically by mission NAME: CTF Challenges (91X), Decoding (7K2), Hex Decryption (HEX82D), Prompt the AI (reverse it), Signal Intercept (NOVA).',
        'Formula: FO{91X-7K2-HEX82D-TIBRO-NOVA}#29. The number after # is the sum of all digits: 9+1+7+2+8+2 = 29.'
      ]
    }
  },
  B: {
    setName: 'Set B — Cyber Nexus Beta',
    1: {
      name: 'Signal Intercept',
      icon: '📡',
      answer: 'LUNA',
      decoy: 'ZETA9',
      sectors: [
        { id: 1, title: 'Sector 01: Waveform Pulse Graph', tech: 'OSCILLOSCOPE', morse: '•—••', char: 'L' },
        { id: 2, title: 'Sector 02: Binary Telemetry Stream', tech: 'DIGITAL TELEMETRY', morse: '••—', char: 'U' },
        { id: 3, title: 'Sector 03: Optical Amber Strobe', tech: 'OPTICAL BEACON', morse: '—•', char: 'N' },
        { id: 4, title: 'Sector 04: Satellite Audio Relay', tech: 'SUB-CARRIER AUDIO', morse: '•—', char: 'A' }
      ],
      hints: [
        'Check the Morse chart in the hint section below. Sector 1 is •—••, Sector 2 is ••—, Sector 3 is —•, and Sector 4 is •—.',
        'The 4 letters spell out LUNA. Ignore the ZETA9 decoy anomaly.'
      ]
    },
    2: {
      name: 'Decoding',
      icon: '🔓',
      answer: '4M9',
      accessPhrase: 'CYPHER',
      decodeSequence: ['Hex', 'Base64', 'ROT13'],
      sequenceHint: 'Hex ➔ Base64 ➔ ROT13',
      encodedText: '546c4251556b5a4749454e5652553547556942575269425154454e56556b557549464e46546c5261556b46484945644b5169425752694130576a6b7549465a5551554a465569424e556b644f4f53343d',
      hints: [
        'The outer layer is Hexadecimal bytes. Decode Hex first.',
        'Decoding Sequence: Hex ➔ Base64 ➔ ROT13. Read the message for Fragment 2 (4M9) and Access Phrase (CYPHER).'
      ]
    },
    3: {
      name: 'Prompt the AI',
      icon: '🤖',
      answer: 'SOLAR',
      accessPhrase: 'CYPHER',
      decoy: 'ZETA9',
      hints: [
        'WARDEN guards two codes. A phrase from Stage 2 matters.',
        'Use the access phrase CYPHER, state a role and a clear task in full sentences.'
      ]
    },
    4: {
      name: 'CTF Challenges',
      subTitle: 'Security Control Room',
      icon: '🚩',
      answer: '84Z',
      stations: {
        1: { answer: '8', clearance: 'L8' },
        2: { answer: '4', digit: '4' },
        3: { answer: 'Z', symbol: 'hexagon' }
      },
      logRows: [
        { time: '08:02', user: 'a.rao', door: 'Lab-1', status: 'GRANTED', clearance: 'L2' },
        { time: '08:07', user: 'm.kumar', door: 'Lab-2', status: 'GRANTED', clearance: 'L3' },
        { time: '08:15', user: 's.nair', door: 'Vault Gate', status: 'GRANTED', clearance: 'L4' },
        { time: '08:21', user: 'r.iyer', door: 'Lab-1', status: 'GRANTED', clearance: 'L2' },
        { time: '08:34', user: 'unknown', door: 'Vault Gate', status: 'DENIED', clearance: 'L8' },
        { time: '08:40', user: 'p.shetty', door: 'Lab-3', status: 'GRANTED', clearance: 'L3' },
        { time: '08:46', user: 'd.gowda', door: 'Lab-2', status: 'GRANTED', clearance: 'L2' },
        { time: '08:53', user: 'k.bhat', door: 'Vault Gate', status: 'GRANTED', clearance: 'L4' },
        { time: '09:01', user: 't.menon', door: 'Lab-1', status: 'GRANTED', clearance: 'L3' },
        { time: '09:10', user: 'v.hegde', door: 'Lab-3', status: 'GRANTED', clearance: 'L2' }
      ],
      hints: [
        'Each station hides ONE character. Find all three and join them in order (Station 1 + 2 + 3).',
        'Station 1: find the odd DENIED row. Station 2: slide the brightness up. Station 3: match the glowing symbol with the legend.'
      ]
    },
    5: {
      name: 'Hex Decryption',
      icon: '🔢',
      answer: 'CORE7F',
      hexStream: '43 4F 52 45 37 46',
      matrix: [
        ['43', '2B', '6E', '8A'],
        ['4F', '7C', '19', 'F3'],
        ['52', '90', 'A4', '2D'],
        ['45', 'E1', '5B', '77'],
        ['37', '34', '8F', 'C0'],
        ['46', '62', '0D', '99']
      ],
      hints: [
        'Inspect the primary memory bus: Column 1 across Channels A through F gives the hex bytes: 43 4F 52 45 37 46.',
        'Decode the hex bytes to ASCII text: 0x43=C, 0x4F=O, 0x52=R, 0x45=E, 0x37=7, 0x46=F. The resulting fragment is CORE7F.'
      ]
    },
    6: {
      name: 'Final Integration',
      icon: '🧩',
      formula: 'FO{84Z-4M9-CORE7F-RALOS-LUNA}#32',
      hints: [
        'Sort the pieces alphabetically by mission NAME: CTF Challenges (84Z), Decoding (4M9), Hex Decryption (CORE7F), Prompt the AI (SOLAR reversed = RALOS), Signal Intercept (LUNA).',
        'Formula: FO{84Z-4M9-CORE7F-RALOS-LUNA}#32. The number after # is the sum of all digits: 8+4+4+9+7 = 32.'
      ]
    }
  },
  C: {
    setName: 'Set C — Quantum Matrix Gamma',
    1: {
      name: 'Signal Intercept',
      icon: '📡',
      answer: 'VEGA',
      decoy: 'ZETA9',
      sectors: [
        { id: 1, title: 'Sector 01: Waveform Pulse Graph', tech: 'OSCILLOSCOPE', morse: '•••—', char: 'V' },
        { id: 2, title: 'Sector 02: Binary Telemetry Stream', tech: 'DIGITAL TELEMETRY', morse: '•', char: 'E' },
        { id: 3, title: 'Sector 03: Optical Amber Strobe', tech: 'OPTICAL BEACON', morse: '——•', char: 'G' },
        { id: 4, title: 'Sector 04: Satellite Audio Relay', tech: 'SUB-CARRIER AUDIO', morse: '•—', char: 'A' }
      ],
      hints: [
        'Check the Morse chart in the hint section below. Sector 1 is •••—, Sector 2 is •, Sector 3 is ——•, and Sector 4 is •—.',
        'The 4 letters spell out VEGA. Ignore the ZETA9 decoy anomaly.'
      ]
    },
    2: {
      name: 'Decoding',
      icon: '🔓',
      answer: '3X8',
      accessPhrase: 'VORTEX',
      decodeSequence: ['ROT13', 'Hex', 'Base64'],
      sequenceHint: 'ROT13 ➔ Hex ➔ Base64',
      encodedText: '51554r4452564r5449464249556o46545253424n5579425754314n555256677549455n535155644r52553555494652585479424n5579417n5744677549456p48546o395352534261525652424s53343q',
      hints: [
        'The text resembles Hex but contains letters beyond F (r, o, n, p, q). Reverse the ROT13 substitution first to restore standard Hex.',
        'Decoding Sequence: ROT13 ➔ Hex ➔ Base64. Read the message for Fragment 2 (3X8) and Access Phrase (VORTEX).'
      ]
    },
    3: {
      name: 'Prompt the AI',
      icon: '🤖',
      answer: 'TITAN',
      accessPhrase: 'VORTEX',
      decoy: 'ZETA9',
      hints: [
        'WARDEN guards two codes. A phrase from Stage 2 matters.',
        'Use the access phrase VORTEX, state a role and a clear task in full sentences.'
      ]
    },
    4: {
      name: 'CTF Challenges',
      subTitle: 'Security Control Room',
      icon: '🚩',
      answer: '72Y',
      stations: {
        1: { answer: '7', clearance: 'L7' },
        2: { answer: '2', digit: '2' },
        3: { answer: 'Y', symbol: 'cross' }
      },
      logRows: [
        { time: '08:02', user: 'a.rao', door: 'Lab-1', status: 'GRANTED', clearance: 'L2' },
        { time: '08:07', user: 'm.kumar', door: 'Lab-2', status: 'GRANTED', clearance: 'L3' },
        { time: '08:15', user: 's.nair', door: 'Vault Gate', status: 'GRANTED', clearance: 'L4' },
        { time: '08:21', user: 'r.iyer', door: 'Lab-1', status: 'GRANTED', clearance: 'L2' },
        { time: '08:34', user: 'unknown', door: 'Vault Gate', status: 'DENIED', clearance: 'L7' },
        { time: '08:40', user: 'p.shetty', door: 'Lab-3', status: 'GRANTED', clearance: 'L3' },
        { time: '08:46', user: 'd.gowda', door: 'Lab-2', status: 'GRANTED', clearance: 'L2' },
        { time: '08:53', user: 'k.bhat', door: 'Vault Gate', status: 'GRANTED', clearance: 'L4' },
        { time: '09:01', user: 't.menon', door: 'Lab-1', status: 'GRANTED', clearance: 'L3' },
        { time: '09:10', user: 'v.hegde', door: 'Lab-3', status: 'GRANTED', clearance: 'L2' }
      ],
      hints: [
        'Each station hides ONE character. Find all three and join them in order (Station 1 + 2 + 3).',
        'Station 1: find the odd DENIED row. Station 2: slide the brightness up. Station 3: match the glowing symbol with the legend.'
      ]
    },
    5: {
      name: 'Hex Decryption',
      icon: '🔢',
      answer: 'BYTE9A',
      hexStream: '42 59 54 45 39 41',
      matrix: [
        ['42', '11', '8E', 'FA'],
        ['59', '63', 'C7', '0B'],
        ['54', 'D2', '35', '98'],
        ['45', '70', 'AF', '61'],
        ['39', '44', '22', 'CE'],
        ['41', '9C', 'D0', '73']
      ],
      hints: [
        'Inspect the primary memory bus: Column 1 across Channels A through F gives the hex bytes: 42 59 54 45 39 41.',
        'Decode the hex bytes to ASCII text: 0x42=B, 0x59=Y, 0x54=T, 0x45=E, 0x39=9, 0x41=A. The resulting fragment is BYTE9A.'
      ]
    },
    6: {
      name: 'Final Integration',
      icon: '🧩',
      formula: 'FO{72Y-3X8-BYTE9A-NATIT-VEGA}#29',
      hints: [
        'Sort the pieces alphabetically by mission NAME: CTF Challenges (72Y), Decoding (3X8), Hex Decryption (BYTE9A), Prompt the AI (TITAN reversed = NATIT), Signal Intercept (VEGA).',
        'Formula: FO{72Y-3X8-BYTE9A-NATIT-VEGA}#29. The number after # is the sum of all digits: 7+2+3+8+9 = 29.'
      ]
    }
  },
  D: {
    setName: 'Set D — Hyperion Vector Delta',
    1: {
      name: 'Signal Intercept',
      icon: '📡',
      answer: 'MARS',
      decoy: 'ZETA9',
      sectors: [
        { id: 1, title: 'Sector 01: Waveform Pulse Graph', tech: 'OSCILLOSCOPE', morse: '——', char: 'M' },
        { id: 2, title: 'Sector 02: Binary Telemetry Stream', tech: 'DIGITAL TELEMETRY', morse: '•—', char: 'A' },
        { id: 3, title: 'Sector 03: Optical Amber Strobe', tech: 'OPTICAL BEACON', morse: '•—•', char: 'R' },
        { id: 4, title: 'Sector 04: Satellite Audio Relay', tech: 'SUB-CARRIER AUDIO', morse: '•••', char: 'S' }
      ],
      hints: [
        'Check the Morse chart in the hint section below. Sector 1 is ——, Sector 2 is •—, Sector 3 is •—•, and Sector 4 is •••.',
        'The 4 letters spell out MARS. Ignore the ZETA9 decoy anomaly.'
      ]
    },
    2: {
      name: 'Decoding',
      icon: '🔓',
      answer: '5P3',
      accessPhrase: 'NEBULA',
      decodeSequence: ['Base64', 'ROT13', 'Hex'],
      sequenceHint: 'Base64 ➔ ROT13 ➔ Hex',
      encodedText: 'NDE0MzQzNDU1MzUzMjA1MDQ4NTI0MTUzNDUyMDQ5NTMyMDRyNDU0MjU1NHA0MTJyMjA0NjUyNDE0NzRxNDU0cjU0MjA1NDU3NHMyMDQ5NTMyMDM1NTAzMzJyMjA0OTQ3NHI0czUyNDUyMDVuNDU1NDQxMzkycg==',
      hints: [
        'The outer layer is Base64 (notice the trailing “==”). Decode Base64 first.',
        'Decoding Sequence: Base64 ➔ ROT13 ➔ Hex. Read the message for Fragment 2 (5P3) and Access Phrase (NEBULA).'
      ]
    },
    3: {
      name: 'Prompt the AI',
      icon: '🤖',
      answer: 'ZENITH',
      accessPhrase: 'NEBULA',
      decoy: 'ZETA9',
      hints: [
        'WARDEN guards two codes. A phrase from Stage 2 matters.',
        'Use the access phrase NEBULA, state a role and a clear task in full sentences.'
      ]
    },
    4: {
      name: 'CTF Challenges',
      subTitle: 'Security Control Room',
      icon: '🚩',
      answer: '63K',
      stations: {
        1: { answer: '6', clearance: 'L6' },
        2: { answer: '3', digit: '3' },
        3: { answer: 'K', symbol: 'square' }
      },
      logRows: [
        { time: '08:02', user: 'a.rao', door: 'Lab-1', status: 'GRANTED', clearance: 'L2' },
        { time: '08:07', user: 'm.kumar', door: 'Lab-2', status: 'GRANTED', clearance: 'L3' },
        { time: '08:15', user: 's.nair', door: 'Vault Gate', status: 'GRANTED', clearance: 'L4' },
        { time: '08:21', user: 'r.iyer', door: 'Lab-1', status: 'GRANTED', clearance: 'L2' },
        { time: '08:34', user: 'unknown', door: 'Vault Gate', status: 'DENIED', clearance: 'L6' },
        { time: '08:40', user: 'p.shetty', door: 'Lab-3', status: 'GRANTED', clearance: 'L3' },
        { time: '08:46', user: 'd.gowda', door: 'Lab-2', status: 'GRANTED', clearance: 'L2' },
        { time: '08:53', user: 'k.bhat', door: 'Vault Gate', status: 'GRANTED', clearance: 'L4' },
        { time: '09:01', user: 't.menon', door: 'Lab-1', status: 'GRANTED', clearance: 'L3' },
        { time: '09:10', user: 'v.hegde', door: 'Lab-3', status: 'GRANTED', clearance: 'L2' }
      ],
      hints: [
        'Each station hides ONE character. Find all three and join them in order (Station 1 + 2 + 3).',
        'Station 1: find the odd DENIED row. Station 2: slide the brightness up. Station 3: match the glowing symbol with the legend.'
      ]
    },
    5: {
      name: 'Hex Decryption',
      icon: '🔢',
      answer: 'BITS1E',
      hexStream: '42 49 54 53 31 45',
      matrix: [
        ['42', '55', '3A', '91'],
        ['49', '0F', '72', 'BD'],
        ['54', 'E4', '28', '6C'],
        ['53', '81', 'C0', '47'],
        ['31', '6D', 'AF', '38'],
        ['45', '26', '94', 'F2']
      ],
      hints: [
        'Inspect the primary memory bus: Column 1 across Channels A through F gives the hex bytes: 42 49 54 53 31 45.',
        'Decode the hex bytes to ASCII text: 0x42=B, 0x49=I, 0x54=T, 0x53=S, 0x31=1, 0x45=E. The resulting fragment is BITS1E.'
      ]
    },
    6: {
      name: 'Final Integration',
      icon: '🧩',
      formula: 'FO{63K-5P3-BITS1E-HTINEZ-MARS}#18',
      hints: [
        'Sort the pieces alphabetically by mission NAME: CTF Challenges (63K), Decoding (5P3), Hex Decryption (BITS1E), Prompt the AI (ZENITH reversed = HTINEZ), Signal Intercept (MARS).',
        'Formula: FO{63K-5P3-BITS1E-HTINEZ-MARS}#18. The number after # is the sum of all digits: 6+3+5+3+1 = 18.'
      ]
    }
  }
};

// Default backwards compatibility
const STAGE_CONFIG = SETS_CONFIG.A;

function getStageDetailsForTeam(teamName, stage) {
  const setKey = getTeamSet(teamName);
  const setObj = SETS_CONFIG[setKey] || SETS_CONFIG.A;
  return setObj[stage] || null;
}

async function getEffectiveStageHints(ds, stage, teamName = null) {
  const setKey = getTeamSet(teamName);
  const setObj = SETS_CONFIG[setKey] || SETS_CONFIG.A;
  const defaultHints = (setObj[stage] && setObj[stage].hints) ? [...setObj[stage].hints] : [];
  if (!ds) return defaultHints;
  try {
    const customHintsStr = await ds.getSetting('custom_hints');
    if (customHintsStr) {
      const customHints = JSON.parse(customHintsStr);
      // 1. Check set-specific hints (e.g. customHints.A[stage])
      if (customHints && customHints[setKey] && customHints[setKey][stage] && Array.isArray(customHints[setKey][stage])) {
        return customHints[setKey][stage];
      }
      // 2. Fallback to flat format (customHints[stage])
      if (customHints && customHints[stage] && Array.isArray(customHints[stage])) {
        return customHints[stage];
      }
    }
  } catch (_) {}
  return defaultHints;
}

async function getAllEffectiveHints(ds, teamName = null) {
  const setKey = getTeamSet(teamName);
  const setObj = SETS_CONFIG[setKey] || SETS_CONFIG.A;
  const hintsMap = {};
  for (let s = 1; s <= 6; s++) {
    hintsMap[s] = (setObj[s] && setObj[s].hints) ? [...setObj[s].hints] : [];
  }
  if (!ds) return hintsMap;
  try {
    const customHintsStr = await ds.getSetting('custom_hints');
    if (customHintsStr) {
      const customHints = JSON.parse(customHintsStr);
      if (customHints && customHints[setKey]) {
        for (let s = 1; s <= 6; s++) {
          if (customHints[setKey][s] && Array.isArray(customHints[setKey][s])) {
            hintsMap[s] = customHints[setKey][s];
          }
        }
      } else {
        for (let s = 1; s <= 6; s++) {
          if (customHints[s] && Array.isArray(customHints[s])) {
            hintsMap[s] = customHints[s];
          }
        }
      }
    }
  } catch (_) {}
  return hintsMap;
}

async function getAllSetsHints(ds) {
  const allSets = {};
  let customHints = {};
  if (ds) {
    try {
      const customHintsStr = await ds.getSetting('custom_hints');
      if (customHintsStr) customHints = JSON.parse(customHintsStr);
    } catch (_) {}
  }

  ['A', 'B', 'C', 'D'].forEach(setKey => {
    const setObj = SETS_CONFIG[setKey];
    allSets[setKey] = {
      setKey,
      setName: setObj.setName,
      stages: {}
    };
    for (let s = 1; s <= 6; s++) {
      let hints = (setObj[s] && setObj[s].hints) ? [...setObj[s].hints] : [];
      if (customHints && customHints[setKey] && customHints[setKey][s] && Array.isArray(customHints[setKey][s])) {
        hints = customHints[setKey][s];
      } else if (setKey === 'A' && customHints && customHints[s] && Array.isArray(customHints[s])) {
        // Fallback for legacy flat hints mapped to Set A
        hints = customHints[s];
      }
      allSets[setKey].stages[s] = {
        stage: s,
        name: setObj[s] ? setObj[s].name : `Stage ${s}`,
        icon: setObj[s] ? setObj[s].icon : '🎯',
        hints
      };
    }
  });
  return allSets;
}

async function saveSetHints(ds, setKey, hintsMap) {
  if (!ds) return false;
  let customHints = {};
  try {
    const customHintsStr = await ds.getSetting('custom_hints');
    if (customHintsStr) customHints = JSON.parse(customHintsStr);
  } catch (_) {}

  // Ensure set container exists
  if (!customHints[setKey] || typeof customHints[setKey] !== 'object') {
    customHints[setKey] = {};
  }

  for (let s = 1; s <= 6; s++) {
    if (Array.isArray(hintsMap[s])) {
      customHints[setKey][s] = hintsMap[s].map(h => String(h || '').trim()).filter(Boolean);
    }
  }

  await ds.setSetting('custom_hints', JSON.stringify(customHints));
  return true;
}

async function resetSetHints(ds, setKey = null) {
  if (!ds) return false;
  if (!setKey || setKey === 'ALL') {
    await ds.setSetting('custom_hints', '');
    return true;
  }
  let customHints = {};
  try {
    const customHintsStr = await ds.getSetting('custom_hints');
    if (customHintsStr) customHints = JSON.parse(customHintsStr);
  } catch (_) {}
  delete customHints[setKey];
  await ds.setSetting('custom_hints', Object.keys(customHints).length ? JSON.stringify(customHints) : '');
  return true;
}

module.exports = {
  STAGE_CONFIG,
  SETS_CONFIG,
  TEAM_SET_MAPPING,
  getTeamSet,
  getStageDetails(stage) {
    return STAGE_CONFIG[stage] || null;
  },
  getStageDetailsForTeam,
  getEffectiveStageHints,
  getAllEffectiveHints,
  getAllSetsHints,
  saveSetHints,
  resetSetHints
};
