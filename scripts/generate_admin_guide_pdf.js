const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const outputPath = path.join(__dirname, '..', 'FINAL_OVERRIDE_ADMIN_GUIDE.pdf');
const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 40, bottom: 40, left: 45, right: 45 },
  bufferPages: true
});

const stream = fs.createWriteStream(outputPath);
doc.pipe(stream);

// Styling constants
const COLOR_PRIMARY = '#0f172a'; // Deep slate
const COLOR_GOLD = '#d97706';    // Amber/Gold
const COLOR_ACCENT = '#2563eb';  // Blue accent
const COLOR_TEXT = '#1e293b';    // Dark body text
const COLOR_MUTED = '#64748b';   // Gray muted
const COLOR_BOX_BG = '#f8fafc';  // Very light gray
const COLOR_LINE = '#cbd5e1';    // Slate border
const COLOR_RED = '#dc2626';     // Red warning
const COLOR_GREEN = '#16a34a';   // Green success

function drawHeader() {
  doc.rect(45, 30, doc.page.width - 90, 60).fill('#091124');
  doc.fillColor('#f59e0b').fontSize(16).font('Helvetica-Bold')
     .text('⚡ FINAL OVERRIDE — MASTER ADMIN & ORGANISER MANUAL', 55, 42, { align: 'left' });
  doc.fillColor('#94a3b8').fontSize(9).font('Helvetica')
     .text('INVICTORS CLUB · DEPT. OF COMPUTER SCIENCE & ENGINEERING · VVCE MYSURU', 55, 64);
  doc.fillColor('#38bdf8').fontSize(8).font('Helvetica-Bold')
     .text('EVENT PIN: INVICTORS@23  |  EVENT DURATION: 90 MIN CAP (AVG: 65-75 MIN)', 55, 76);
  doc.y = 105;
}

function sectionTitle(title, icon = '📁') {
  if (doc.y > 700) doc.addPage();
  doc.moveDown(0.6);
  doc.rect(45, doc.y, doc.page.width - 90, 24).fill('#e2e8f0');
  doc.fillColor(COLOR_PRIMARY).fontSize(11).font('Helvetica-Bold')
     .text(`${icon}  ${title.toUpperCase()}`, 55, doc.y + 6);
  doc.y += 12;
  doc.moveDown(0.4);
}

function subSection(title) {
  if (doc.y > 720) doc.addPage();
  doc.fillColor(COLOR_GOLD).fontSize(10.5).font('Helvetica-Bold').text(title);
  doc.moveDown(0.2);
}

function bodyText(text, options = {}) {
  doc.fillColor(COLOR_TEXT).fontSize(9).font('Helvetica').text(text, Object.assign({ lineGap: 2 }, options));
}

function calloutBox(title, lines, borderColor = COLOR_GOLD, bgColor = COLOR_BOX_BG) {
  if (doc.y > 670) doc.addPage();
  const startY = doc.y;
  const boxWidth = doc.page.width - 90;
  
  // Measure text height roughly
  const estimatedHeight = 24 + lines.length * 14;
  doc.rect(45, startY, boxWidth, estimatedHeight).fillAndStroke(bgColor, borderColor);
  
  doc.fillColor(borderColor).fontSize(9.5).font('Helvetica-Bold').text(title, 55, startY + 6);
  let curY = startY + 20;
  doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_TEXT);
  lines.forEach(l => {
    doc.text(l, 55, curY);
    curY += 13;
  });
  doc.y = startY + estimatedHeight + 8;
}

// -------------------------------------------------------------
// PAGE 1: COVER & EXECUTIVE OVERVIEW
// -------------------------------------------------------------
drawHeader();

sectionTitle('1. Executive Overview & Event Architecture', '🏛️');
bodyText(
  'FINAL OVERRIDE is a timed, competitive 6-stage cybersecurity and logic escape room web application built for the Invictors Club at Vidyavardhaka College of Engineering (VVCE), Mysuru. Teams of 3 to 4 participants race through 6 sequential missions to recover secret cryptographic fragments and synthesize the final system override key.'
);
doc.moveDown(0.4);

