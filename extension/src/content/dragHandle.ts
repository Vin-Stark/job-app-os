// Injected into the active tab (via chrome.scripting.executeScript with args)
// to place a floating, draggable chip carrying the tailored resume PDF. The
// popup can't hold a drag (it closes on blur), so the drag must originate from
// a page-injected element.
//
// Chrome does NOT let web content start a drag that carries real files —
// File objects added to dataTransfer in dragstart are ignored on drop, and
// the 'DownloadURL' format only materializes on drops OUTSIDE the browser
// (desktop/Finder). So the chip's drag is just a gesture: document-level
// capture listeners intercept the drop and deliver the file synthetically —
// a synthetic drop event carrying a real DataTransfer for JS dropzones, or
// input.files + change for native file inputs.
//
// Self-contained: receives { filename, dataUrl } as args, no imports.

export function injectDragHandle(filename: string, dataUrl: string): void {
  const HANDLE_ID = '__jobappos_drag_handle__'
  const w = window as unknown as Record<string, unknown>
  // Remove a previous chip AND its document listeners before re-injecting.
  ;(w.__jobappos_drag_cleanup__ as (() => void) | undefined)?.()

  // Decode the data URL into a real File up front (dragstart is synchronous).
  let file: File | null = null
  try {
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    file = new File([bytes], filename, { type: 'application/pdf' })
  } catch {
    // Fall back to DownloadURL-only (drop-to-desktop still works).
  }

  const wrap = document.createElement('div')
  wrap.id = HANDLE_ID
  wrap.setAttribute('draggable', 'true')
  wrap.style.cssText = [
    'position:fixed', 'z-index:2147483647', 'right:20px', 'bottom:20px',
    'background:#1a1a1a', 'color:#fff', 'padding:12px 16px', 'border-radius:10px',
    'border:1px solid rgba(255,255,255,0.12)', 'font:600 13px system-ui,sans-serif',
    'cursor:grab', 'user-select:none', 'display:flex', 'gap:10px', 'align-items:center',
    'max-width:280px',
  ].join(';')
  const label =
    '<span style="line-height:1.3">Drag me into the<br><b>Upload résumé</b> field' +
    '<span style="display:block;font-weight:400;opacity:.7;font-size:11px;margin-top:2px">' +
    filename + '</span></span>'
  const fileIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.65)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>'
  wrap.innerHTML =
    fileIcon + label +
    '<span id="__jobappos_close__" style="margin-left:6px;opacity:.6;cursor:pointer;font-weight:400">✕</span>'

  let dragging = false

  wrap.addEventListener('dragstart', (e) => {
    const dt = (e as DragEvent).dataTransfer
    if (!dt) return
    dragging = true
    // DownloadURL: "<mime>:<filename>:<url>" — Chrome materializes it as a
    // file when dropped outside the browser (desktop/Finder).
    dt.setData('DownloadURL', `application/pdf:${filename}:${dataUrl}`)
    dt.effectAllowed = 'copy'
    wrap.style.cursor = 'grabbing'
  })
  wrap.addEventListener('dragend', () => {
    dragging = false
    wrap.style.cursor = 'grab'
  })

  // Nearest file input: walk up from the drop target, scanning each
  // ancestor's subtree (dropzones usually keep a hidden <input type=file>).
  // Stops before <body> — a whole-page scan could grab the wrong field on
  // forms with several uploads (resume vs. cover letter).
  const findFileInput = (start: EventTarget | null): HTMLInputElement | null => {
    let node = start instanceof Element ? start : null
    while (node && node !== document.body && node !== document.documentElement) {
      if (node instanceof HTMLInputElement && node.type === 'file') return node
      const inner = node.querySelector<HTMLInputElement>('input[type="file"]')
      if (inner) return inner
      node = node.parentElement
    }
    return null
  }

  const flash = (text: string) => {
    const span = wrap.children[1] as HTMLElement
    span.innerHTML = text
    setTimeout(() => { span.outerHTML = label }, 2500)
  }

  // While OUR chip is being dragged, make the whole page a valid drop target
  // (sites reject the drag otherwise — its types don't include 'Files').
  const onDragOver = (e: DragEvent) => {
    if (!dragging) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }

  // Re-entrancy guard: the synthetic drop below bubbles back through this
  // same capture listener — without the guard it recurses forever.
  let delivering = false

  const onDrop = (e: DragEvent) => {
    if (delivering || !dragging || !file) return
    e.preventDefault()
    e.stopImmediatePropagation()
    delivering = true

    try {
      const dt = new DataTransfer()
      dt.items.add(file)
      const target = e.target instanceof Element ? e.target : document.body

      // 1) Synthetic drag events on the real target — what an OS file drop
      // looks like to a JS dropzone. If the site's handler preventDefault()s,
      // it consumed the file and we're done.
      for (const type of ['dragenter', 'dragover', 'drop'] as const) {
        const ev = new DragEvent(type, {
          bubbles: true, cancelable: true, composed: true,
          clientX: e.clientX, clientY: e.clientY, dataTransfer: dt,
        })
        target.dispatchEvent(ev)
        if (type === 'drop' && ev.defaultPrevented) { flash('<b>Dropped ✓</b>'); return }
      }

      // 2) Fallback: fill the nearest native file input directly.
      const input = findFileInput(target)
      if (input) {
        input.files = dt.files
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
        flash('<b>Dropped ✓</b>')
        return
      }
      flash('No upload field here —<br>drop <b>onto the upload box</b>')
    } finally {
      delivering = false
    }
  }

  const cleanup = () => {
    document.removeEventListener('dragover', onDragOver, true)
    document.removeEventListener('drop', onDrop, true)
    document.getElementById(HANDLE_ID)?.remove()
    delete w.__jobappos_drag_cleanup__
  }
  w.__jobappos_drag_cleanup__ = cleanup
  document.addEventListener('dragover', onDragOver, true)
  document.addEventListener('drop', onDrop, true)

  wrap.querySelector('#__jobappos_close__')?.addEventListener('click', (e) => {
    e.stopPropagation()
    cleanup()
  })

  document.body.appendChild(wrap)
}
