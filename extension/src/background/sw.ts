// Background service worker: the only long-lived context. It receives the JWT
// from the token-sync content script and stores it. Kept intentionally thin —
// API calls happen from the popup (which has the same storage access), so the
// worker just brokers the token hand-off.

import { setToken } from '../lib/auth'

// Clicking the toolbar icon opens the side panel (there is no default_popup).
// The panel persists across tab switches, so a capture flow survives browsing.
chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => { /* pre-114 Chrome — icon click just does nothing extra */ })

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'SET_TOKEN' && typeof msg.token === 'string') {
    setToken(msg.token)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }))
    return true // async response
  }
  return false
})