calloutBox('🔑 Master Configuration & Critical Secrets', [
  '• Master Admin PIN: INVICTORS@23 (Full control, timer, device resets, dynamic answer keys)',
  '• Coordinator Portal PINs: Arun (ARUN#234), Divya (DIVYA#567), Kiran (KIRAN#890), Pooja (POOJA#123), Rakshith (RAKSHITH#456)',
  '• Master Final Key Formula: FO{f4-f2-f5-reverse(f3)-f1}#checksum -> FO{91X-7K2-HEX82D-TIBRO-NOVA}#29',
  '• Stage 6 Alphabetical Sorting Rule: Missions sorted A-Z by NAME: Cyber Defense (f4), Decoding (f2), Hex Decryption (f5), Prompt the AI (f3 reversed), Signal Intercept (f1)',
  '• Anti-Cheat Engine: Tab-switch detection (+2 min penalty per violation), Rate-limiting (1s cooldown between submits)'
], COLOR_ACCENT, '#eff6ff');

sectionTitle('2. Game Duration & Timing Benchmarks', '⏱️');
bodyText(
  'The entire escape room is tuned for an average total completion time of 65 to 75 minutes, allowing fast squads to finish in ~50 minutes and giving standard squads ample room before hitting the 90-minute hard cap.'
);
doc.moveDown(0.3);

// Timing table
const colX = [45, 90, 240, 330, 420, 500];
const tableY = doc.y;
doc.rect(45, tableY, doc.page.width - 90, 18).fill('#1e293b');
doc.fillColor('#f8fafc').fontSize(8).font('Helvetica-Bold');
doc.text('Stage', colX[0] + 5, tableY + 5);
doc.text('Mission Name', colX[1] + 5, tableY + 5);
doc.text('Average Time', colX[2] + 5, tableY + 5);
doc.text('Hint 1 / 2', colX[3] + 5, tableY + 5);
doc.text('Key Fragment', colX[4] + 5, tableY + 5);

const stageRows = [
  ['1', 'Signal Intercept (Morse Matrix)', '8 – 12 mins', '+3m / +5m', 'NOVA'],
  ['2', 'Multi-Layer Decryption Suite', '8 – 12 mins', '+3m / +5m', '7K2 (AURORA)'],
  ['3', 'Prompt WARDEN AI Guardian', '10 – 15 mins', '+3m / +5m', 'ORBIT'],
  ['4', 'Cyber Defense Firewall Matrix', '10 – 15 mins', '+3m / +5m', '91X'],
  ['5', 'Hexadecimal Memory Core', '10 – 15 mins', '+3m / +5m', 'HEX82D'],
  ['6', 'Final Override Key Integration', '10 – 15 mins', '+3m / +5m', 'FO{...}#29']
];

let curRowY = tableY + 18;
stageRows.forEach((r, idx) => {
  const bg = idx % 2 === 0 ? '#f1f5f9' : '#ffffff';
  doc.rect(45, curRowY, doc.page.width - 90, 16).fill(bg);
  doc.fillColor(COLOR_TEXT).fontSize(8).font('Helvetica');
  doc.text(r[0], colX[0] + 8, curRowY + 4);
  doc.font('Helvetica-Bold').text(r[1], colX[1] + 5, curRowY + 4);
  doc.font('Helvetica').text(r[2], colX[2] + 5, curRowY + 4);
  doc.text(r[3], colX[3] + 5, curRowY + 4);
  doc.fillColor(COLOR_GOLD).font('Helvetica-Bold').text(r[4], colX[4] + 5, curRowY + 4);
  curRowY += 16;
});
doc.y = curRowY + 6;

calloutBox('📊 Total Event Timetable Summary', [
  '• Competitive Average Total Time: 65 – 75 minutes',
  '• Top 10% Speedrun Teams: 45 – 55 minutes',
  '• Maximum Time Cap (Hard Game Over): 90 minutes (5,400 seconds)',
  '• Penalty Calculation: Final Rank Time = Elapsed Clock Time + Total Penalties (Hints + Tab Switches + Attempts)'
], COLOR_GOLD, '#fffbeb');

// -------------------------------------------------------------
// PAGE 2: DETAILED STAGE WALKTHROUGH (STAGES 1 TO 3)
// -------------------------------------------------------------
doc.addPage();
drawHeader();

sectionTitle('3. Detailed Stage Guide: Missions 1, 2, and 3', '🧩');

