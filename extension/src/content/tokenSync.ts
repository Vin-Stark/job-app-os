// Runs on the web app origin. After the user logs in (by email/password OR
// Google — both end with a JWT in localStorage under 'token'), this reads it and
// hands it to the background, which stores it in chrome.storage for the popup.
//
// Same-tab localStorage writes don't fire the 'storage' event, so we poll
// briefly and push the token whenever it appears or changes.

// Signal to the page that the extension is active so the web app can hide install prompts.
document.documentElement.setAttribute('data-tailr-ext', 'true')
document.dispatchEvent(new CustomEvent('tailr:installed'))

const WEB_TOKEN_KEY = 'token'
let lastSent: string | null = null

function syncOnce() {
  let token: string | null = null
  try {
    token = window.localStorage.getItem(WEB_TOKEN_KEY)
  } catch {
    return // storage blocked; nothing we can do
  }
  if (token && token !== lastSent) {
    lastSent = token
    try {
      chrome.runtime.sendMessage({ type: 'SET_TOKEN', token })
    } catch {
      // extension context invalidated (e.g. reloaded) — ignore
    }
  }
}

syncOnce()
// Poll for a while to catch a login that happens after the page loads.
const interval = setInterval(syncOnce, 1500)
// Stop polling after 10 minutes to avoid a forever-timer on an idle tab.
setTimeout(() => clearInterval(interval), 10 * 60 * 1000)
// Also stop immediately if the page unloads or the extension context is invalidated.
window.addEventListener('unload', () => clearInterval(interval))
window.addEventListener('focus', syncOnce)
