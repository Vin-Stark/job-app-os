# Job App OS — Chrome Extension

Capture a job posting from any career page, hard-gate it on eligibility
(visa + experience + graduation year + degree + other hard requirements),
and — only if every check passes — run the analyze→tailor pipeline and drag the
tailored resume straight into the application's upload field.

Nothing is logged to your tracker unless the job passes every check.

## Build & load

```bash
cd extension
npm install
npm run build          # outputs dist/
```

Then in Chrome:
1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select `extension/dist`.
3. The extension ID is **pinned** (via the `key` in `manifest.json`) to
   `ohjfcikcenhffkpmppnpcjjegakaifne`, so `chrome-extension://ohjfcikcenhffkpmppnpcjjegakaifne`
   is already allow-listed in the backend (`EXTENSION_ORIGIN` in `backend/.env`).
   If you regenerate the key, update `EXTENSION_ORIGIN` to match and restart the backend.

Backend + web app must be running (`localhost:5001` / `localhost:5173`).

## First-time connect

Click the extension → **Connect account** → log in on the web app (email/password
OR Google both work). The token syncs automatically; reopen the popup and you're in.

## Configuration

`manifest.json` `host_permissions` and `vite.config.ts` `__API_BASE__`/`__APP_URL__`
point at localhost. For a deployed backend, set `VITE_API_BASE_URL` / `VITE_APP_URL`
at build time and add the production API/app origins to `host_permissions`.

## Manual test matrix

Auth / setup
- [ ] Not connected → popup shows **Connect account**.
- [ ] After web-app login (email) → popup shows authenticated state + resumes.
- [ ] After web-app login (Google) → same.
- [ ] Expired/blank token → popup returns to Connect state; API calls 401 → clear + prompt.
- [ ] Authenticated but **no resume uploaded** → clear "upload one in Profile" message.

Scraping (open a real posting on each)
- [ ] LinkedIn job → title/company/JD populate.
- [ ] Greenhouse / Lever / Ashby / Workday / SmartRecruiters / iCIMS → populate.
- [ ] A bespoke company careers page with JobPosting JSON-LD → populate (source: json-ld).
- [ ] A plain company page with no structure → readability fallback fills the JD.
- [ ] Restricted page (`chrome://`, Web Store, a PDF) → friendly "can't scrape, paste manually".
- [ ] **Use highlighted text** → selecting the JD then clicking fills the box.
- [ ] Manual paste into the JD box works when scraping misses.

Eligibility gate (all hard-block)
- [ ] Visa-ineligible JD (needs citizenship, you need sponsorship) → blocked, reasons shown,
      **no** `job_descriptions`/`job_applications` rows created (check TablePlus).
- [ ] Experience mismatch (JD "8+ years", junior resume) → blocked, nothing logged.
- [ ] Graduation-year mismatch (new-grad 2024 JD, 2026 resume) → blocked, nothing logged.
- [ ] Degree / clearance hard requirement unmet → blocked, nothing logged.
- [ ] Eligible JD → passes, proceeds to tailoring.
- [ ] Empty/garbled resume text → "re-upload it in Profile" (400), nothing logged.

Tailor / preview / drag (eligible path)
- [ ] Tailored resume generated; ATS % shown; exactly one `job_applications` row now exists.
- [ ] **Preview** opens the PDF in a new tab; text is selectable (ATS-parseable, not an image).
- [ ] **Download** saves `<company>_<role>_resume.pdf` to the Downloads bar.
- [ ] **Drag into the application** injects the handle; dragging it onto the page's
      "Upload resume" file field attaches the tailored PDF.
- [ ] If PDF generation fails, the tailored resume is still saved and a clear notice shows.

Resilience
- [ ] Backend down → "Cannot reach the server" (no crash).
- [ ] Rate limit hit (61st AI call in an hour) → "Rate limit reached", data untouched.
- [ ] Re-capturing the same JD reuses the cached parse (fast, no duplicate charge).
```