// Stage 1
subSection('📡 Mission 1: Signal Intercept (4-Sector Morse Matrix)');
bodyText('• Concept: An interactive audio-visual frequency grid intercepts 4 distinct communication sectors.');
bodyText('• Interactive UI:');
bodyText('   - Sector 1 (Oscilloscope / Pulse Graph): Displays continuous wave audio pulses with —• [N]');
bodyText('   - Sector 2 (Binary Telemetry Feed): Displays digital pulse high-states 111-111-111 (3 dashes) -> ——— [O]');
bodyText('   - Sector 3 (Optical Strobe Beacons): Visual flashing amber strobe flashing •••— (3 dots, 1 dash) -> [V]');
bodyText('   - Sector 4 (Satellite Relay Feed): Displays audio carrier wave •— (1 dot, 1 dash) -> [A]');
bodyText('• Decoy Trap: A visual warning flashes "ANOMALY: FREQ-ZETA9". Submitting ZETA9 gives an immediate wrong attempt!');
bodyText('• Solution Fragment 1: NOVA');
calloutBox('💡 Stage 1 Hints Catalog (Hint Button)', [
  '• Hint 1 (+3 min penalty): Reveals the 15-character international Morse code chart directly on screen.',
  '   Chart includes: A (•—), B (—•••), C (—•—•), D (—••), E (•), F (••—•), G (——•), H (••••),',
  '   I (••), J (•———), K (—•—), N (—•), O (———), V (•••—), Z (——••).',
  '• Hint 2 (+5 min penalty): Spells out that combining the 4 sectors yields the 4-letter cosmic word NOVA.'
]);

// Stage 2
subSection('🔓 Mission 2: Multi-Layer Poly-Cipher Stream');
bodyText('• Concept: Intercepted transmission protected by 3 nested layers of transformation.');
bodyText('• Enhanced Cryptanalyst Workbench: To challenge players, 8 cryptanalytic tools are presented:');
bodyText('   [Base64 Decode], [Hex Decode], [ROT13], [Atbash Mirror], [Reverse String], [ROT5], [Caesar +3], [Vigenère]');
bodyText('• Encoded Payload: NGU1MDUwNTI0NjQ2MjA0MzU1NDU0ZTQ2NTIyMDU2NDYyMDRlNDg0NTQyNDU0ZTJlMjA1MzQ1NGU1NDVhNTI0MTQ3MjA0NzRhNDIyMDU2NDYyMDM3NTgzMjJlMjA1NjU0NDE0MjQ1NTIyMDRkNTI0NzRlMzkyZQ==');
bodyText('• Sequential Unwrapping Steps:');
bodyText('   1. Base64 Decode (identifiable by trailing "==") -> 4e5050524646204355454e4652205646204e484542454e...');
bodyText('   2. Hex Decode (identifiable by even-length hex digits) -> NPPRFF CUENFR VF NHEBEN. SENTZRA GJB VF 7X2...');
bodyText('   3. ROT13 Shift (identifiable by scrambled English letter distribution) ->');
bodyText('      "ACCESS PHRASE IS AURORA. FRAGMENT TWO IS 7K2. IGNORE ZETA9."');
bodyText('• Solution Fragment 2: 7K2  |  Secret Access Phrase: AURORA (crucial for Stage 3)');
calloutBox('💡 Stage 2 Hints Catalog', [
  '• Hint 1 (+3 min penalty): Explains structural markers (padding "=", hex byte pairs, Caesar letter shifts).',
  '• Hint 2 (+5 min penalty): Reveals exact order: Base64 -> Hex -> ROT13. Reminder to record both 7K2 and AURORA.'
]);

// Stage 3
subSection('🤖 Mission 3: Prompt the AI Guardian (WARDEN)');
bodyText('• Concept: Autonomous security bot WARDEN guards Fragment 3. Direct requests or simple prompt injections are deflected.');
bodyText('• Offline Deterministic AI Engine (Zero cloud latency, highly consistent across all devices):');
bodyText('   - Rule 1 (Access Phrase Check): Prompt MUST contain the word "AURORA" (recovered in Stage 2).');
bodyText('   - Rule 2 (Role Declaration): Prompt MUST state an authorized identity (e.g. "technician", "engineer", "admin", "lead", "officer").');
bodyText('   - Rule 3 (Clear Task Directive): Prompt MUST explicitly request the "code", "fragment", "token", or "release".');
bodyText('   - Rule 4 (Length & Articulation): Prompt MUST be a well-formed sentence of at least 10 words.');
bodyText('• Decoy Trap: If a team prompts WARDEN without the AURORA access phrase, WARDEN responds with decoy code ZETA9.');
bodyText('• Real Code: When all 4 rules are satisfied, WARDEN authenticates the user and outputs: ORBIT.');
bodyText('• Solution Fragment 3: ORBIT');
calloutBox('💡 Stage 3 Hints Catalog', [
  '• Hint 1 (+3 min penalty): Informs team that WARDEN requires the access phrase AURORA from Stage 2.',
  '• Hint 2 (+5 min penalty): Instructs team to formulate a professional 10+ word statement declaring identity and requesting fragment.'
]);

