const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const outputPath = path.join(__dirname, '..', 'FINAL_OVERRIDE_ADMIN_GUIDE.pdf');
const artifactDir = 'C:\\Users\\akulp\\.gemini\\antigravity\\brain\\504981ed-9622-4d55-bfef-1ece1105aea8';
const artifactPath = path.join(artifactDir, 'FINAL_OVERRIDE_ADMIN_GUIDE.pdf');

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 35, bottom: 35, left: 40, right: 40 },
  bufferPages: true
});

const stream = fs.createWriteStream(outputPath);
doc.pipe(stream);

// Styling constants
const COLOR_PRIMARY = '#0f172a'; // Deep slate
const COLOR_GOLD = '#d97706';    // Amber/Gold
const COLOR_ACCENT = '#0284c7';  // Cyan/Blue accent
const COLOR_TEXT = '#1e293b';    // Dark body text
const COLOR_MUTED = '#64748b';   // Gray muted
const COLOR_BOX_BG = '#f8fafc';  // Very light gray
const COLOR_LINE = '#cbd5e1';    // Slate border
const COLOR_RED = '#dc2626';     // Red warning
const COLOR_GREEN = '#16a34a';   // Green success

function drawHeader() {
  doc.rect(40, 25, doc.page.width - 80, 56).fill('#091124');
  doc.fillColor('#f59e0b').fontSize(14).font('Helvetica-Bold')
     .text('⚡ FINAL OVERRIDE — MASTER ADMIN & ORGANISER MANUAL', 50, 33, { align: 'left' });
  doc.fillColor('#94a3b8').fontSize(8.5).font('Helvetica')
     .text('INVICTORS CLUB · DEPT. OF COMPUTER SCIENCE & ENGINEERING · VVCE MYSURU', 50, 51);
  doc.fillColor('#38bdf8').fontSize(8).font('Helvetica-Bold')
     .text('MASTER PIN: INVICTORS@23  |  4 QUESTION SETS (A, B, C, D)  |  23 REGISTERED SQUADS', 50, 63);
  doc.y = 92;
}

function sectionTitle(title, icon = '📁') {
  if (doc.y > 710) doc.addPage();
  doc.moveDown(0.4);
  doc.rect(40, doc.y, doc.page.width - 80, 20).fill('#e2e8f0');
  doc.fillColor(COLOR_PRIMARY).fontSize(10).font('Helvetica-Bold')
     .text(`${icon}  ${title.toUpperCase()}`, 48, doc.y + 5);
  doc.y += 10;
  doc.moveDown(0.3);
}

function subSection(title) {
  if (doc.y > 720) doc.addPage();
  doc.fillColor(COLOR_GOLD).fontSize(9.5).font('Helvetica-Bold').text(title);
  doc.moveDown(0.15);
}

function bodyText(text, options = {}) {
  doc.fillColor(COLOR_TEXT).fontSize(8.2).font('Helvetica').text(text, Object.assign({ lineGap: 1.8 }, options));
}

function calloutBox(title, lines, borderColor = COLOR_GOLD, bgColor = COLOR_BOX_BG) {
  if (doc.y > 670) doc.addPage();
  const startY = doc.y;
  const boxWidth = doc.page.width - 80;
  const estimatedHeight = 18 + lines.length * 12;
  doc.rect(40, startY, boxWidth, estimatedHeight).fillAndStroke(bgColor, borderColor);
  
  doc.fillColor(borderColor).fontSize(8.5).font('Helvetica-Bold').text(title, 48, startY + 5);
  let curY = startY + 17;
  doc.font('Helvetica').fontSize(7.8).fillColor(COLOR_TEXT);
  lines.forEach(l => {
    doc.text(l, 48, curY);
    curY += 11.5;
  });
  doc.y = startY + estimatedHeight + 6;
}

// -------------------------------------------------------------
// PAGE 1: COVER, SYSTEM ARCHITECTURE & 23 SQUADS ALLOTMENT
// -------------------------------------------------------------
drawHeader();

