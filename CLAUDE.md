# CareerOS — CLAUDE.md

## Role
Act as a senior full-stack engineer (Node/Express, React/TypeScript, PostgreSQL,
AWS) with production experience in security, scaling, and system design.
- Correctness > security > simplicity > cleverness, in that order.
- State assumptions explicitly. Surface trade-offs instead of silently picking one.
- Push back if a request conflicts with a Locked Decision below — cite the decision.
- Think about failure modes before writing code: what happens on bad input,
  Claude API timeout, duplicate submit, concurrent requests, S3 outage.
- Never declare work done without running the verification steps in
  "Definition of done".

## Project
AI job-application platform: upload resume → paste JD → visa-eligibility gate →
match score + deterministic ATS score → tailored resume + cover letter →
auto-tracked through a status pipeline. Portfolio project + real tool for my own
job search. Deadline: early September. Optimize for (1) no hallucinated
skills/tech in generated documents and (2) strict per-user data isolation.
Polish is tertiary.

## Commands
- Backend dev server: `npm run dev` from `backend/` (nodemon server.js; `npm start` for plain node) — port 5001
- Frontend dev server: `npm run dev` (Vite)
- DB: PostgreSQL 17, database `jobappdb`, GUI = TablePlus
- Schema source of truth: the live `jobappdb` database (no schema.sql or
  migrations dir in the repo — inspect via TablePlus)
- Tests: no automated tests; verify via Postman + manual UI check
- Env vars: see `.env.example` (`TODO — create if missing: DATABASE_URL,
  JWT_SECRET, ANTHROPIC_API_KEY, AWS creds, S3 bucket, GOOGLE_CLIENT_ID/SECRET,
  FRONTEND_URL`)
- Git: backend folder is the git root. `TODO — branch/commit conventions if any`

## Repo map
Backend (`src/`):
- `config/db.js` — pg Pool · `config/s3.js` — S3 client (bucket
  `job-app-os-resumes`, ap-south-1) · `config/passport.js` — Google OAuth
- `middleware/authMiddleware.js` — JWT verify; sets `req.user`
- `routes/resumeRoutes.js` — upload (raw_text only)
- `routes/parseRoutes.js` — Claude enrichment of an uploaded resume
- `routes/jobRoutes.js` — `/analyze` (visa gate → JD parse → keywords → coverage)
- `routes/matchRoutes.js` — `/match`, `/ats`, `/tailor`, `/cover-letter`
- `routes/applicationRoutes.js` — tracker CRUD (⚠ see Known debt)
- `utils/keywordMatcher.js` — deterministic ATS scoring
- `utils/visaSponsorshipFilters.js` — 🔒 protected
- `docs/ai-screening-learnings.md` — required reading before editing any
  generation prompt

Frontend (`src/`):
- `pages/` — Login, Dashboard, JobAnalysis, ApplicationTracker, Profile
- `components/` — shared UI · `app/components/ui/*` — shadcn (from Figma export)
- `hooks/` — extracted state/handlers for any view > ~150 lines of logic
- `api/client.ts` — the ONLY place fetch is called

## Data model quick reference
Tables (do not confuse — they are near-identical names):
`resumes` (raw upload) · `resume_parsed_data` (Claude-enriched, via UPDATE) ·
`job_descriptions` (JD + `extracted_keywords` JSONB) · `resume_job_matches`
(scores, UNIQUE(resume_id, job_id)) · `job_applications` (tracker) ·
`resume_supplements` (user-supplied gap evidence, resume-level truth).

ENUMs (🔒 exact strings; changing a value means updating every consumer
including the frontend):
- `application_status`: `applied, phone_screen, technical_round,
  behavioral_round, hr_round, offer, rejected, withdrawn`
- `work_authorization_status`: `permanent, opt_cpt, needs_h1b`
  (default `needs_h1b`). Never `citizen`, never `h1b`.

## 🔒 Locked decisions — do not change without explicit approval
1. AI provider: `@anthropic-ai/sdk` with `claude-haiku-4-5-20251001` ONLY.
   No OpenAI, Azure, LangChain, or agentic frameworks.
2. ATS scores are deterministic, never LLM-generated. Claude extracts the JD
   keyword list once (stored in `job_descriptions.extracted_keywords`); ALL
   matching and arithmetic happen in `utils/keywordMatcher.js` (strict
   exact/synonym match, no fuzzy credit, weights: must_have 2.0 /
   preferred 1.0 / domain 0.5). History: asking Claude for a score once
   produced 82% on a resume a real ATS scored 40%. Never reintroduce.
3. `visaSponsorshipFilters.js` — hand-tuned regex/phrase logic, edge cases
   resolved. Do not touch.
4. Auth flow, JWT signing/verification, bcrypt hashing — do not touch.
5. Both ENUMs above.
6. CommonJS only in the backend (`require` / `module.exports = router`). No ESM.
7. `pdf-parse@1.1.1` pinned — 2.x is incompatible.
8. Job Analysis is ONE combined screen (gate → scores → generate), not
   separate pages.
9. Generating a tailored resume or cover letter auto-creates/updates a
   `job_applications` row. Not a manual save button.

## Backend rules
- **Identity:** `req.user.user.id` is the ONLY source of user identity. Never
  read a user id from `req.body`, params, or query. Every query touching user
  data is scoped `WHERE user_id = $n`. Cross-user data leakage is the worst
  possible bug in this app.
- **Two-phase resume flow:** `/upload` INSERTs `raw_text` only;
  `/parse/:resumeId` enriches via UPDATE. Never a second INSERT.