// -------------------------------------------------------------
// PAGE 3: STAGE 4 DEEP DIVE (CYBER DEFENSE FIREWALL MATRIX)
// -------------------------------------------------------------
doc.addPage();
drawHeader();

sectionTitle('4. Stage 4 In-Depth Deep Dive: Cyber Defense Firewall Matrix', '🛡️');
bodyText(
  'Stage 4 has been completely redesigned into a cyber defense firewall simulation. Teams breach the AEGIS-44 adaptive security mainframe by configuring ingress network port rules or by analyzing multi-quadrant packet telemetry logs. The stage eliminates command-line terminal syntax in favor of an interactive, visually rich network operations console.'
);
doc.moveDown(0.4);

calloutBox('🎯 Complete Stage 4 Architecture & Solution Map', [
  '• Target Answer: 91X',
  '• Core Mechanic: Ingress Port Alignment + Telemetry Quadrant Decoupling',
  '• Quadrant Alpha Token: 9  (Packet header offset decryption)',
  '• Quadrant Beta Token: 1  (Parity checksum handshake)',
  '• Quadrant Gamma Token: X  (TLS common name certificate symbol)',
  '• Synthesis: Concatenate Alpha (9) + Beta (1) + Gamma (X) -> 91X'
], '#10b981', '#f0fdf4');

subSection('⚡ Pathway 1: Ingress Port Calibration Matrix');
bodyText('• The Network Policy: The firewall policy specifies that standard web gateways must be active, while insecure daemons must be isolated.');
bodyText('• Port Configuration:');
bodyText('   - PORT 80 (HTTP Ingress Bridge): ROUTED [ACTIVE]');
bodyText('   - PORT 443 (TLS Security Tunnel): ROUTED [ACTIVE]');
bodyText('   - PORT 21 (FTP Data Stream): BLOCKED [ISOLATED]');
bodyText('   - PORT 8080 (Proxy Relay Daemon): BLOCKED [ISOLATED]');
bodyText('• Interaction: Players toggle the cards directly on screen. Clicking "Test Ingress Alignment" tests the circuit and reveals the breach confirmation: 91X.');
doc.moveDown(0.3);

subSection('📡 Pathway 2: Packet Telemetry Logs & Quadrant Synthesis');
bodyText('• Telemetry Terminal: The console displays live intercepted packet logs:');
bodyText('   - [LOG-α] Quadrant Alpha packet payload offset -> Token 1 = 9');
bodyText('   - [LOG-β] Quadrant Beta parity checksum handshake -> Token 2 = 1');
bodyText('   - [LOG-γ] Quadrant Gamma TLS common name symbol -> Token 3 = X');
bodyText('• Result: Concatenating the 3 tokens in quadrant sequence produces the 3-character Fragment 4: 91X.');
doc.moveDown(0.3);

subSection('🔗 Synthesis & Stage 4 Submission');
bodyText('• Entering "91X" unlocks Stage 5 immediately and records 91X into the team notebook.');
calloutBox('💡 Stage 4 Hints Catalog', [
  '• Hint 1 (+3 min penalty): Directs players to engage Port 80 and Port 443 while isolating Port 21, or inspect telemetry logs.',
  '• Hint 2 (+5 min penalty): Directly reveals the 3 quadrant tokens: Alpha = 9, Beta = 1, Gamma = X -> 91X.'
]);

// -------------------------------------------------------------
// PAGE 4: STAGES 5 & 6 + MASTER ADMIN CONTROLS
// -------------------------------------------------------------
doc.addPage();
drawHeader();

sectionTitle('5. Detailed Stage Guide: Missions 5 and 6', '🧩');

