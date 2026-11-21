# MASTER EXECUTION PLAN & TRACEABILITY TABLE — FINAL OVERRIDE

## 1. Traceability Matrix

| Requirement / Section                 | Target Files                                                                                                                         | Verification / Test                                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0. Audit & Plan**                   | `docs/AUDIT.md`, `docs/PLAN.md`                                                                                                      | Verification of baseline and full audit documentation.                                                                                               |
| **1. Cleanup Pass A**                 | `.gitignore`, `.gitattributes`, `.editorconfig`, `docs/CLEANUP_REPORT.md`                                                            | `git status`, test suite passes without removed legacy clutter.                                                                                      |
| **2. Foundation & Structure**         | `server/config/`, `server/content/`, `server/routes/`, `server/services/`, `server/repositories/`, `server/lib/`, `api/index.js`     | `npm run lint`, `npm test`, server startup schema validation.                                                                                        |
| **3. Reliability & Concurrency**      | `server/lib/lock.js`, `server/lib/cache.js`, `server/lib/rateLimiter.js`, `server/lib/idempotency.js`, `server/repositories/sqlite/` | Concurrency & race condition unit/integration tests.                                                                                                 |
| **4.1 Registration & Lobby**          | `server/services/teamService.js`, `server/validators/`, `public/js/views/startView.js`                                               | 3 & 4 members accepted, 2 & 5 rejected; duplicate case-insensitivity; Start Together lobby tests.                                                    |
| **4.2 Stage 1 Memorise & Solve**      | `server/services/stage1Service.js`, `public/js/stages/stage1.js`, `server/content/mission.json`                                      | Injectable clock tests: 0-59s returns only chart + instructions, no sector data; 60s+ switches to solve grid.                                        |
| **4.3 Stage 2 Deterministic Orders**  | `server/services/stage2Service.js`, `public/js/stages/stage2.js`                                                                     | 200 teams all solvable with >=20 distinct seeded orders; lowercase required, uppercase gives notice with no penalty.                                 |
| **4.4 Stage 3 WARDEN AI**             | `server/services/wardenEngine.js`, `server/routes/wardenRoutes.js`                                                                   | Deterministic rule verification: access phrase, role, task, 10 words; unique decoy fragment; rate limits.                                            |
| **4.5 Stage 4 CTF & Terminal**        | `server/services/terminalService.js`, `public/js/stages/stage4.js`                                                                   | Path traversal protection (`cat ..` fails), comment token dynamic injection only on Stage 4.                                                         |
| **4.6 Stage 5 Team Sync**             | `server/services/stage5Service.js`, `server/routes/submissionRoutes.js`                                                              | Multi-device HMAC shards: 4-player (2 mixed + 2 alpha), 3-player (2 mixed + 1 alpha); yields fragment 5 for notebook.                               |
| **4.7 Stage 6 Final Integration**     | `server/services/stage6Service.js`, `server/logic/finalKey.js`                                                                       | 5-fragment dossier notebook synthesis; machine network nodes in hints; `deriveFinalAnswer` config rule; verification code; zero legacy FO/checksum. |
| **4.7 Anti-Cheat Tab Tracking**       | `server/services/antiCheatService.js`, `public/js/core/antiCheat.js`                                                                 | VisibilityChange debounce (5s), grace period (3s), exempt during Stage 4, capped penalties.                                                          |
| **5. Hint System & Admin Management** | `server/services/hintService.js`, `server/routes/hints.js`, `server/routes/adminHints.js`                                            | Central database table, server-enforced countdowns, admin live CRUD, role protection tests.                                                          |
| **6. Admin & Coordinator Operations** | `server/routes/admin/`, `server/routes/coordinator/`, `scripts/dryrun.js`                                                            | Timing-safe PIN verification, leader recovery session, export CSV/JSON, 5-team end-to-end dry-run.                                                   |
| **7. Tactical UI/UX Redesign**        | `public/css/tokens.css`, `public/css/layout.css`, `public/js/core/dom.js`                                                            | Zero emoji, technical HUD, non-flicker incremental DOM updater, responsive layout (360-1920px).                                                      |
| **8. Security Hardening**             | `server/middleware/auth.js`, `server/middleware/securityHeaders.js`                                                                  | Constant-time PIN compares, HTTP-only cookies, XSS sanitization, CSP headers.                                                                        |
| **9. Database & Vercel Readiness**    | `server/repositories/`, `server/migrations/`, `vercel.json`                                                                          | Migration runner, schema versioning, repository interface, serverless export validation.                                                             |
| **10. Testing & Load Testing**        | `tests/unit/`, `tests/integration/`, `tests/load/loadtest.js`                                                                        | 100% test pass rate, autocannon 150 teams / 600 players load test meeting p95/p99 targets.                                                           |
| **11. Cleanup Pass B & Delivery**     | `README.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, `docs/PERFORMANCE.md`                                                     | Final hygiene inventory, zero dead code, production launch verification.                                                                             |

---

## 2. Phase Execution Order

1. **Phase 1: Cleanup Pass A**: Inventory, prune tracked binaries and old artifacts, update `.gitignore`, `.gitattributes`, `.editorconfig`.
2. **Phase 2: Foundation, Structure, Secrets, Config**: Restructure directories, decouple router/services/repositories, extract single-source `mission.json` and `mission.example.json`, build Zod/schema env validator, set up linting.
3. **Phase 3: Backend Reliability, Performance, Scalability**: Create unified SQLite repository with native `node:sqlite` + `better-sqlite3` fallback, WAL, busy timeout, atomic transactions, per-team async lock, rate limiter, cache, and 304 polling.
4. **Phase 4: Game Rules & Stages**: Implement exact 6 stages with server-authoritative state transitions:
   - Stage 1: Memorise (60s countdown) -> Solve phase.
   - Stage 2: Seeded deterministic fragment orders, lowercase answer enforcement.
   - Stage 3: WARDEN deterministic rules with unique decoy.
   - Stage 4: CTF detailed briefing, virtual file system, dynamic token injection.
   - Stage 5: Multi-device Team Sync with HMAC shards (2 mixed + 2 alpha or 2 mixed + 1 alpha), yields notebook fragment 5.
   - Stage 6: Final Integration synthesizing 5 notebook fragments via `deriveFinalAnswer` with machine network hints.
   - Anti-cheat: Visibility debounce and Stage 4 exemption.
5. **Phase 5: Hint System & Admin Management**: Implement database-backed `hints` and `hint_config` with server countdowns and admin CRUD portal.
6. **Phase 6: Admin, Coordinator, Leaderboard Operations**: Constant-time PIN login, leader session recovery code, CSV/JSON export, dryrun script.
7. **Phase 7: UI/UX Redesign**: Implement tactical dark HUD, tokens.css, clean typography, self-hosted SVGs, non-flicker live updater.
8. **Phase 8: Security Hardening**: Constant-time PIN checks, CSP, XSS defenses, safe seed/wipe scripts.
9. **Phase 9: Database & Vercel Readiness**: Repository abstraction, migrations with `schema_version`, inactive Supabase/Firebase stubs, Vercel configuration.
10. **Phase 10: Testing & Load Testing**: Unit, integration, e2e, and autocannon load tests.
11. **Phase 11: Cleanup Pass B, Documentation, Final Report**: Final audit, documentation suite, executive report.