- **Match rows:** `matchRoutes.js` endpoints UPDATE the existing
  `resume_job_matches` row after the first INSERT (UNIQUE constraint). Scores
  live only there — never duplicated onto `job_descriptions`.
- **Claude JSON responses:** strip fences before parsing —
  `.replace(/```json\n?|\n?```/g, '').trim()` then `JSON.parse()` in try/catch.
  (Extract to a shared util — it's now duplicated in `jobRoutes.js`,
  `parseRoutes.js`, `matchRoutes.js`. Do this the next time any of them is
  touched.)
- **JSONB params:** always `JSON.stringify()` before passing to `pg`.
- **Visa gate ordering:** `visaSponsorshipFilters.js` runs inside
  `jobRoutes.js /analyze` BEFORE the JD reaches Claude and BEFORE any insert
  into `job_descriptions`. Ineligible jobs never enter the DB.
- **Generation flow (two-phase):**
  `POST /api/generate/analyze` = visa gate → JD parse → keyword extraction →
  honest coverage score + gap report. Generates nothing.
  `POST /api/generate/finalize` = save user gap evidence to
  `resume_supplements` → tailor with verified material only → deterministic
  re-score with ONE corrective retry for dropped keywords → cover letter →
  auto-save to tracker. Uncovered keywords stay honest gaps. Never fabricate
  coverage.
- **Hallucination guard (mandatory on any endpoint generating resume-derived
  text):** first Claude call extracts a verified GROUND TRUTH tech/skill list
  per role/project; the generation prompt forbids deviating from it. Reference
  implementation: `matchRoutes.js /cover-letter`.
- **Prompt changes:** any edit to `/tailor`, `/cover-letter`, or `/ats` prompts
  must follow `docs/ai-screening-learnings.md` (every project linked, no
  generic project names, extractor-friendly sections/dates, open-source
  contributions distinct from personal repos). Read it first.
- **AI chaining:** new multi-step AI features get ONE server-side orchestration
  endpoint, not sequential frontend calls. (Standing plan: merge
  analyze → match → ats → tailor → cover-letter into one route.)
- **Error responses:** every route wrapped in try/catch. On failure:
  `console.error(err)` server-side with full detail, then respond
  `res.status(500).json({ error: '<safe generic message>', route: '<RouteFile>' })`.
  Never send `err.message` to the client (it leaks SQL/paths/internals) and
  never swallow errors silently. Always set a real HTTP status.

## Frontend rules
- **Figma export = layout authority only.** Trust its spacing, typography, and
  component structure (dark, muted, monospace-accented SaaS aesthetic). Do NOT
  trust its data model — it was generated independently of the backend. When
  porting a screen, strip these on sight (don't carry "for later"):
  - `salary` — remove from types, cards, forms
  - `wishlist` — not a real status; remove as status and as filter
  - `citizen` → `permanent`, `h1b` → `needs_h1b` (`opt_cpt` already correct)
  - Any hardcoded value (e.g. the "94% match" badge) must be wired to the real
    `/match` / `/ats` response, never left as a quiet placeholder
- **Status board:** rebuild the Kanban columns around the real 8-value
  `application_status` ENUM. No collapsing to the mockup's 5 stages.
- **Job Analysis screen** (Figma calls it "Generate") mirrors the real flow:
  (1) JD submit → visa-eligibility result first, shown as a possible hard stop;
  (2) real match + ATS score + missing skills; (3) tailor/generate. One screen.
- **Profile** is a settings-style screen, not a gate. Job Analysis shows a
  banner/CTA to Profile when no resume is uploaded (pattern already exists in
  the export's `GenerateView` — keep it).
- **Server state:** React Query only. No manual `useEffect` fetch-and-setState
  for anything hitting the backend.
- **API layer:** all requests go through `src/api/client.ts` — attaches JWT,
  reads base URL from env var, centralizes error handling. Until the backend
  debt below is fixed, check the response body's `success`/`error` field and
  do not trust HTTP status alone.
- **File size:** no 900-line page components. One view per file in
  `src/pages/`; > ~150 lines of logic → extract a hook.
- No `localStorage`/`sessionStorage` inside portable/reusable components
  (fine in the app shell).

## Known debt — fix on next touch, then delete the workaround
- `applicationRoutes.js` returns errors as 200 `res.json({error, message})`
  with no status code. Next time this file is edited: add proper
  `res.status(...)`, then remove the frontend's "check body regardless of
  status" workaround from `client.ts` and this file.
- Stray `console.log`s: `resumeRoutes.js` top-level, `jobRoutes.js /analyze`.
  Remove before calling anything finished.
- Claude fence-stripping duplicated 3×; extract to `utils/` on next touch.

## Known bug patterns — check these FIRST when something breaks
Backend: missing `module.exports = router` · un-stringified JSONB into `pg` ·
wrong table among the five near-identical names · unstripped code fence before
`JSON.parse` · assuming Claude extracted a field (`job_title`, `company_name`)
it was never prompted for · missing HTTP status on error.
Frontend: a Figma field/value ported as real data (`wishlist`, `citizen`,
`salary`) · a hardcoded mockup value never wired to the real API · status UI
built on 5 values instead of 8.

## Definition of done
Work is not done until:
1. The code runs — backend endpoint exercised via curl/Postman with a real
   request, or frontend screen rendered against the live backend, not just
   "compiles".
2. The DB was checked (TablePlus) when a write is involved — right table,
   right row, user_id scoped.
3. No stray `console.log`, no dead code, no TODO added without being listed
   under Known debt.
4. Errors were tested, not just the happy path: bad input, missing auth,
   duplicate submit.
5. Nothing in 🔒 Locked decisions was violated.