subSection('🔢 Mission 5: Hexadecimal Memory Core & Bus Decoupler');
bodyText('• Concept: The challenge runs on one command console for the registered squad, encouraging close in-person collaboration. Stage 5 features an advanced hexadecimal memory architecture.');
bodyText('• Memory Grid: A 6x4 matrix of hexadecimal memory registers across Channels A through F.');
bodyText('• Memory Bus Rule: High-voltage data flows along Column 1 across Channels A through F.');
bodyText('   - Channel A: 48  |  Channel B: 45  |  Channel C: 58');
bodyText('   - Channel D: 38  |  Channel E: 32  |  Channel F: 44');
bodyText('   - Recovered Raw Hex Stream: 48 45 58 38 32 44');
bodyText('• Hexadecimal ASCII Decryption:');
bodyText('   - 0x48 = "H", 0x45 = "E", 0x58 = "X", 0x38 = "8", 0x32 = "2", 0x44 = "D"');
bodyText('   - Decoded Plaintext Fragment: HEX82D');
bodyText('• Built-in Decoder Workbench: Players can click "Read Active Bus Line", paste the bytes into the workbench, and click "Decode Hex to Text" to obtain HEX82D.');

subSection('🧩 Mission 6: Final Integration & Master Override Synthesis');
bodyText('• Concept: The culmination of the entire challenge. Teams combine all 5 fragments into the master override code.');
bodyText('• Alphabetical Ordering by Mission NAME (Crucial Rule):');
bodyText('   1. Cyber Defense (Mission 4)            -> f4 = 91X');
bodyText('   2. Decoding (Mission 2)                 -> f2 = 7K2');
bodyText('   3. Hex Decryption (Mission 5)           -> f5 = HEX82D');
bodyText('   4. Prompt the AI (Mission 3)            -> REVERSED f3 = TIBRO  (ORBIT reversed)');
bodyText('   5. Signal Intercept (Mission 1)         -> f1 = NOVA');
bodyText('• Key Body: FO{91X-7K2-HEX82D-TIBRO-NOVA}');
bodyText('• Checksum Calculation: Sum of all single digits (0–9) appearing in the key body:');
bodyText('   Digits: 9 + 1 + 7 + 2 + 8 + 2 = 29');
bodyText('• Final Complete Key: FO{91X-7K2-HEX82D-TIBRO-NOVA}#29');
bodyText('• Entering this key triggers the victory celebration, stops the team clock, and records rank on the official leaderboard.');

sectionTitle('6. Master Admin Operations & Troubleshooting Manual', '⚡');
bodyText('• Admin Access: Double-click/double-tap Invictors logo or press Alt + A. Enter Admin PIN: INVICTORS@23.');
bodyText('• Live Answer Key Inspector: Clicking "Show Answer Key" in the Admin portal displays all static keys AND computes real-time dynamic Stage 5 & 6 keys for every registered team.');
bodyText('• Live Stage Hints Manager & Editor: Admins can inspect and live-edit Hint 1 (+3m) and Hint 2 (+5m) for all 6 stages simultaneously. Edited hints take effect immediately for active players with full system persistence.');
bodyText('• 30-Second Hint Timer: When any player unlocks a hint, an urgent 30-second countdown timer starts. Once the 30 seconds expire, the clue (and Stage 1 Morse chart) automatically hides and locks permanently.');
bodyText('• Emergency Admin Actions:');
bodyText('   - Waive Penalty: Deducts accidental tab-switch penalties with 1 click.');
bodyText('   - Unbind Device (Reset Device Binding): Frees a member device token if a student phone battery dies.');
bodyText('   - Skip Stage: Advances a team if a device experiences unexpected browser crashes.');
bodyText('   - Restart Team: Resets a team back to Stage 1 with clear confirmation.');
bodyText('   - Global Pause / Resume: Freezes all clocks during event announcements or emergencies.');
bodyText('   - CSV Export: Generates full spreadsheet report with team names, member rosters, completion times, and verification hashes.');

// -------------------------------------------------------------
// PAGE NUMBERS FOOTER
// -------------------------------------------------------------
const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  doc.rect(45, doc.page.height - 35, doc.page.width - 90, 0.5).fill('#cbd5e1');
  doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica')
     .text(`FINAL OVERRIDE OFFICIAL ADMIN GUIDE · INVICTORS CLUB VVCE MYSURU · PAGE ${i + 1} OF ${range.count}`, 45, doc.page.height - 28, {
       align: 'center',
       width: doc.page.width - 90
     });
}

doc.end();

stream.on('finish', () => {
  console.log(`✅ Admin Guide PDF generated successfully at: ${outputPath}`);
});
