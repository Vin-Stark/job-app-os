# How HackerRank's Hiring Agent Screens Resumes — Learnings for Job App OS

Source: `hiring-agent-main/` (HackerRank's open-source resume screener, MIT).
Purpose: our generated tailored resumes and cover letters must survive AI
screening agents like this one. This doc distills exactly how it decides who
gets shortlisted, and what our generation prompts must therefore do.

---

## 1. The pipeline (what happens to a submitted resume)

1. **PDF → Markdown** (PyMuPDF). Formatting survives only as headings, links,
   and plain text. Fancy layout, columns, graphics = lost or garbled.
2. **Per-section LLM extraction** into JSON Resume schema. Separate LLM calls
   for: Basics, Work, Education, Skills, Projects, Awards — each with a strict
   "extract ONLY this section, return ONLY JSON" prompt.
   - **Projects extraction captures only:** `name`, `description`, `url`,
     `technologies`. Anything not in those slots is invisible to scoring.
   - **Work extraction captures only:** company `name`, `position`,
     `startDate`/`endDate` (parsed from "Mon YYYY – Mon YYYY/Present" style
     ranges), `summary`, `highlights[]` (achievement bullets).
3. **GitHub enrichment.** If a GitHub profile URL is found in the resume, it
   fetches all repos, classifies each as `open_source` (contributor count > 1)
   vs `self_project` (single contributor), and has the LLM pick the top 7 —
   **hard-filtering out any repo where the candidate has fewer than 4 commits**
   and prioritizing 15+ commits and contributions to popular (1000+ star) repos.
4. **One evaluation LLM call** with a strict rubric (below), structured JSON
   output, capped scores, evidence required per category.

## 2. The scoring rubric (max 100 + 20 bonus − deductions, hard cap 120)

| Category | Max | What earns points |
|---|---|---|
| Open source | 35 | Contributions to OTHER people's projects; popular repos (1000+ stars); GSoC. Personal repos alone are **hard-capped at 10**. Hacktoberfest alone: 3–5. |
| Self projects | 30 | Complexity + real-world impact, not quantity. Tutorial projects (todo, calculator, weather, basic CRUD, notes, recipes) score 1–9; basic CRUD can score **0**. |
| Production | 25 | Real work/internship experience from `work`/`volunteer`. Extra credit for founder / early-stage (first 10–20 employees) roles. |
| Technical skills | 10 | Breadth in skills/languages + problem-solving evidence in projects/work. |

**Bonus (≤20 total):** GSoC +5, Girl Script SoC +3, founder/co-founder +3–5,
early-stage engineer +2–3, portfolio website +2, LinkedIn +1, quality
technical blog +1–3.

**Deductions (these are the killers):**
- **−3 to −5 per project with no GitHub link, live demo, or URL**
- −2 to −3 per project with a GitHub link but no live demo
- −1 to −2 per broken/inactive link
- −2 to −5 if the resume contains only simple tutorial projects
- −1 per generically named project ("Calculator", "Todo App", "Weather App")
- −2 if all projects read as classroom assignments / tutorials

**Explicitly ignored (fairness rules):** name, gender, demographics,
college/university name, GPA/CGPA, city/location. Space spent flexing these
earns zero points with this class of screener.

**Complexity signals it's told to reward:** auth + databases, real-time
features, ML/AI, microservices, mobile-native features, real users/adoption,
advanced algorithms/data structures, solving a real problem.

## 3. What this means for OUR generated resumes

These rules feed the `/tailor` prompt in `backend/src/routes/matchRoutes.js`
(and any future generation endpoint). The hallucination guard still applies —
we surface and restructure what's true, never invent links, repos, or metrics.

**Structure for the extractor, not the human:**
1. Standard, unambiguous section headings: Work Experience, Education,
   Skills, Projects, Awards. No creative headings, no multi-column layouts.
2. Dates as `Mon YYYY – Mon YYYY` or `Mon YYYY – Present`. Nothing exotic.
3. Work experience = company, title, dates, one-line summary, then
   achievement **bullets** (they map to `highlights[]`, which is what gets
   scored for production experience).
4. Project content must live in the four extractable slots: a specific name,
   a complexity-signaling description, a **URL**, and a technologies list.

**Content rules:**
5. **Every project gets a link.** GitHub URL minimum; live demo URL whenever
   one exists. A linkless project is a net-negative on the resume. If the
   user's source resume has projects without links, the tailored output
   should keep them only if strong, and we should surface a "add a link to X"
   suggestion rather than fabricate one.
6. **No generic project names.** "Todo App" → the project's real, specific
   name. Descriptions must lead with complexity/impact signals that are
   actually true: auth, database, real-time, scale, users, ML.
7. **Distinguish open-source contributions from personal repos.** If the user
   contributed to someone else's project, say so explicitly ("Contributed X
   to <project> (nk stars)") — screeners score that at up to 35 pts vs a
   10-pt cap for personal repos.
8. **Include profile URLs in the header:** GitHub (triggers enrichment —
   only helps if the profile shows ≥4 commits per highlighted repo),
   LinkedIn (+1), portfolio site (+2).
9. **Fewer, stronger projects.** One complex project beats five simple ones;
   each extra tutorial-tier project actively deducts points.
10. **Don't lead with GPA/school prestige/location** — this screener ignores
    them by design; that space should carry technical evidence instead.
11. Call out founder/early-startup roles and programs like GSoC explicitly
    by name — they trigger specific bonus rules.

## 4. What this means for our ATS score endpoint (`/ats`)

Our ATS scoring can adopt this rubric to be predictive of real screeners:
- Check every project for a URL; penalize missing links in the score and
  list them as concrete fixes.
- Flag generic project names and tutorial-tier projects.
- Check for GitHub/LinkedIn/portfolio URLs in the header.
- Check date-format parseability and standard section headings.
- Weight "contributions to others' projects" language separately from
  personal projects.

## 5. Cover letters

The screener never sees a cover letter — but AI application reviewers use the
same pattern: extract claims → verify against evidence. Same rules apply:
specific, verifiable, complexity-forward claims tied to linked artifacts;
no unverifiable superlatives.

## 6. Implementation notes worth stealing

- **Structured output enforcement:** it passes a JSON schema as the `format`
  parameter and still strips/reparses the response — same belt-and-suspenders
  we use with fence-stripping. Validate with a schema after parse.
- **Score capping in code, not just prompt:** every category max, the 20-pt
  bonus cap, and the 120 total cap are re-enforced in post-processing
  (`score.py` uses `min(score, max)`). Never trust the model to respect caps.
- **Per-section extraction calls** beat one mega-extraction for reliability —
  relevant if we ever deepen `parseRoutes.js`.
- **Evidence-required scoring:** every score must cite evidence from the
  resume — same shape as our hallucination-guard GROUND TRUTH pattern.
