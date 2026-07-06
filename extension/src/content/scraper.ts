// Universal JD scraper. Designed to run as an injected function via
// chrome.scripting.executeScript, so it must be SELF-CONTAINED (no imports —
// everything it needs is defined inside scrapeActiveTab). It returns the best
// {job_title, company_name, raw_text, source} it can find using a layered
// cascade, and NEVER throws — worst case it returns whatever text it has so the
// user can edit it in the popup.
//
// It is ASYNC because the strongest LinkedIn anchor is a same-origin fetch of
// the job's own /jobs/view/<id> page (chrome.scripting awaits promised results).

import type { ScrapedJob } from '../lib/types'

export async function scrapeActiveTab(): Promise<ScrapedJob> {
  const clamp = (s: string, n = 20000) => (s || '').slice(0, n)
  const clean = (s: string) =>
    (s || '')
      .replace(/ /g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()

  const textOf = (el: Element | null | undefined): string =>
    el ? clean((el as HTMLElement).innerText || el.textContent || '') : ''

  const firstText = (selectors: string[]): string => {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel)
        const t = textOf(el)
        if (t) return t
      } catch { /* invalid selector on this page — skip */ }
    }
    return ''
  }

  const metaContent = (names: string[]): string => {
    for (const n of names) {
      const el =
        document.querySelector(`meta[property="${n}"]`) ||
        document.querySelector(`meta[name="${n}"]`)
      const c = el?.getAttribute('content')
      if (c) return clean(c)
    }
    return ''
  }

  // ── Shadow-DOM piercing walkers ───────────────────────────────────────────
  // Chrome excludes shadow-root content from innerText and querySelector.
  // Modern LinkedIn renders the job details inside shadow roots, so anything
  // that matters must be collected with walkers that descend into open roots.
  let shadowHosts = 0
  const deepText = (root: unknown, cap = 30000): string => {
    if (!root) return ''
    const parts: string[] = []
    let total = 0
    const walk = (n: { nodeType?: number; textContent?: string | null; tagName?: string; childNodes?: ArrayLike<unknown>; shadowRoot?: { childNodes?: ArrayLike<unknown> } | null }) => {
      if (!n || total > cap) return
      if (n.nodeType === 3) { // text node
        const t = (n.textContent || '').trim()
        if (t) { parts.push(t); total += t.length }
        return
      }
      if (n.nodeType !== 1) return // elements only below
      const tag = n.tagName || ''
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') return
      if (n.shadowRoot && n.shadowRoot.childNodes) {
        shadowHosts++
        for (const c of Array.from(n.shadowRoot.childNodes)) walk(c as never)
      }
      if (n.childNodes) for (const c of Array.from(n.childNodes)) walk(c as never)
    }
    walk(root as never)
    return clean(parts.join('\n')).slice(0, cap)
  }

  // All elements matching a predicate, descending into open shadow roots.
  const deepFindAll = (pred: (el: HTMLElement) => boolean, limit = 50): HTMLElement[] => {
    const out: HTMLElement[] = []
    const walk = (n: unknown) => {
      if (out.length >= limit) return
      const el = n as HTMLElement & { shadowRoot?: ShadowRoot | null }
      if (!el || el.nodeType !== 1) return
      try { if (pred(el)) out.push(el) } catch { /* predicate failed */ }
      if (el.shadowRoot && (el.shadowRoot as ShadowRoot).children) {
        for (const c of Array.from((el.shadowRoot as ShadowRoot).children)) walk(c)
      }
      if (el.children) for (const c of Array.from(el.children)) walk(c)
    }
    if (document.body) walk(document.body)
    return out
  }

  // ── Company-name helpers ──────────────────────────────────────────────────
  const isAtsName = (s: string): boolean => {
    const t = clean(s).replace(/\s+(job board|jobs|careers|hiring)$/i, '').trim()
    return /^(greenhouse|lever|ashby|ashbyhq|workday|myworkdayjobs|smartrecruiters|icims|workable|recruitee|jobvite|bamboohr|taleo|linkedin|indeed|glassdoor|jobs?|careers?)$/i.test(t)
  }

  const titleCase = (s: string): string =>
    s.replace(/[-_]+/g, ' ').trim().split(/\s+/)
      .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')

  const companyFromUrl = (): string => {
    const path = location.pathname.split('/').filter(Boolean)
    const h = location.hostname
    const sub = h.split('.')[0]
    try {
      if (h.includes('greenhouse.io') && path[0] && !/^(embed|job_app|jobs)$/i.test(path[0])) return titleCase(decodeURIComponent(path[0]))
      if (h.includes('lever.co') && path[0]) return titleCase(decodeURIComponent(path[0]))
      if (h.includes('ashbyhq.com') && path[0]) return titleCase(decodeURIComponent(path[0]))
      if (h.includes('myworkdayjobs.com') && sub) return titleCase(sub)
      if (h.includes('smartrecruiters.com') && path[0] && !/^(job|jobs)$/i.test(path[0])) return titleCase(decodeURIComponent(path[0]))
      if (h.includes('workable.com') && path[0] && path[0] !== 'j') return titleCase(decodeURIComponent(path[0]))
      if (h.endsWith('recruitee.com') && sub) return titleCase(sub)
      if (h.includes('bamboohr.com') && sub) return titleCase(sub)
      if (h.includes('icims.com')) { const c = sub.replace(/^careers-?/, ''); if (c) return titleCase(c) }
      if (h.includes('jobvite.com') && path[0]) return titleCase(decodeURIComponent(path[0]))
    } catch { /* malformed URL segment — fall through */ }
    return ''
  }

  const companyFromDocTitle = (): string => {
    const t = clean(document.title)
    let m = /^(.{2,60}?)\s+hiring\s+/i.exec(t)
    if (m) return clean(m[1])
    m = /\bat\s+([^|•·–—]{2,60}?)(?:\s*[|•·–—]|$)/i.exec(t)
    if (m) return clean(m[1])
    return ''
  }

  // ── JSON-LD JobPosting extraction (works on any Document) ────────────────
  const jsonLdFromDoc = (doc: Document): Partial<ScrapedJob> | null => {
    let nodes: Element[] = []
    try { nodes = Array.from(doc.querySelectorAll('script[type="application/ld+json"]')) } catch { return null }
    const stripTags = (html: string) => {
      try {
        const d = doc.createElement('div')
        d.innerHTML = html
        return clean((d as HTMLElement).innerText || d.textContent || '')
      } catch { return clean(html.replace(/<[^>]+>/g, ' ')) }
    }
    const walk = (obj: unknown): Record<string, unknown> | null => {
      if (!obj || typeof obj !== 'object') return null
      if (Array.isArray(obj)) {
        for (const item of obj) { const r = walk(item); if (r) return r }
        return null
      }
      const o = obj as Record<string, unknown>
      const t = o['@type']
      const isJob = t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'))
      if (isJob) return o
      if (o['@graph']) return walk(o['@graph'])
      return null
    }
    for (const node of nodes) {
      try {
        const parsed = JSON.parse(node.textContent || 'null')
        const job = walk(parsed)
        if (!job) continue
        const title = typeof job.title === 'string' ? clean(job.title) : ''
        const org = job.hiringOrganization as Record<string, unknown> | string | undefined
        const company =
          typeof org === 'string' ? clean(org)
          : org && typeof org === 'object' && typeof org.name === 'string' ? clean(org.name)
          : ''
        const desc = typeof job.description === 'string' ? stripTags(job.description) : ''
        if (title || desc) {
          return { job_title: title, company_name: company, raw_text: desc, source: 'json-ld' }
        }
      } catch { /* malformed JSON-LD block — skip */ }
    }
    return null
  }

  // ── Voyager JSON extraction: LinkedIn embeds API responses in <code> tags.
  //    Works with code-tag text contents from ANY document (live or fetched). ─
  const voyagerFromCodes = (codeTexts: string[], jobId: string): { title: string; company: string; desc: string } | null => {
    for (const raw of codeTexts) {
      if (!raw || !raw.includes(jobId) || !raw.includes('description')) continue
      let data: unknown
      try { data = JSON.parse(raw) } catch { continue }
      let posting: Record<string, unknown> | null = null
      const companies = new Map<string, string>()
      const stack: unknown[] = [data]
      while (stack.length) {
        const cur = stack.pop()
        if (!cur || typeof cur !== 'object') continue
        if (Array.isArray(cur)) { for (const x of cur) stack.push(x); continue }
        const o = cur as Record<string, unknown>
        const urn = typeof o.entityUrn === 'string' ? o.entityUrn : ''
        if (typeof o.name === 'string' && urn && /company/i.test(urn + String(o.$type || ''))) {
          companies.set(urn, o.name)
        }
        if (!posting && urn.includes(jobId) && typeof o.title === 'string' &&
            (o.description !== undefined || o.jobState !== undefined || o.jobPostingId !== undefined)) {
          posting = o
        }
        for (const v of Object.values(o)) stack.push(v)
      }
      if (posting) {
        const title = typeof posting.title === 'string' ? clean(posting.title) : ''
        const descField = posting.description as { text?: string } | string | undefined
        const desc = clean(
          typeof descField === 'string' ? descField :
          descField && typeof descField.text === 'string' ? descField.text : ''
        )
        let company = ''
        if (companies.size > 0) {
          const pstr = JSON.stringify(posting)
          for (const [urn, name] of companies) {
            if (pstr.includes(urn)) { company = clean(name); break }
          }
          if (!company && companies.size === 1) company = clean([...companies.values()][0])
        }
        if (title || desc) return { title, company, desc }
      }
    }
    return null
  }

  // ── Layer 2: known ATS platforms, dispatched by HOST first ───────────────
  const host = location.hostname
  const notes: string[] = []
  const isPlatformHost = /linkedin\.com|indeed\.|greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|smartrecruiters\.com|icims\.com|workable\.com|recruitee\.com|jobvite\.com|bamboohr\.com|taleo\.net/.test(host)

  const fromAts = async (): Promise<Partial<ScrapedJob> | null> => {
    // LinkedIn FIRST — class names churn constantly AND the details pane may
    // live inside shadow DOM (invisible to innerText/querySelector) or not be
    // rendered in this frame at all. Anchors, strongest last:
    //   fast path: class selectors → embedded <code> JSON (light + shadow) →
    //   selected card by job id → "About the job" text descent →
    //   SAME-ORIGIN FETCH of /jobs/view/<id> (needs no rendering at all).
    if (host.includes('linkedin.com')) {
      const detailsRoot = (
        document.querySelector('.jobs-search__job-details--container') ||
        document.querySelector('.jobs-search__job-details--wrapper') ||
        document.querySelector('.job-view-layout') ||
        document.querySelector('.jobs-details')
      ) as HTMLElement | null

      const scoped = (root: ParentNode | null, selectors: string[]): string => {
        for (const sel of selectors) {
          try {
            const el = (root ?? document).querySelector(sel)
            const t = textOf(el)
            if (t) return t
          } catch { /* bad selector — skip */ }
        }
        return ''
      }

      notes.push(`li:pane=${detailsRoot ? 'found' : 'MISSING'}`)

      // Fast path: class selectors (work when LinkedIn hasn't churned them)
      let title = scoped(detailsRoot, [
        '.job-details-jobs-unified-top-card__job-title',
        '.jobs-unified-top-card__job-title',
      ])
      let company = scoped(detailsRoot, [
        '.job-details-jobs-unified-top-card__company-name',
        '.jobs-unified-top-card__company-name',
      ])
      let body = scoped(detailsRoot ?? document, [
        '#job-details',
        '.jobs-description-content__text',
        '.jobs-description__content',
        '.description__text',
        '.show-more-less-html__markup',
      ])
      if (title) notes.push('title=class')
      if (company) notes.push('company=class')
      if (body) notes.push('body=class')

      // Job id from the URL — used by every anchor below
      let jobId = ''
      try {
        jobId =
          new URLSearchParams(location.search).get('currentJobId') ||
          (/\/jobs\/view\/(\d+)/.exec(location.pathname)?.[1] ?? '')
      } catch { /* no URLSearchParams — leave empty */ }
      notes.push(`jobId=${jobId || 'MISSING'}`)

      // Deep (shadow-piercing) views of the page
      let deepBody = ''
      try { deepBody = deepText(document.body, 60000) } catch { /* diagnostics */ }

      // Environment probes
      try {
        const lightLen = (document.body?.innerText || '').length
        notes.push(`bodyLen=${lightLen}`, `deepLen=${deepBody.length}`, `shadowHosts=${shadowHosts}`)
        notes.push(`occl=${document.querySelectorAll('[data-occludable-job-id]').length}`)
        notes.push(`phraseDeep=${/about the job/i.test(deepBody) ? 'yes' : 'no'}`)
      } catch { /* diagnostics only */ }

      // Anchor 0: embedded Voyager JSON in <code> tags — light DOM first,
      // then shadow-piercing collection.
      if (jobId && (!title || !company || !body)) {
        try {
          let codeTexts = Array.from(document.querySelectorAll('code')).map(c => c.textContent || '')
          if (codeTexts.length === 0) {
            codeTexts = deepFindAll(el => el.tagName === 'CODE', 200).map(c => c.textContent || '')
          }
          notes.push(`codeTags=${codeTexts.length}`)
          const v = voyagerFromCodes(codeTexts, jobId)
          if (v) {
            if (!title && v.title) { title = v.title; notes.push('title=json') }
            if (!company && v.company) { company = v.company; notes.push('company=json') }
            if (!body && v.desc.length > 100) { body = v.desc; notes.push('body=json') }
          } else {
            notes.push('json=no-posting')
          }
        } catch { notes.push('json=threw') }
      }

      // Anchor 1: the selected job CARD by job id (attributes pierced deep)
      let cardEl: HTMLElement | null = null
      try {
        if (jobId) {
          const cardSelectors = [
            `[data-occludable-job-id="${jobId}"]`,
            `[data-job-id="${jobId}"]`,
            `a[href*="/jobs/view/${jobId}"]`,
            `[data-entity-urn*="${jobId}"]`,
          ]
          for (const sel of cardSelectors) {
            try {
              cardEl = document.querySelector(sel) as HTMLElement | null
              if (cardEl) { notes.push(`card=${sel.split('=')[0].replace(/[[\]"]/g, '')}`); break }
            } catch { /* skip */ }
          }
          if (!cardEl) {
            // shadow-piercing attribute search
            const hits = deepFindAll(el =>
              !!(el.getAttribute && (
                el.getAttribute('data-occludable-job-id') === jobId ||
                el.getAttribute('data-job-id') === jobId ||
                (el.getAttribute('href') || '').includes(`/jobs/view/${jobId}`)
              )), 1)
            if (hits.length > 0) { cardEl = hits[0]; notes.push('card=deep') }
          }
          if (!cardEl) notes.push('card=MISSING')
          if (cardEl && (!title || !company)) {
            const cardText = clean(cardEl.innerText || '') || deepText(cardEl, 2000)
            const seen = new Set<string>()
            const lines = cardText.split('\n')
              .map(s => s.trim()).filter(s => s && !seen.has(s) && (seen.add(s), true))
            if (!title && lines[0]) { title = lines[0].replace(/\s+with verification$/i, ''); notes.push('title=card') }
            if (!company) {
              const sub = lines.slice(1).find(l =>
                l !== title && l.length <= 70 &&
                !/\bago\b|applicant|promoted|easy apply|viewed|saved|\$|^\d/i.test(l)
              )
              if (sub) { company = clean(sub.split('·')[0]); notes.push('company=card') }
            }
          }
        }
      } catch { notes.push('card=threw') }

      // Anchor 2: "About the job" text descent — now shadow-aware on both the
      // phrase tests and the collected module text.
      if (!body) {
        try {
          const phrase = /about the job/i
          if (phrase.test(deepBody)) {
            type N = HTMLElement & { shadowRoot?: ShadowRoot | null }
            const kidsOf = (n: N): N[] => {
              const out: N[] = []
              if (n.shadowRoot && (n.shadowRoot as ShadowRoot).children) out.push(...(Array.from((n.shadowRoot as ShadowRoot).children) as N[]))
              if (n.children) out.push(...(Array.from(n.children) as N[]))
              return out
            }
            let node: N = document.body as N
            let descended = true
            while (descended) {
              descended = false
              for (const child of kidsOf(node)) {
                const t = (child.innerText && phrase.test(child.innerText)) ? child.innerText : (phrase.test(deepText(child, 8000)) ? 'x' : '')
                if (t) { node = child; descended = true; break }
              }
            }
            let prev: N = node
            let anc: N | null = node
            while (anc && anc !== document.body && deepText(anc, 1200).length < 600) {
              prev = anc
              anc = anc.parentElement as N | null
            }
            let bodyEl: N = anc && anc !== document.body ? anc : prev
            if (cardEl && typeof bodyEl.contains === 'function' && bodyEl.contains(cardEl)) bodyEl = prev
            const t = deepText(bodyEl, 20000)
            if (t.length >= 200) { body = t; notes.push('body=about-descend') }
          } else {
            notes.push('about-phrase=MISSING')
          }
        } catch { notes.push('about=threw') }
      }

      // Doc-title backup: "Acme hiring Senior Engineer in NYC | LinkedIn"
      const dt = clean(document.title)
      const m = /^\(?\d*\)?\s*(.{2,60}?)\s+hiring\s+(.+?)(?:\s+in\s+[^|]+)?\s*\|/i.exec(dt)
      if (m) {
        if (!company) { company = clean(m[1]); notes.push('company=doctitle') }
        if (!title) { title = clean(m[2]); notes.push('title=doctitle') }
      }

      // Anchor 3 (STRONGEST — no rendering involved): same-origin fetch of the
      // job's own view page with the user's session; parse its HTML for
      // JSON-LD and embedded Voyager JSON. Works even when the details pane
      // is in a closed shadow root, an iframe, or not rendered at all.
      if (jobId && (!body || !title || !company)) {
        try {
          const resp = await fetch(`${location.origin}/jobs/view/${jobId}/`, { credentials: 'include' })
          notes.push(`viewFetch=${resp.status}`)
          if (resp.ok) {
            const html = await resp.text()
            const vdoc = new DOMParser().parseFromString(html, 'text/html')
            // JSON-LD (present on guest/public render)
            const ld = jsonLdFromDoc(vdoc)
            if (ld) {
              if (!title && ld.job_title) { title = ld.job_title; notes.push('title=view-ld') }
              if (!company && ld.company_name) { company = ld.company_name; notes.push('company=view-ld') }
              if (!body && ld.raw_text && ld.raw_text.length > 100) { body = ld.raw_text; notes.push('body=view-ld') }
            }
            // Voyager <code> JSON (present on logged-in render)
            if (!body || !title || !company) {
              const vCodes = Array.from(vdoc.querySelectorAll('code')).map(c => c.textContent || '')
              notes.push(`viewCodeTags=${vCodes.length}`)
              const v = voyagerFromCodes(vCodes, jobId)
              if (v) {
                if (!title && v.title) { title = v.title; notes.push('title=view-json') }
                if (!company && v.company) { company = v.company; notes.push('company=view-json') }
                if (!body && v.desc.length > 100) { body = v.desc; notes.push('body=view-json') }
              }
            }
            // og:title on the view page: "Company hiring Title | LinkedIn"
            if (!title || !company) {
              const og = vdoc.querySelector('meta[property="og:title"]')?.getAttribute('content') || ''
              const om = /^(.{2,60}?)\s+hiring\s+(.+?)(?:\s+in\s+[^|]+)?\s*\|/i.exec(clean(og))
              if (om) {
                if (!company) { company = clean(om[1]); notes.push('company=view-og') }
                if (!title) { title = clean(om[2]); notes.push('title=view-og') }
              }
            }
          }
        } catch { notes.push('viewFetch=threw') }
      }

      // Anchor 4: LinkedIn's GUEST endpoint — server-rendered posting fragment
      // with a stable structure (works logged-out; unaffected by the app
      // shell). Most reliable COMPANY source, so it may overwrite the weakest
      // heuristic (the card-line guess, which sometimes grabs a location).
      const companyFromCardGuess = notes.includes('company=card')
      if (jobId && (!body || !title || !company || companyFromCardGuess)) {
        try {
          const resp = await fetch(`${location.origin}/jobs-guest/jobs/api/jobPosting/${jobId}`, { credentials: 'include' })
          notes.push(`guestFetch=${resp.status}`)
          if (resp.ok) {
            const html = await resp.text()
            const gdoc = new DOMParser().parseFromString(html, 'text/html')
            const gCompany =
              textOf(gdoc.querySelector('.topcard__org-name-link') as HTMLElement | null) ||
              textOf(gdoc.querySelector('a[href*="/company/"]') as HTMLElement | null)
            const gTitle = textOf(gdoc.querySelector('.top-card-layout__title, .topcard__title, h2, h3') as HTMLElement | null)
            const gBody = textOf(gdoc.querySelector('.description__text, .show-more-less-html__markup') as HTMLElement | null)
            if (gCompany && (!company || companyFromCardGuess)) { company = gCompany; notes.push('company=guest') }
            if (!title && gTitle) { title = gTitle; notes.push('title=guest') }
            if (!body && gBody.length > 100) { body = gBody; notes.push('body=guest') }
          }
        } catch { notes.push('guestFetch=threw') }
      }

      // Last-resort body: details pane text (shadow-pierced) — NEVER the whole page.
      if (!body && detailsRoot) { body = deepText(detailsRoot, 20000); if (body) notes.push('body=pane-text') }
      if (title || body) return { job_title: title, company_name: company, raw_text: body, source: 'ats' }
      // Host is LinkedIn: never fall through to other platform branches.
      return null
    }
    // Indeed (host-only, same reasoning)
    if (host.includes('indeed.')) {
      const title = firstText(['.jobsearch-JobInfoHeader-title', 'h1'])
      const company = firstText(['[data-testid="inlineHeader-companyName"]', '.jobsearch-CompanyInfoContainer a'])
      const body = firstText(['#jobDescriptionText'])
      if (title || body) return { job_title: title, company_name: company, raw_text: body, source: 'ats' }
      return null
    }
    // Greenhouse (boards.greenhouse.io, or embedded #grnhse_app on company sites)
    if (host.includes('greenhouse.io') || (!isPlatformHost && document.querySelector('#grnhse_app, #greenhouse-application-form'))) {
      const title = firstText(['.app-title', 'h1.app-title', 'h1'])
      const company = firstText(['.company-name', '.header .company']) || metaContent(['og:site_name'])
      const body = firstText(['#content', '.job__description', '.body'])
      if (title || body) return { job_title: title, company_name: company, raw_text: body, source: 'ats' }
    }
    // Lever
    if (host.includes('lever.co') || (!isPlatformHost && document.querySelector('.posting-page, .posting-headline'))) {
      const title = firstText(['.posting-headline h2', 'h2'])
      const company = firstText(['.posting-headline .company']) || metaContent(['og:site_name'])
      const body = firstText(['.section-wrapper.page-full-width', '.posting-page', '[data-qa="job-description"]'])
      if (title || body) return { job_title: title, company_name: company, raw_text: body, source: 'ats' }
    }
    // Ashby
    if (host.includes('ashbyhq.com') || (!isPlatformHost && document.querySelector('[class*="_jobPosting"]'))) {
      const title = firstText(['h1', '[class*="_title"] h1'])
      const body = firstText(['[class*="_description"]', 'main'])
      if (title || body) return { job_title: title, company_name: metaContent(['og:site_name']), raw_text: body, source: 'ats' }
    }
    // Workday
    if (host.includes('myworkdayjobs.com') || (!isPlatformHost && document.querySelector('[data-automation-id="jobPostingHeader"]'))) {
      const title = firstText(['[data-automation-id="jobPostingHeader"]', 'h2'])
      const body = firstText(['[data-automation-id="jobPostingDescription"]'])
      if (title || body) return { job_title: title, company_name: metaContent(['og:site_name']), raw_text: body, source: 'ats' }
    }
    // SmartRecruiters
    if (host.includes('smartrecruiters.com') || (!isPlatformHost && document.querySelector('.jobad-details'))) {
      const title = firstText(['.job-title', 'h1'])
      const body = firstText(['.jobad-main', '.jobad-details', '#st-jobDescription'])
      const company = firstText(['.company-name']) || metaContent(['og:site_name'])
      if (title || body) return { job_title: title, company_name: company, raw_text: body, source: 'ats' }
    }
    // iCIMS
    if (host.includes('icims.com') || (!isPlatformHost && document.querySelector('.iCIMS_JobHeader, .iCIMS_InfoMsg'))) {
      const title = firstText(['.iCIMS_Header', 'h1', '.title'])
      const body = firstText(['.iCIMS_JobContent', '.iCIMS_InfoMsg_Job', '#job'])
      if (title || body) return { job_title: title, company_name: metaContent(['og:site_name']), raw_text: body, source: 'ats' }
    }
    // Workable / Recruitee / Jobvite / BambooHR / Taleo — generic-ish headers
    if (/workable\.com|recruitee\.com|jobvite\.com|bamboohr\.com|taleo\.net/.test(host)) {
      const title = firstText(['h1', '[data-ui="job-title"]', '.opening-title'])
      const body = firstText(['[data-ui="job-description"]', '.description', 'main', '#content'])
      if (title || body) return { job_title: title, company_name: metaContent(['og:site_name']), raw_text: body, source: 'ats' }
    }
    return null
  }

  // ── Layer 3: generic readability — largest dense text block ──────────────
  const fromReadability = (): Partial<ScrapedJob> => {
    const candidates = Array.from(
      document.querySelectorAll('main, article, [role="main"], section, div')
    ) as HTMLElement[]
    let best: HTMLElement | null = null
    let bestScore = 0
    for (const el of candidates) {
      const tag = el.tagName.toLowerCase()
      const cls = (el.className || '').toString().toLowerCase()
      if (/nav|header|footer|sidebar|menu|cookie|banner/.test(cls) && tag === 'div') continue
      const txt = (el.innerText || '').trim()
      if (txt.length < 200) continue
      // A block containing several job cards is a job LIST, never the description.
      try {
        if (el.querySelectorAll('a[href*="/jobs/view/"], a[href*="/jobs/collections/"], [data-occludable-job-id], [data-job-id]').length > 3) continue
      } catch { /* selector unsupported — ignore */ }
      const links = el.querySelectorAll('a').length
      const score = txt.length - links * 40
      if (score > bestScore) { bestScore = score; best = el }
    }
    const body = best ? clean(best.innerText) : clean(document.body?.innerText || '')
    const title =
      metaContent(['og:title']) ||
      clean(document.querySelector('h1')?.textContent || '') ||
      clean(document.title)
    const company = metaContent(['og:site_name']) || ''
    return { job_title: title, company_name: company, raw_text: body, source: 'readability' }
  }

  // Merge layers, filling gaps from lower-confidence sources.
  const merged: ScrapedJob = { job_title: '', company_name: '', raw_text: '', source: 'readability' }
  const apply = (r: Partial<ScrapedJob> | null) => {
    if (!r) return
    if (!merged.job_title && r.job_title) merged.job_title = r.job_title
    if (!merged.company_name && r.company_name) merged.company_name = r.company_name
    if (!merged.raw_text && r.raw_text) merged.raw_text = r.raw_text
    if (r.source && merged.raw_text === r.raw_text && r.raw_text) merged.source = r.source
  }

  try {
    const r = jsonLdFromDoc(document)
    if (r) notes.push('jsonld=hit')
    apply(r)
  } catch { notes.push('jsonld=threw') }
  try { apply(await fromAts()) } catch { notes.push('ats=threw') }
  if (!merged.raw_text || merged.raw_text.length < 200) {
    notes.push('fallback=readability')
    try { apply(fromReadability()) } catch { notes.push('readability=threw') }
  }
  // Final layer: when even readability found almost nothing, the content is
  // in shadow DOM (light innerText near-empty) — return the shadow-pierced
  // page text so downstream AI extraction always has real material.
  if (!merged.raw_text || merged.raw_text.length < 200) {
    try {
      const deep = deepText(document.body, 20000)
      if (deep.length > (merged.raw_text?.length || 0)) {
        merged.raw_text = deep
        merged.source = 'readability'
        notes.push('body=deep-page')
      }
    } catch { notes.push('deep-page=threw') }
  }

  // ── Company resolution cascade ──────────────────────────────────────────
  if (!merged.company_name || isAtsName(merged.company_name)) {
    merged.company_name = companyFromUrl() || companyFromDocTitle() || ''
  }
  if (!merged.company_name) {
    const parts = host.replace(/^www\./, '').split('.')
    const guess = parts.length >= 2 ? parts[parts.length - 2] : parts[0]
    if (guess && !isAtsName(guess)) {
      merged.company_name = titleCase(guess)
    }
  }
  merged.company_name = clean(
    merged.company_name
      .replace(/\s*(logo|careers?|jobs?|hiring)\s*$/i, '')
      .replace(/[|•·–—-]\s*$/g, '')
  )

  merged.job_title = clamp(merged.job_title, 200)
  merged.company_name = clamp(merged.company_name, 200)
  merged.raw_text = clamp(merged.raw_text)
  merged.page_host = host
  merged.debug = notes.join(' · ').slice(0, 600)
  return merged
}
