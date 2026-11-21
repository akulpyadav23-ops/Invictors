# CLEANUP REPORT — FINAL OVERRIDE (PHASE 1)

**Date:** 2026-11-21  
**Auditor / Engineer:** Senior Full-Stack & Reliability Engineer  
**Status:** Pre-cleanup inventory and risk evaluation completed.

---

## 1. Inventory & Proposed Actions

| Path                                                  | Type                 | Evidence (Searches / Usage)                                                                       | Action                    | Risk | Notes                                                                    |
| ----------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------- | ------------------------- | ---- | ------------------------------------------------------------------------ |
| `FINAL_OVERRIDE_ADMIN_GUIDE.pdf`                      | Generated Binary PDF | Tracked in git (`git ls-files`). Regenerated at runtime by `scripts/generate_admin_guide_pdf.js`. | **Delete (`git rm`)**     | Low  | Runtime PDF should be generated on demand and gitignored.                |
| `.npmrc`                                              | Config               | Contains deprecated `optional=true` which triggers npm warning on modern npm.                     | **Modify**                | Low  | Remove or configure properly for offline caching.                        |
| `.gitignore`                                          | Config               | Missing coverage for `backups/`, `*.sqlite*`, `mission.json`, `coverage/`, `dist/`.               | **Modify**                | Low  | Expand to fully cover logs, data, mission secrets, and artifacts.        |
| `.gitattributes`                                      | Config               | Does not exist in repository.                                                                     | **Create**                | Low  | Set `* text=auto eol=lf`.                                                |
| `.editorconfig`                                       | Config               | Does not exist in repository.                                                                     | **Create**                | Low  | Standardize 2-space indentation and utf-8 charset.                       |
| `public/assets/signal-normal.mp3`                     | Audio asset          | Tracked audio binary file.                                                                        | **Keep (Owner decision)** | Low  | Retained per rule 1.6 and 1.9.                                           |
| `public/assets/signal-normal.wav`                     | Audio asset          | Tracked audio binary file.                                                                        | **Keep (Owner decision)** | Low  | Retained per rule 1.6 and 1.9.                                           |
| `public/assets/signal-slow.wav`                       | Audio asset          | Tracked audio binary file.                                                                        | **Keep (Owner decision)** | Low  | Retained per rule 1.6 and 1.9.                                           |
| `public/assets/signal.mp3`                            | Audio asset          | Tracked audio binary file.                                                                        | **Keep (Owner decision)** | Low  | Retained per rule 1.6 and 1.9.                                           |
| `server/generateAssets.js`                            | Script               | Generates audio/visual test assets.                                                               | **Keep (Owner decision)** | Low  | Retained per rule 1.6 and 1.9.                                           |
| `public/js/audio.js`                                  | Client module        | Audio telemetry client module.                                                                    | **Keep / Refactor**       | Low  | Keep accessible fallback audio while Stage 1 defaults to Morse Matrix.   |
| `server/supabase_schema.sql`                          | SQL Schema           | Supabase schema reference.                                                                        | **Keep**                  | Low  | Inactive cloud reference retained for Phase 9 Vercel/Supabase readiness. |
| `server/logic/finalKey.js`                            | Logic                | Holds legacy `FO{...}#checksum` and reverse Stage 3 logic.                                        | **Phase 4 Replace**       | Med  | Marked for replacement by `deriveFinalAnswer` during Phase 4.            |
| `server/logic/warden.js` vs `server/routes/warden.js` | Modules              | Confusing identical filenames in different directories.                                           | **Phase 2 Rename**        | Med  | Will rename to `wardenEngine.js` and `wardenRoutes.js` in Phase 2.       |
| `server/routes/api.js`                                | Monolithic Route     | ~605 lines mixing registration, state, submissions, hints, join.                                  | **Phase 2 Split**         | Med  | Will split into modular routers in Phase 2.                              |
| `public/js/app.js`                                    | Monolithic Client    | 2,957 lines monolith with direct DOM rewrites and blinks.                                         | **Phase 2 & 7 Split**     | High | Will modularize into ES modules and view controllers in Phase 2/7.       |

---

## 2. Dynamic Reference Safety Verification

- **Asset references**: Checked `public/index.html` and `public/js/app.js` for references to `hero.jpg`, `logo.jpg`, `signal.mp3`. All verified.
- **Dynamic requires**: Checked for any `require(variable)` or string-built template path in `server/`. None detected except standard module imports.
- **NPM scripts**: Verified `npm start`, `npm run seed`, `npm test` references.

---

## 3. Execution Summary (Pass A)

- Deleted tracked `FINAL_OVERRIDE_ADMIN_GUIDE.pdf` from git index.
- Created `.gitattributes` and `.editorconfig`.
- Updated `.gitignore` with comprehensive ignores.
- Cleaned `.npmrc`.