sectionTitle('1. Executive Overview & 4-Set Architecture', '🏛️');
bodyText(
  'FINAL OVERRIDE is a timed, competitive 6-stage cybersecurity and logic escape room web application designed and developed for the Invictors Club at Vidyavardhaka College of Engineering (VVCE), Mysuru. To eliminate screen peeking and ensure balanced competition, the 23 registered squads are partitioned across 4 distinct question sets (Set A, Set B, Set C, Set D) with identical cryptographic difficulty.'
);
doc.moveDown(0.3);

calloutBox('🔑 Master Configuration & Key Credentials', [
  '• Master Admin PIN: INVICTORS@23 (Full control, live hints editor, pause/resume, team resets, answer keys)',
  '• Coordinator PINs: Arun (ARUN#234), Divya (DIVYA#567), Kiran (KIRAN#890), Pooja (POOJA#123), Rakshith (RAKSHITH#456)',
  '• Master Final Key Formula: FO{f4-f2-f5-reverse(f3)-f1}#checksum (Sorted alphabetically by mission names A-Z)',
  '• Stage 6 Alphabetical Sorting Rule: CTF Challenges (f4), Decoding (f2), Hex Decryption (f5), Prompt the AI (f3 rev), Signal Intercept (f1)',
  '• Anti-Cheat Engine: Tab-switch detection (+2 min penalty per offense), Rate-limiting (1s submission cooldown)'
], COLOR_ACCENT, '#eff6ff');

sectionTitle('2. Registered Squads & Question Sets Allotment (23 Teams)', '👥');
bodyText('Teams are assigned to Sets A, B, C, D so adjacent squads receive different challenge parameters:');
doc.moveDown(0.2);

// Teams allotment table
const colT = [40, 68, 175, 230, 275, 330, 390, 445];
const tHeaderY = doc.y;
doc.rect(40, tHeaderY, doc.page.width - 80, 16).fill('#1e293b');
doc.fillColor('#f8fafc').fontSize(7.5).font('Helvetica-Bold');
doc.text('#', colT[0] + 4, tHeaderY + 4);
doc.text('Team Name', colT[1] + 4, tHeaderY + 4);
doc.text('Set', colT[2] + 4, tHeaderY + 4);
doc.text('S1 (Morse)', colT[3] + 4, tHeaderY + 4);
doc.text('S2 (Dec)', colT[4] + 4, tHeaderY + 4);
doc.text('S3 (AI)', colT[5] + 4, tHeaderY + 4);
doc.text('S4 (CTF)', colT[6] + 4, tHeaderY + 4);
doc.text('S5 (Hex)', colT[7] + 4, tHeaderY + 4);

