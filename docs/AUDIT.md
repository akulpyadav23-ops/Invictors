# AUDIT AND BASELINE REPORT — FINAL OVERRIDE
**Date:** 2026-11-21  
**Auditor:** Senior Full-Stack & Reliability Engineer  
**Baseline Environment:** Node.js v26.3.0, npm 11.16.0, Windows NT 10.0.26200  
**Baseline Backup Archive:** `C:\Users\lenovo\.gemini\antigravity\brain\09ba018b-5a01-498c-81c1-5a9682f1e502\scratch\final_override_backup_baseline.tar.gz`

---

## 1. Baseline Test & Execution Results
- `npm install`: Ran on baseline `package.json`. Installed 97 packages. `better-sqlite3` was listed under `optionalDependencies` and was skipped/failed to compile due to missing prebuilds for Node v26 in an offline/sandboxed environment.
- `npm test`: FAILED initially (`Cannot find module 'better-sqlite3'`).
- Node v26 runtime note: Built-in `node:sqlite` (`DatabaseSync`, `StatementSync`) is fully functional natively in Node.js v26 and v22. Providing a clean unified SQLite repository adapter supporting native SQLite and `better-sqlite3` will ensure 100% offline, zero-native-compilation stability on Node 20, 22, and 26.

---

## 2. Comprehensive Itemized Audit

### Structure and Hygiene
| Item | Question / Finding | Status | Evidence (File:Line) |
|---|---|---|---|
| **a** | Committed junk (node_modules, db, wal, logs, PDFs, zips, etc.) | **YES** | `FINAL_OVERRIDE_ADMIN_GUIDE.pdf:1` (committed 19KB binary PDF in git root). Legacy audio assets: `public/assets/signal-normal.mp3`, `signal-normal.wav`, `signal-slow.wav`, `signal.mp3`. `.npmrc` has `optional=true`. |
| **b** | Duplicate or confusingly named files | **YES** | Duplicate filenames across folders: `server/logic/warden.js` (engine) and `server/routes/warden.js` (router). `server/logic/finalKey.js` vs `server/logic/shard.js`. |
| **c** | Oversized files and dead/monolithic code | **YES** | `server/routes/api.js` is 605 lines (monolithic handler). `public/js/app.js` is 2,957 lines (monolithic client). `server/dataService.js` is 600 lines with mixed direct SQL and Supabase calls. Console logs present in `server/routes/api.js:28`, `server/routes/warden.js:61,65`, etc. |
| **d** | Package manager, lockfile, engines, Node compatibility | **PARTIAL** | npm with `package-lock.json` v3. `package.json` lacks `"engines"` field and repository lacks `.nvmrc`. `better-sqlite3` in `optionalDependencies` fails without build tools on Node 26. |
| **e** | Docs/code drift | **YES** | `README.md:59` states `ADMIN_PIN=INVICTORS` while `.env.example:2` and `server/config.js:37` use `INVICTORS@23`. `README.md:65` lists `ANTHROPIC_API_KEY` which is unused in `server/logic/warden.js`. `README.md:123-128` describes a 6-stage game with `FO{...}#40` key, conflicting with 5-stage specification. |

### Secrets and Content
| Item | Question / Finding | Status | Evidence (File:Line) |
|---|---|---|---|
| **f** | Real answers, secrets, PINs, phone numbers in tracked files | **YES** | Hardcoded secrets and personal data in tracked files: `server/config.js:4-17` lists 12 student coordinator names and PINs (`DEFAULT_COORDINATOR_PINS`). `public/index.html:101-104` contains personal phone numbers of student coordinators. `server/config.js:37,51` hardcodes default `ADMIN_PIN` and `EVENT_SALT`. |
| **g** | Hardcoded answers across files | **YES** | Hardcoded across 10 files: `server/logic/stages.js:9,10,33,43,53`, `server/routes/api.js:293,296,299,302`, `server/routes/admin.js:284,290,296,303`, `server/routes/terminal.js:31,38,40`, `server/logic/warden.js:18,28`, `public/js/app.js:724,760,784,804,915`, `server/tests/acceptance.test.js:278,298,340,396`, `server/tests/new_features.test.js:114,192`, `server/tests/e2e-simulation.js:68,86,111,146`, `scripts/generate_admin_guide_pdf.js:113-118`. |

