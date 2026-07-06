// Injected into the active tab (via chrome.scripting.executeScript with args)
// to place a floating, draggable chip carrying the tailored resume PDF. The
// popup can't hold a drag (it closes on blur), so the drag must originate from
// a page-injected element. Dragging uses the 'DownloadURL' dataTransfer format,
// which lets Chrome drop the generated file into the page's native file input.
//
// Self-contained: receives { filename, dataUrl } as args, no imports.

export function injectDragHandle(filename: string, dataUrl: string): void {
  const HANDLE_ID = '__jobappos_drag_handle__'
  document.getElementById(HANDLE_ID)?.remove()

  const wrap = document.createElement('div')
  wrap.id = HANDLE_ID
  wrap.setAttribute('draggable', 'true')
  wrap.style.cssText = [
    'position:fixed', 'z-index:2147483647', 'right:20px', 'bottom:20px',
    'background:#111827', 'color:#fff', 'padding:12px 16px', 'border-radius:10px',
    'box-shadow:0 8px 24px rgba(0,0,0,.35)', 'font:600 13px system-ui,sans-serif',
    'cursor:grab', 'user-select:none', 'display:flex', 'gap:10px', 'align-items:center',
    'max-width:280px',
  ].join(';')
  wrap.innerHTML =
    '<span style="font-size:18px">📄</span>' +
    '<span style="line-height:1.3">Drag me into the<br><b>Upload résumé</b> field' +
    '<span style="display:block;font-weight:400;opacity:.7;font-size:11px;margin-top:2px">' +
    filename + '</span></span>' +
    '<span id="__jobappos_close__" style="margin-left:6px;opacity:.6;cursor:pointer;font-weight:400">✕</span>'

  wrap.addEventListener('dragstart', (e) => {
    const dt = (e as DragEvent).dataTransfer
    if (!dt) return
    // DownloadURL: "<mime>:<filename>:<url>" — Chrome materializes it as a file
    // when dropped onto a file input or the OS.
    dt.setData('DownloadURL', `application/pdf:${filename}:${dataUrl}`)
    dt.effectAllowed = 'copy'
    wrap.style.cursor = 'grabbing'
  })
  wrap.addEventListener('dragend', () => { wrap.style.cursor = 'grab' })

  wrap.querySelector('#__jobappos_close__')?.addEventListener('click', (e) => {
    e.stopPropagation()
    wrap.remove()
  })

  document.body.appendChild(wrap)
}