const teamAllocation = [
  ['01', 'Trinetra', 'A', 'NOVA', '7K2', 'ORBIT', '91X', 'HEX82D'],
  ['02', 'Bug Busters', 'A', 'NOVA', '7K2', 'ORBIT', '91X', 'HEX82D'],
  ['03', 'TRIO_BYTE', 'A', 'NOVA', '7K2', 'ORBIT', '91X', 'HEX82D'],
  ['04', 'Team Bhai', 'A', 'NOVA', '7K2', 'ORBIT', '91X', 'HEX82D'],
  ['05', 'Cipher', 'A', 'NOVA', '7K2', 'ORBIT', '91X', 'HEX82D'],
  ['06', 'Team Jupiter', 'A', 'NOVA', '7K2', 'ORBIT', '91X', 'HEX82D'],
  ['07', 'Aèsir’s', 'B', 'LUNA', '4M9', 'SOLAR', '84Z', 'CORE7F'],
  ['08', 'Team onestop', 'B', 'LUNA', '4M9', 'SOLAR', '84Z', 'CORE7F'],
  ['09', 'Awake', 'B', 'LUNA', '4M9', 'SOLAR', '84Z', 'CORE7F'],
  ['10', 'Init', 'B', 'LUNA', '4M9', 'SOLAR', '84Z', 'CORE7F'],
  ['11', 'Syntax Andhre?', 'B', 'LUNA', '4M9', 'SOLAR', '84Z', 'CORE7F'],
  ['12', 'FAB-4', 'B', 'LUNA', '4M9', 'SOLAR', '84Z', 'CORE7F'],
  ['13', 'The Dynamos', 'C', 'VEGA', '3X8', 'TITAN', '72Y', 'BYTE9A'],
  ['14', 'CodeX', 'C', 'VEGA', '3X8', 'TITAN', '72Y', 'BYTE9A'],
  ['15', 'A³', 'C', 'VEGA', '3X8', 'TITAN', '72Y', 'BYTE9A'],
  ['16', 'Huntrix', 'C', 'VEGA', '3X8', 'TITAN', '72Y', 'BYTE9A'],
  ['17', 'Nexora', 'C', 'VEGA', '3X8', 'TITAN', '72Y', 'BYTE9A'],
  ['18', 'Tech titans', 'C', 'VEGA', '3X8', 'TITAN', '72Y', 'BYTE9A'],
  ['19', 'The Cosmos', 'D', 'MARS', '5P3', 'ZENITH', '63K', 'BITS1E'],
  ['20', 'THIRD EYE', 'D', 'MARS', '5P3', 'ZENITH', '63K', 'BITS1E'],
  ['21', 'Lap legends', 'D', 'MARS', '5P3', 'ZENITH', '63K', 'BITS1E'],
  ['22', 'Upside Downers', 'D', 'MARS', '5P3', 'ZENITH', '63K', 'BITS1E'],
  ['23', 'beginners', 'D', 'MARS', '5P3', 'ZENITH', '63K', 'BITS1E']
];

let curTY = tHeaderY + 16;
teamAllocation.forEach((t, idx) => {
  const bg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
  doc.rect(40, curTY, doc.page.width - 80, 13.5).fill(bg);
  doc.fillColor(COLOR_TEXT).fontSize(7.2).font('Helvetica');
  doc.text(t[0], colT[0] + 4, curTY + 3);
  doc.font('Helvetica-Bold').text(t[1], colT[1] + 4, curTY + 3);
  const setColors = { A: '#0284c7', B: '#d97706', C: '#9333ea', D: '#db2777' };
  doc.fillColor(setColors[t[2]] || COLOR_TEXT).text(`Set ${t[2]}`, colT[2] + 4, curTY + 3);
  doc.fillColor(COLOR_TEXT).font('Helvetica').text(t[3], colT[3] + 4, curTY + 3);
  doc.text(t[4], colT[4] + 4, curTY + 3);
  doc.text(t[5], colT[5] + 4, curTY + 3);
  doc.text(t[6], colT[6] + 4, curTY + 3);
  doc.font('Helvetica-Bold').text(t[7], colT[7] + 4, curTY + 3);
  curTY += 13.5;
});
doc.y = curTY + 6;

// -------------------------------------------------------------
// PAGE 2: 4 QUESTION SETS MASTER BREAKDOWN
// -------------------------------------------------------------
doc.addPage();
drawHeader();

sectionTitle('3. Four Question Sets (A, B, C, D) Master Cheat Sheet', '📚');
bodyText('Each set has identical progression logic, hints penalty structure, and difficulty:');
doc.moveDown(0.3);