### Game Logic
| Item | Question / Finding | Status | Evidence (File:Line) |
|---|---|---|---|
| **h** | Stage count and stage names agreement | **NO** | Severe mismatch: `public/index.html:454` announces "THE 5 STAGES OF OVERRIDE", but `public/index.html:75-80` shows 6 rail steps. `server/logic/stages.js:5-76` defines 6 stages. `server/routes/api.js:106,358` requires 6 stages. Per Assumption A2, there must be exactly 5 stages (Stage 6 merged into Stage 5). |
| **i** | Stage 1 Signal Intercept vs Audio Telemetry & Phase gating | **NO** | `public/js/app.js:732-845` renders 4 sectors immediately on entry; `server/routes/api.js:181-183` sends `morsePattern` immediately. There is NO server-authoritative 60-second MEMORISE phase with chart-only and hidden sector data. Separate audio telemetry (`public/js/audio.js`) is coupled to Stage 1. |
| **j** | Stage 2 ciphertext layers, decoys, workbench, answer case | **PARTIAL** | Cipher layers (Base64 -> Hex -> ROT13) exist, but plaintext contains `IGNORE ZETA9` decoy line. Workbench in `public/js/app.js:863-885` lacks step history/undo, lacks Caesar shift config (fixed +3), lacks copy button. Answer validation in `server/routes/api.js:296` uses uppercase normalization, violating Assumption A5 (lowercase required, uppercase/mixed returns specific warning without penalty). |
| **k** | Stage 3 WARDEN rule engine vs LLM, rules, decoy | **PARTIAL** | Rule engine in `server/logic/warden.js:7-33` checks `AURORA`, role prefix regex, task words, 10 words. However, decoy fragment is `ZETA9`, which repeats the decoy from Stage 1 (violating requirement for a unique decoy). |
| **l** | Stage 4 CTF token injection and terminal security | **NO** | HTML comment token `<!-- token1 = 9 -->` is statically embedded in client code in `public/js/app.js:915`! Terminal in `server/routes/terminal.js:24-43` uses static string equality checks without real filesystem path traversal safeguards or detailed briefing. |
| **m** | Stage 5/6 team sync, shards, final answer derivation | **NO** | `server/logic/shard.js:4-6` derives shards from `sha256` without `SHARD_SECRET`. Does not implement 2 mixed + 2 alpha (4-player) or 2 mixed + 1 alpha (3-player) per A10. `server/logic/finalKey.js:7-29` uses `FO{...}#checksum` with mission name sorting and string reversal, which must be removed and replaced with `deriveFinalAnswer` (A9). |
| **n** | Member 4 required treatment | **PARTIAL** | `server/routes/api.js:49-55` filters non-empty members and requires >= 3. However, `memberCount` is not stored in the `teams` table, causing blank or undefined member displays. |
| **o** | Hint rules, costs, caps, display durations | **NO** | Costs are hardcoded in `server/routes/api.js:407-429`. Display duration (30s) is tracked purely via `sessionStorage` on client (`public/js/app.js:984-1002`). The server does not enforce hint expiration windows. No `hint_config` table exists. |
| **p** | Penalties (wrong attempts, tab switches, pause handling) | **NO** | `public/js/app.js:122-131` binds both `blur` and `visibilitychange`, causing double counting. Tab switch penalty applies during Stage 4 DevTools inspection. Server timestamps do not compute effective time minus pause for all windows. |
| **q** | Verification code construction | **NO** | `server/logic/security.js:21-24` creates verification code via plain `sha256(teamName + startedAt + finishedAt).slice(0,8)`. It lacks a server secret (HMAC-SHA256) and is easily forgeable. |
| **r** | Time cap enforcement | **NO** | `TIME_CAP_MINUTES` is defined in `server/config.js:50`, but nowhere in `server/routes/api.js` or `server/dataService.js` is the time cap checked or enforced during submissions. |

