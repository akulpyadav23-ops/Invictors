# STAGE 6 RECOVERY AUDIT & SPECIFICATION MAPPING

**Date:** 2026-11-21  
**Repository:** Final (Invictors Club · Dept. of CSE, VVCE Mysuru)  
**Task:** Full Restoration of 6-Stage Game Architecture & Removal of 5-Stage Assumptions

---

## 1. Executive Summary & Recovery Baseline

In an earlier prompt cycle, Assumption A2 incorrectly instructed that the game had exactly five stages and that "any former Stage 6 (Final Integration) is merged into Stage 5". Per the supervisor instruction of 2026-11-21, that directive is explicitly overridden: **THE GAME HAS SIX STAGES**.

Prior to modifying any working tree assets, an external pre-recovery backup was created:

- **Backup Archive Path:** `C:\Users\lenovo\.gemini\antigravity\brain\09ba018b-5a01-498c-81c1-5a9682f1e502\scratch\final_override_backup_before_stage6_restore.tar.gz`

Git forensic inspection identified that the authentic six-stage implementation was present in commit `9521792` ("feat: added front-page critical notice for Stage 6 mission names, admin live hints editor, and 30s hint countdown timer") and baseline commit `8daae39`.

---

## 2. Component Recovery Status Matrix

| Component                              | Status                                   | Source Location / Commit Hash                                                                         | Description / Recovery Plan                                                                                                                                                          |
| :------------------------------------- | :--------------------------------------- | :---------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stage 6 Definition**                 | Exists in Git history & legacy files     | `9521792:public/js/app.js:703,962`<br>`9521792:scripts/generate_admin_guide_pdf.js:279`               | Name: "Final Integration". Order: Stage 6. Adapt story line to remove FO / checksum / reverse / alphabetical-mission rules. Add hint-based machine challenge.                        |
| **Stage 6 Server Logic**               | Exists in Git history & legacy files     | `9521792:server/routes/api.js:318-335`<br>`9521792:server/logic/finalKey.js:1-34`                     | Legacy used `computeFinalKey(f1, f2, f3, f4, f5)` with `FO{...}#checksum`. Restore as modular `server/services/stage6Service.js` implementing new config-driven `deriveFinalAnswer`. |
| **Stage 6 Client View**                | Exists in Git history                    | `9521792:public/js/app.js:962-978`                                                                    | Legacy view rendered 4 obsolete rules. Adapt into tactical 6-stage view module (`public/js/stages/stage6.js`) with machine-hint panel and final key input.                           |
| **Stage 6 DB Fields & Constraints**    | Modified to 5 in `82e3368`; 6 in history | `82e3368:server/migrations/001_initial_schema.sql`<br>`9521792:server/db/schema.sql`                  | `teams.stage` and `progress.stage` CHECK constraints must allow 1..6. Progress rows initialized for 6 stages per team.                                                               |
| **Stage 6 Tests & Simulation**         | Exists in Git history                    | `9521792:server/tests/acceptance.test.js:544-565`<br>`9521792:server/tests/e2e-simulation.js:203-225` | Reintroduce comprehensive Stage 6 unit and integration tests. Add test verifying absence of old FO / checksum / reverse / alphabetical-name logic.                                   |
| **Stage 6 Admin, Coord & Leaderboard** | Exists in Git history                    | `9521792:server/routes/admin.js:268-276`<br>`9521792:public/js/app.js:2135`                           | Admin answers table displays dynamic Stage 6 key; leaderboard tracks stages out of 6; completion triggers only upon Stage 6 solve.                                                   |
| **5-Stage Assumptions in Tree**        | Exists in current working tree           | Multiple files in `server/`, `docs/`, `tests/`                                                        | Detailed below; all being systematically transitioned to dynamic `STAGE_COUNT = 6`.                                                                                                  |

---

## 3. Detailed Inventory of 5-Stage Occurrences in Working Tree

The following working tree files contained assumptions of 5 stages or merged Stage 5/6:

1. `server/content/loader.js` (line 34): `throw new Error('mission.json must define all 5 stages.')` -> Change to `6`.
2. `server/content/mission.json` & `server/content/mission.example.json`: Contained 5 stages where Stage 5 had override derivation. -> Split into Stage 5 (Team Sync: shards + team code fragment 5) and Stage 6 (Final Integration: machines + `deriveFinalAnswer`).
3. `server/migrations/001_initial_schema.sql`: CHECK constraints `stage >= 1 AND stage <= 5`. -> Update to `<= 6`.
4. `server/services/teamService.js`: `repos.progress.initForTeam(teamId, 5)`. -> Update to `6`.
5. `server/services/stage5Service.js`: Was handling final override answer. -> Revert to pure Stage 5 Team Sync (validating member joins, assembling team code from sorted player shards, returning fragment 5 for notebook).
6. `server/services/stage6Service.js` (NEW): Created to handle Stage 6 Final Integration, machine names, and config-driven `deriveFinalAnswer`.
7. `server/routes/submissionRoutes.js`: Handled completion on stage 5. -> Transition: completion occurs ONLY on Stage 6. Stage 5 unlocks Stage 6 and provides fragment 5.
8. `server/routes/stateRoutes.js`: Only mapped stages 1..5. -> Add Stage 6 state payload.
9. `server/routes/adminRoutes.js`: Stage reset was 1..5; answer inspector had `stage5FinalKey`. -> Update to 1..6, and add `stage6FinalKey`.
10. `server/services/leaderboardService.js`: Formatted `Stage ${t.stage} of 5`. -> Update to `Stage ${t.stage} of 6`.
11. `server/routes/coordinatorRoutes.js`: Displayed `Stage ${t.stage}/5`. -> Update to `Stage ${t.stage}/6`.
12. `server/index.js`: Consistency check queried `progressCount < 5`. -> Update to `< 6`.
13. `tests/`: Unit and integration test suites asserted completion on Stage 5. -> Update to 6 stages, add dedicated tests for Stage 6 isolation and grep-based verification of legacy rule removal.

---

## 4. Removal of Legacy Stage 6 Rules (Strict Enforcement)

The legacy rules from `server/logic/finalKey.js` and `public/js/app.js` are completely expunged:

- ❌ **"Alphabetical order of mission names"**: Removed.
- ❌ **`FO{...}` wrapper**: Removed.
- ❌ **Digit-sum `#` checksum calculation**: Removed.
- ❌ **"Write Stage 3 piece backwards"**: Removed.

Replaced by:

- ✅ **Configurable Machine Hints**: Explicit machine identifiers from `mission.json` provided via the Stage 6 hint.
- ✅ **Unified `deriveFinalAnswer` Function**: Single config-driven implementation for generating and validating the final key from the 5 notebook fragments and member codes.