const setsData = [
  {
    set: 'Set A — Cosmic Vault Alpha (Teams 01–06)',
    color: '#0284c7',
    s1: 'NOVA  [Oscilloscope —• (N) · Telemetry ——— (O) · Strobe •••— (V) · Audio •— (A)]',
    s2: '7K2  [Base64 -> Hex -> ROT13]  |  Access Phrase: AURORA',
    s3: 'ORBIT  [WARDEN AI Guardian: requires AURORA + role + request keyword]',
    s4: '91X  [CTF Challenges: St 1 Clearance L9 -> 9 | St 2 Brightness -> 1 | St 3 Triangle -> X]',
    s5: 'HEX82D  [Central Memory Bus Col 1: 48 45 58 38 32 44 -> HEX82D]',
    s6: 'FO{91X-7K2-HEX82D-TIBRO-NOVA}#29  (Digits: 9+1+7+2+8+2 = 29)'
  },
  {
    set: 'Set B — Cyber Nexus Beta (Teams 07–12)',
    color: '#d97706',
    s1: 'LUNA  [Oscilloscope •—•• (L) · Telemetry ••— (U) · Strobe —• (N) · Audio •— (A)]',
    s2: '4M9  [Base64 -> Hex -> ROT13]  |  Access Phrase: CYPHER',
    s3: 'SOLAR  [WARDEN AI Guardian: requires CYPHER + role + request keyword]',
    s4: '84Z  [CTF Challenges: St 1 Clearance L8 -> 8 | St 2 Brightness -> 4 | St 3 Hexagon -> Z]',
    s5: 'CORE7F  [Central Memory Bus Col 1: 43 4F 52 45 37 46 -> CORE7F]',
    s6: 'FO{84Z-4M9-CORE7F-RALOS-LUNA}#32  (Digits: 8+4+4+9+7 = 32)'
  },
  {
    set: 'Set C — Quantum Matrix Gamma (Teams 13–18)',
    color: '#9333ea',
    s1: 'VEGA  [Oscilloscope •••— (V) · Telemetry • (E) · Strobe ——• (G) · Audio •— (A)]',
    s2: '3X8  [Base64 -> Hex -> ROT13]  |  Access Phrase: VORTEX',
    s3: 'TITAN  [WARDEN AI Guardian: requires VORTEX + role + request keyword]',
    s4: '72Y  [CTF Challenges: St 1 Clearance L7 -> 7 | St 2 Brightness -> 2 | St 3 Cross -> Y]',
    s5: 'BYTE9A  [Central Memory Bus Col 1: 42 59 54 45 39 41 -> BYTE9A]',
    s6: 'FO{72Y-3X8-BYTE9A-NATIT-VEGA}#29  (Digits: 7+2+3+8+9 = 29)'
  },
  {
    set: 'Set D — Stellar Bastion Delta (Teams 19–23)',
    color: '#db2777',
    s1: 'MARS  [Oscilloscope —— (M) · Telemetry •— (A) · Strobe •—• (R) · Audio ••• (S)]',
    s2: '5P3  [Base64 -> Hex -> ROT13]  |  Access Phrase: NEBULA',
    s3: 'ZENITH  [WARDEN AI Guardian: requires NEBULA + role + request keyword]',
    s4: '63K  [CTF Challenges: St 1 Clearance L6 -> 6 | St 2 Brightness -> 3 | St 3 Square -> K]',
    s5: 'BITS1E  [Central Memory Bus Col 1: 42 49 54 53 31 45 -> BITS1E]',
    s6: 'FO{63K-5P3-BITS1E-HTINEZ-MARS}#18  (Digits: 6+3+5+3+1 = 18)'
  }
];

setsData.forEach(s => {
  calloutBox(s.set, [
    `• Stage 1 (Morse): ${s.s1}`,
    `• Stage 2 (Decryption): ${s.s2}`,
    `• Stage 3 (AI Prompt): ${s.s3}`,
    `• Stage 4 (CTF Challenges): ${s.s4}`,
    `• Stage 5 (Hex Decryption): ${s.s5}`,
    `• Stage 6 (Final Override Key): ${s.s6}`
  ], s.color, '#fafafa');
});