### Security and Operations
| Item | Question / Finding | Status | Evidence (File:Line) |
|---|---|---|---|
| **s** | Coordinator login security | **NO** | `server/config.js:4-17` has hardcoded PINs; `server/routes/coordinator.js:29-34` skips PIN verification in test/admin mode; coordinator names are auto-suggested publicly in `public/js/app.js:449`. |
| **t** | Admin PIN handling and session controls | **NO** | `server/routes/admin.js:30` compares PIN with `pin !== config.ADMIN_PIN` (vulnerable to timing attacks). No rate limiting on admin/coordinator login. |
| **u** | Stored XSS via innerHTML | **YES** | Extensive use of `innerHTML` in `public/js/app.js` without escaping for team names and messages in several views. |
| **v** | Database wipe/seed confirmation & test isolation | **NO** | `scripts/wipe_database.js:9-69` executes complete wipe without any confirmation flag (`--yes`). `server/tests/acceptance.test.js:83-84` executes against `require('../db')`. |
| **w** | Leader session recovery | **NO** | No endpoint or recovery workflow exists to reissue a session token if the leader's device dies. |

### Performance and Reliability
| Item | Question / Finding | Status | Evidence (File:Line) |
|---|---|---|---|
| **x** | Polling design & screen blinking | **NO** | `public/js/app.js:415-433` polls every 4s and calls `renderApp()`, wiping out the entire `#app-main` DOM, losing input focus, re-triggering animations, and blinking the screen. |
| **y** | Concurrency, transactions, and race conditions | **NO** | No async mutex lock per team. Submission handling in `server/routes/api.js:252-400` reads team, processes, and writes without `BEGIN IMMEDIATE` or conditional updates, making it vulnerable to double-submit race conditions. |

### UI / UX
| Item | Question / Finding | Status | Evidence (File:Line) |
|---|---|---|---|
| **z** | UI defects and design inconsistencies | **YES** | Emoji littered across headers, cards, buttons (`🚀`, `🎧`, `🤖`, `🚩`, `💡`, `👥`, `👑`). Text gradients, neon shadows, inconsistent padding, non-standard cards. Lacks a compact HUD, accessible form controls, and responsive layout for 360px-1920px. |

---

## 3. Plan & Order of Remediation
Following the Phase-by-Phase Execution Protocol:
1. **Phase 1: Cleanup Pass A**: Inventory, prune unused files, remove PDF from git tracking, add LF `.gitattributes` and `.editorconfig`, update `.gitignore`.
2. **Phase 2: Foundation, Structure, Secrets, Config**: Build target folder architecture, decouple routes into focused modules, extract all mission content into `server/content/mission.json` and committed `mission.example.json`, build Zod/schema env validator, setup ESLint and Prettier.
3. **Phase 3: Backend Reliability & Performance**: Implement unified SQLite repository adapter with native `node:sqlite` + `better-sqlite3` fallback, WAL, busy timeout, atomic `BEGIN IMMEDIATE` transactions, per-team async mutex lock, idempotency key middleware, rate limiter, cache, and ETag/304 state polling.
4. **Phase 4: Game Rules and Stages**: Enforce exactly 5 stages, implement Stage 1 Memorise (60s countdown) vs Solve phases, Stage 2 lowercase enforcement and seeded fragment orders, Stage 3 deterministic WARDEN rules, Stage 4 in-memory CTF virtual filesystem and dynamic token injection, Stage 5 multi-device join with HMAC shards and `deriveFinalAnswer`.
5. **Phase 5: Hint System & Admin Hint Management**: Central database-backed `hints` and `hint_config` table with server-enforced expiration countdowns, admin CRUD API, audit logs, and CSRF/role protections.
6. **Phase 6: Admin, Coordinator, Leaderboard Operations**: Secure PIN login with constant-time compare, rate limiting, leader session recovery code, CSV/JSON export, projector leaderboard with freeze toggle, dry-run script.
7. **Phase 7: UI/UX Redesign**: Tactical dark HUD, zero emoji, self-hosted inline SVGs, tokens.css, non-flickering incremental DOM updater, responsive across 360px-1920px.
8. **Phase 8: Security Hardening**: Constant-time PIN comparisons, HTTP-only cookies, strict CSP, XSS sanitization, anti-cheat tab visibility debounce.
9. **Phase 9: Database & Vercel Readiness**: Repository interface with inactive Supabase/Firebase stubs, clean migration runner, serverless-ready exports.
10. **Phase 10: Testing & Load Testing**: Unit, integration, e2e, and autocannon load tests achieving 150 teams / 600 players targets.
11. **Phase 11: Cleanup Pass B, Docs, Final Report**: Documentation, cleanup verification, and executive delivery report.
