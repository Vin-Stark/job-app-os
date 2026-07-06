// Popup ↔ active-tab helpers. All wrapped so a restricted page (chrome://,
// the Web Store, PDF viewer, etc.) yields a friendly error instead of a throw.

import { scrapeActiveTab } from '../content/scraper'
import { injectDragHandle } from '../content/dragHandle'
import type { ScrapedJob } from '../lib/types'

const APP_URL: string = typeof __APP_URL__ !== 'undefined' ? __APP_URL__ : 'http://localhost:5173'

async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab || !tab.id) throw new Error('No active tab.')
  return tab
}

const RESTRICTED = /^(chrome|edge|about|chrome-extension|https:\/\/chrome\.google\.com\/webstore|https:\/\/chromewebstore\.google\.com)/i

// activeTab only covers the tab the extension icon was clicked on. The side
// panel stays open while the user switches tabs, so injection can land on a
// tab we were never granted — ask for that origin once (needs a user gesture,
// which the triggering button click provides). Granted origins persist.
async function requestSiteAccess(url: string): Promise<boolean> {
  try {
    const origin = new URL(url).origin + '/*'
    return await chrome.permissions.request({ origins: [origin] })
  } catch {
    return false
  }
}

// URL of the active tab (used by duplicate detection). Empty on restricted pages.
export async function getActiveTabUrl(): Promise<string> {
  try {
    const tab = await activeTab()
    return tab.url && !RESTRICTED.test(tab.url) ? tab.url : ''
  } catch {
    return ''
  }
}

// allFrames: sites sometimes render the job details inside an iframe — scrape
// every frame and keep the best result. Some pages block all-frames injection,
// so retry top frame only before giving up.
async function injectScrape(tabId: number) {
  try {
    return await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: scrapeActiveTab,
    })
  } catch {
    return await chrome.scripting.executeScript({
      target: { tabId },
      func: scrapeActiveTab,
    })
  }
}

export async function scrapeCurrentTab(): Promise<ScrapedJob> {
  const tab = await activeTab()
  if (!tab.url || RESTRICTED.test(tab.url)) {
    throw new Error("This page can't be scraped. Open the job posting, then try again.")
  }
  let results
  try {
    results = await injectScrape(tab.id!)
  } catch {
    // Likely missing host access — prompt for this site once, then retry.
    if (!(await requestSiteAccess(tab.url))) {
      throw new Error('Allow access to this site when prompted (or click the extension icon on this tab), then re-capture — or paste the JD manually below.')
    }
    try {
      results = await injectScrape(tab.id!)
    } catch {
      throw new Error("Couldn't read this page. Paste the JD manually below.")
    }
  }
  const jobs = (results || [])
    .map(r => r?.result as ScrapedJob | undefined)
    .filter((j): j is ScrapedJob => !!j)
  if (jobs.length === 0) {
    throw new Error("Couldn't find a job description on this page. Paste it manually below.")
  }
  // Best frame = longest JD; borrow missing title/company from other frames
  jobs.sort((a, b) => (b.raw_text?.length || 0) - (a.raw_text?.length || 0))
  const best = jobs[0]
  for (const j of jobs.slice(1)) {
    if (!best.job_title && j.job_title) best.job_title = j.job_title
    if (!best.company_name && j.company_name) best.company_name = j.company_name
  }
  best.debug = `frames=${jobs.length} · ${best.debug || ''}`.trim()
  if (!best.raw_text) {
    throw new Error("Couldn't find a job description on this page. Paste it manually below.")
  }
  return best
}

// The ENTIRE page text — every frame, open shadow roots included, no
// readability filtering. Used as input for AI extraction: the extractor is
// built to find the one real job inside noise, so if the JD is rendered
// anywhere on screen, it's in here.
export async function getFullPageText(): Promise<string> {
  const tab = await activeTab()
  if (!tab.url || RESTRICTED.test(tab.url)) return ''
  const grab = () => {
    // Self-contained deep text walker (pierces open shadow roots)
    const parts: string[] = []
    let total = 0
    const walk = (n: Node & { shadowRoot?: ShadowRoot | null; tagName?: string }) => {
      if (!n || total > 30000) return
      if (n.nodeType === 3) {
        const t = (n.textContent || '').trim()
        if (t) { parts.push(t); total += t.length }
        return
      }
      if (n.nodeType !== 1) return
      const tag = n.tagName || ''
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') return
      if (n.shadowRoot) for (const c of Array.from(n.shadowRoot.childNodes)) walk(c as never)
      for (const c of Array.from(n.childNodes)) walk(c as never)
    }
    if (document.body) walk(document.body as never)
    return parts.join('\n').replace(/\n{3,}/g, '\n\n').slice(0, 30000)
  }
  const inject = async () => {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id!, allFrames: true },
        func: grab,
      })
      const texts = (results || [])
        .map(r => ((r?.result as string) || '').trim())
        .filter(Boolean)
      // Top frame first, then subframes; cap the total
      return texts.join('\n\n').slice(0, 30000)
    } catch {
      const results = await chrome.scripting.executeScript({ target: { tabId: tab.id! }, func: grab })
      return ((results?.[0]?.result as string) || '').trim()
    }
  }
  try {
    return await inject()
  } catch {
    if (!(await requestSiteAccess(tab.url))) return ''
    try {
      return await inject()
    } catch {
      return ''
    }
  }
}

// Pull the user's highlighted selection on the page (manual override).
export async function getSelectionFromTab(): Promise<string> {
  const tab = await activeTab()
  if (!tab.url || RESTRICTED.test(tab.url)) return ''
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: () => (window.getSelection?.()?.toString() || '').trim(),
    })
    return (results?.[0]?.result as string) || ''
  } catch {
    return ''
  }
}

export async function enableDragOnTab(filename: string, dataUrl: string): Promise<void> {
  const tab = await activeTab()
  if (!tab.url || RESTRICTED.test(tab.url)) {
    throw new Error('Open the application page (with the upload field) before enabling drag.')
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: injectDragHandle,
      args: [filename, dataUrl],
    })
  } catch {
    // The application form is usually on a different site than the posting —
    // ask for access to it too, then retry once.
    if (!(await requestSiteAccess(tab.url))) {
      throw new Error('Allow access to this site when prompted, then click again.')
    }
    await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: injectDragHandle,
      args: [filename, dataUrl],
    })
  }
}

export function openLogin(): void {
  chrome.tabs.create({ url: `${APP_URL}/login` })
}

export function openPdfPreview(dataUrl: string): void {
  chrome.tabs.create({ url: dataUrl })
}