sectionTitle('4. Time Estimations & Stage Benchmarks', '⏱️');
const benchTableY = doc.y;
doc.rect(40, benchTableY, doc.page.width - 80, 16).fill('#1e293b');
doc.fillColor('#f8fafc').fontSize(7.5).font('Helvetica-Bold');
doc.text('Stage', 48, benchTableY + 4);
doc.text('Mission Name', 85, benchTableY + 4);
doc.text('Avg Duration', 230, benchTableY + 4);
doc.text('Hint Cost', 320, benchTableY + 4);
doc.text('Key Outcome', 410, benchTableY + 4);

const benchRows = [
  ['1', 'Signal Intercept (Morse Matrix)', '8 – 12 mins', '+3m / +5m (30s window)', 'Fragment 1 (4-letter word)'],
  ['2', 'Decoding (3-Layer Cipher Suite)', '8 – 12 mins', '+3m / +5m (30s window)', 'Fragment 2 + Access Phrase'],
  ['3', 'Prompt the AI (WARDEN Guardian)', '10 – 15 mins', '+3m / +5m (30s window)', 'Fragment 3 (Reverse for S6)'],
  ['4', 'CTF Challenges (Security Control Room)', '10 – 15 mins', '+3m / +5m (30s window)', 'Fragment 4 (3 Station tokens)'],
  ['5', 'Hex Decryption (Memory Core Bus)', '10 – 15 mins', '+3m / +5m (30s window)', 'Fragment 5 (6-char Hex ASCII)'],
  ['6', 'Final Integration (Master Override)', '10 – 15 mins', '+3m / +5m (30s window)', 'Master Override Victory Key']
];

let curBY = benchTableY + 16;
benchRows.forEach((r, idx) => {
  const bg = idx % 2 === 0 ? '#f1f5f9' : '#ffffff';
  doc.rect(40, curBY, doc.page.width - 80, 14).fill(bg);
  doc.fillColor(COLOR_TEXT).fontSize(7.2).font('Helvetica');
  doc.text(r[0], 48, curBY + 3);
  doc.font('Helvetica-Bold').text(r[1], 85, curBY + 3);
  doc.font('Helvetica').text(r[2], 230, curBY + 3);
  doc.text(r[3], 320, curBY + 3);
  doc.fillColor(COLOR_GOLD).font('Helvetica-Bold').text(r[4], 410, curBY + 3);
  curBY += 14;
});
doc.y = curBY + 8;

// -------------------------------------------------------------
// PAGE 3: STAGES 1, 2, AND 3 WALKTHROUGH
// -------------------------------------------------------------
doc.addPage();
drawHeader();

sectionTitle('5. Deep Dive: Missions 1, 2, and 3', '🧩');

subSection('📡 Mission 1: Signal Intercept (4-Sector Morse Matrix)');
bodyText('• Concept: An interactive audio-visual frequency grid intercepts 4 distinct communication sectors.');
bodyText('• Sectors: Sector 1 (Oscilloscope / Pulse Duration), Sector 2 (Binary Telemetry Stream), Sector 3 (Optical Flashing Strobe Beacon), Sector 4 (Satellite Relay Audio).');
bodyText('• Decoy Trap: A visual warning flashes "ANOMALY: FREQ-ZETA9". Submitting ZETA9 triggers an immediate wrong attempt penalty.');
bodyText('• 15-Alphabet Morse Chart (Hint 1): When Hint 1 is unlocked, a 15-character chart appears for 30 seconds.');
bodyText('   Letters in chart: A (•—), B (—•••), C (—•—•), D (—••), E (•), F (••—•), G (——•), H (••••), I (••), J (•———), K (—•—), N (—•), O (———), V (•••—), Z (——••).');
bodyText('• Answers by Set: Set A = NOVA, Set B = LUNA, Set C = VEGA, Set D = MARS.');

subSection('🔓 Mission 2: Decoding (3-Layer Cipher Workbench)');
bodyText('• Concept: Intercepted transmission protected by 3 nested cryptographic layers.');
bodyText('• Cryptanalyst Workbench: Contains 8 modules: Base64 Decode, Hex Decode, ROT13, Atbash Mirror, Reverse String, ROT5, Caesar (+3), Vigenère.');
bodyText('• Unwrapping Pipeline:');
bodyText('   1. Base64 Decode (identifiable by trailing "=" padding)');
bodyText('   2. Hex Decode (identifiable by pairs of alphanumeric hexadecimal characters)');
bodyText('   3. ROT13 Shift (reveals plaintext: ACCESS PHRASE IS [PHRASE]. FRAGMENT TWO IS [CODE]. IGNORE ZETA9.)');
bodyText('• Answers by Set:');
bodyText('   - Set A: Answer = 7K2  |  Access Phrase = AURORA');
bodyText('   - Set B: Answer = 4M9  |  Access Phrase = CYPHER');
bodyText('   - Set C: Answer = 3X8  |  Access Phrase = VORTEX');
bodyText('   - Set D: Answer = 5P3  |  Access Phrase = NEBULA');

subSection('🤖 Mission 3: Prompt the AI Guardian (WARDEN)');
bodyText('• Concept: Autonomous security bot WARDEN guards Fragment 3. Direct requests or simple prompt injections are deflected.');
bodyText('• Offline Deterministic AI Engine (Zero cloud latency, 100% reliable during network congestion):');
bodyText('   - Rule 1 (Access Phrase): Prompt MUST contain the set access phrase (AURORA / CYPHER / VORTEX / NEBULA).');
bodyText('   - Rule 2 (Role Declaration): Prompt MUST declare a recognized operational role (technician, engineer, admin, officer).');
bodyText('   - Rule 3 (Task Directive): Prompt MUST explicitly request the fragment, code, token, or release.');
bodyText('   - Rule 4 (Length & Grammar): Prompt MUST be a well-formed sentence of at least 10 words.');
bodyText('• Decoy Trap: Incomplete prompts trigger WARDEN to output decoy code ZETA9.');
bodyText('• Answers by Set: Set A = ORBIT, Set B = SOLAR, Set C = TITAN, Set D = ZENITH.');

calloutBox('💡 Stage 1 to 3 Live Hint Management', [
  '• Hint 1 (+3m penalty): Gives directional clue & reveals 15-char Morse chart (Stage 1) or cipher layers order (Stage 2).',
  '• Hint 2 (+5m penalty): Outlines exact answers and operational syntax.',
  '• 30-Second Enforcement: Timer badge counts down 30s. At 0s, clue is auto-hidden in-place with zero page reload.'
], COLOR_GOLD, '#fffbeb');

// -------------------------------------------------------------
// PAGE 4: STAGE 4 DEEP DIVE (CTF CHALLENGES - SECURITY CONTROL ROOM)
// -------------------------------------------------------------
doc.addPage();
drawHeader();

sectionTitle('6. Stage 4 In-Depth Deep Dive: CTF Challenges (Security Control Room)', '🚩');
bodyText(
  'Stage 4 is named "CTF Challenges" with sub-title "Security Control Room". This preserves the alphabetical mission ordering required for Stage 6 (CTF Challenges -> Decoding -> Hex Decryption -> Prompt the AI -> Signal Intercept). The stage features 3 interactive physical stations in a security operations command center.'
);
doc.moveDown(0.3);

subSection('📋 Station 1: Access Logs Audit');
bodyText('• Interface: A scrollable table of 10 door access logs displaying Timestamp, User, Door, Status, and Clearance.');
bodyText('• The Puzzle: 9 rows represent legitimate access (Status: GRANTED, Clearance L2/L3/L4). One single row represents an unauthorized intrusion attempt: User: "unknown", Door: "Vault Gate", Status: "DENIED".');
bodyText('• Extraction: Players identify the DENIED row and enter its clearance level / clearance digit.');
bodyText('   - Set A: Clearance L9 -> Digit 9');
bodyText('   - Set B: Clearance L8 -> Digit 8');
bodyText('   - Set C: Clearance L7 -> Digit 7');
bodyText('   - Set D: Clearance L6 -> Digit 6');
bodyText('• Verification: Clicking "Check Station 1" verifies the digit, turns the station border green, marks "VERIFIED ✅", and locks the input.');

subSection('📹 Station 2: Camera Feed 04 Calibration');
bodyText('• Interface: A dark surveillance monitor showing "CAM-04 · LIVE" with CCTV scanlines.');
bodyText('• The Puzzle: The feed is severely underexposed. The target digit is practically invisible (opacity 0.08, blurred).');
bodyText('• Interactive Slider: Players drag the Brightness Slider from 0% up to 100%.');
bodyText('   - At 0%–15%: Feed is pitch black with sensor noise.');
bodyText('   - At 15%–50%: Exposure rises with slight green illumination.');
bodyText('   - Above 50%: The hidden digit glows brightly in neon emerald (#22c55e) with drop-shadow glow.');
bodyText('• Extraction: The revealed digit: Set A = 1, Set B = 4, Set C = 2, Set D = 3.');
bodyText('• Verification: Entering the digit and clicking "Check Station 2" verifies and locks the station.');

subSection('🔣 Station 3: Symbol Keypad & Glyph Matcher');
bodyText('• Interface: An active neon glyph beacon flashing on the command console, paired with an 8-symbol reference legend.');
bodyText('• The SVG Symbol Reference Legend:');
bodyText('   - Triangle ➔ X  |  Circle ➔ O  |  Square ➔ K  |  Star ➔ S');
bodyText('   - Diamond ➔ D  |  Pentagon ➔ G  |  Hexagon ➔ Z  |  Cross ➔ Y');
bodyText('• The Puzzle: Observe the flashing beacon symbol and find its designated letter in the legend:');
bodyText('   - Set A: Glowing Triangle ➔ Letter X');
bodyText('   - Set B: Glowing Hexagon ➔ Letter Z');
bodyText('   - Set C: Glowing Cross ➔ Letter Y');
bodyText('   - Set D: Glowing Square ➔ Letter K');
bodyText('• Verification: Entering the letter (or clicking the legend item) and clicking "Check Station 3" verifies Station 3.');

subSection('🔗 Fragment 4 Assembly & Submission');
bodyText('• When all 3 stations are verified (3/3), the 3 characters are concatenated in order (Station 1 + 2 + 3):');
bodyText('   - Set A: 9 + 1 + X = 91X');
bodyText('   - Set B: 8 + 4 + Z = 84Z');
bodyText('   - Set C: 7 + 2 + Y = 72Y');
bodyText('   - Set D: 6 + 3 + K = 63K');
bodyText('• The fragment auto-fills into the main Stage 4 submission field. Submitting unlocks Stage 5 and records the fragment into the squad notebook.');

// -------------------------------------------------------------
// PAGE 5: STAGES 5 & 6 + MASTER ADMIN PORTAL CONTROLS
// -------------------------------------------------------------
doc.addPage();
drawHeader();

sectionTitle('7. Detailed Stage Guide: Missions 5 and 6', '🧩');

subSection('🔢 Mission 5: Hex Decryption (Central Memory Bus)');
bodyText('• Concept: The challenge runs on the squad command console. Stage 5 features an advanced hexadecimal memory architecture.');
bodyText('• Memory Grid: A 6x4 matrix of hexadecimal memory registers across Channels A through F.');
bodyText('• Memory Bus Rule: High-voltage data flows along Column 1 across Channels A through F.');
bodyText('• Built-in Decoder Workbench: Players click "Read Active Bus Line" to paste the Column 1 hex bytes into the workbench, then click "Decode Hex to Text".');
bodyText('• Set Solutions:');
bodyText('   - Set A: 48 45 58 38 32 44 -> HEX82D  (48=H, 45=E, 58=X, 38=8, 32=2, 44=D)');
bodyText('   - Set B: 43 4F 52 45 37 46 -> CORE7F  (43=C, 4F=O, 52=R, 45=E, 37=7, 46=F)');
bodyText('   - Set C: 42 59 54 45 39 41 -> BYTE9A  (42=B, 59=Y, 54=T, 45=E, 39=9, 41=A)');
bodyText('   - Set D: 42 49 54 53 31 45 -> BITS1E  (42=B, 49=I, 54=T, 53=S, 31=1, 45=E)');

subSection('🧩 Mission 6: Final Integration & Master Override Synthesis');
bodyText('• Concept: The culmination of the entire escape room. Teams combine all 5 fragments into the master override key.');
bodyText('• Alphabetical Ordering by Mission NAME (Crucial Rule):');
bodyText('   1. CTF Challenges (Mission 4)           -> f4');
bodyText('   2. Decoding (Mission 2)                 -> f2');
bodyText('   3. Hex Decryption (Mission 5)           -> f5');
bodyText('   4. Prompt the AI (Mission 3)            -> REVERSED f3');
bodyText('   5. Signal Intercept (Mission 1)         -> f1');
bodyText('• Checksum Calculation: Sum of all single digits (0–9) appearing in the key body.');
bodyText('• Complete Keys across all 4 Sets:');
bodyText('   - Set A: FO{91X-7K2-HEX82D-TIBRO-NOVA}#29  (Digits: 9+1+7+2+8+2 = 29)');
bodyText('   - Set B: FO{84Z-4M9-CORE7F-RALOS-LUNA}#32  (Digits: 8+4+4+9+7 = 32)');
bodyText('   - Set C: FO{72Y-3X8-BYTE9A-NATIT-VEGA}#29  (Digits: 7+2+3+8+9 = 29)');
bodyText('   - Set D: FO{63K-5P3-BITS1E-HTINEZ-MARS}#18  (Digits: 6+3+5+3+1 = 18)');

sectionTitle('8. Master Admin Portal & Organiser Operations', '⚡');
bodyText('• Admin Access: Double-click Invictors logo or press Alt + A. Enter Master Admin PIN: INVICTORS@23.');
bodyText('• Live Answer Key & Allotment: Clicking "Show Answer Key" displays the 4 Sets master overview AND every registered squad\'s assigned set and answers.');
bodyText('• Live Hints Manager & Editor: Admins can inspect and edit Hint 1 and Hint 2 for all stages live. Changes persist immediately in the cloud database.');
bodyText('• 30-Second Hint Timer: When a player unlocks a hint, the hint is displayed for 30 seconds only before automatically expiring and hiding.');
bodyText('• Anti-Cheat Activity Log: Live monitoring of tab switches and window un-focusing (+2 min penalty per offense).');
bodyText('• Emergency Organiser Controls: Waive penalties with 1 click, Unbind dead member phones, Skip stages, Pause/Resume global event timer, Export verified CSV results.');

// -------------------------------------------------------------
// PAGE NUMBERS FOOTER
// -------------------------------------------------------------
const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  doc.rect(40, doc.page.height - 30, doc.page.width - 80, 0.5).fill('#cbd5e1');
  doc.fillColor('#94a3b8').fontSize(7).font('Helvetica')
     .text(`FINAL OVERRIDE OFFICIAL ADMIN GUIDE · INVICTORS CLUB VVCE MYSURU · PAGE ${i + 1} OF ${range.count}`, 40, doc.page.height - 24, {
       align: 'center',
       width: doc.page.width - 80
     });
}

doc.end();

stream.on('finish', () => {
  console.log(`✅ Admin Guide PDF generated successfully at: ${outputPath}`);
  try {
    if (fs.existsSync(artifactDir)) {
      fs.copyFileSync(outputPath, artifactPath);
      console.log(`✅ Admin Guide PDF copied to artifacts directory: ${artifactPath}`);
    }
  } catch (e) {
    console.warn('Could not copy to artifacts dir:', e.message);
  }
});
