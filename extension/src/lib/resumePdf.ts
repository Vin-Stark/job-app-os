// Tailored resume plain-text → text-based PDF (selectable/ATS-parseable).
// Combines the plain-text structure detection from the web app's ResumeEditor
// (plainTextToHtml) with the jsPDF writer from frontend/src/lib/resumePdf.ts,
// so the extension can turn the backend's tailored_resume string into the same
// document the web app produces — without a Tiptap dependency.

import { jsPDF } from 'jspdf'

const PAGE_W = 612
const PAGE_H = 792
const MARGIN_X = 72
const MARGIN_Y = 54
const CONTENT_W = PAGE_W - MARGIN_X * 2

type FontStyle = 'normal' | 'bold' | 'italic' | 'bolditalic'

type Block =
  | { kind: 'name'; text: string }
  | { kind: 'contact'; text: string }
  | { kind: 'section'; text: string }
  | { kind: 'jobtitle'; text: string }
  | { kind: 'companyDate'; company: string; date: string }
  | { kind: 'skill'; label: string; value: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'para'; text: string }

function isDateFragment(s: string): boolean {
  return /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December|\d{4}|Present|Current|Now)\b/i.test(s)
}

// Parse the tailored plain text into an ordered list of typed blocks.
function parseResume(text: string): Block[] {
  const lines = (text || '').replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let nonEmpty = 0
  let prevCompanyDate = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) { prevCompanyDate = false; continue }
    nonEmpty++

    // 1) Candidate name
    if (nonEmpty === 1) { blocks.push({ kind: 'name', text: line }); prevCompanyDate = false; continue }

    // 2) Contact line
    if (nonEmpty === 2 && (line.includes('@') || line.includes('|') || /\d{3}/.test(line))) {
      blocks.push({ kind: 'contact', text: line }); prevCompanyDate = false; continue
    }

    // 3) ALL CAPS section header
    const isAllCaps =
      line === line.toUpperCase() &&
      /^[A-Z][A-Z\s&/\-]{2,}$/.test(line) &&
      line.length < 60 &&
      !line.includes('|')
    if (isAllCaps) { blocks.push({ kind: 'section', text: line }); prevCompanyDate = false; continue }

    // 4) Job title (line right after a company-date row, not a bullet)
    if (prevCompanyDate && !/^[•\-*]/.test(line)) {
      blocks.push({ kind: 'jobtitle', text: line }); prevCompanyDate = false; continue
    }
    prevCompanyDate = false

    // 5) Company | Date
    if (line.includes(' | ') && !line.includes('@')) {
      const lastPipe = line.lastIndexOf(' | ')
      const after = line.slice(lastPipe + 3)
      if (isDateFragment(after)) {
        blocks.push({ kind: 'companyDate', company: line.slice(0, lastPipe), date: after })
        prevCompanyDate = true
        continue
      }
    }

    // 6) Bullet
    if (/^[•\-*]\s+/.test(line)) {
      blocks.push({ kind: 'bullet', text: line.replace(/^[•\-*]\s+/, '') })
      continue
    }

    // 7) Skill line "Label: value"
    const skill = /^([A-Za-z][A-Za-z\s/]{1,25}):\s+(\S.*)$/.exec(line)
    if (skill) { blocks.push({ kind: 'skill', label: skill[1].trim(), value: skill[2].trim() }); continue }

    // 8) Paragraph
    blocks.push({ kind: 'para', text: line })
  }
  return blocks
}

class PdfWriter {
  doc: jsPDF
  y = MARGIN_Y
  constructor() { this.doc = new jsPDF({ unit: 'pt', format: 'letter' }) }

  ensureRoom(h: number) {
    if (this.y + h > PAGE_H - MARGIN_Y) { this.doc.addPage(); this.y = MARGIN_Y }
  }
  font(style: FontStyle, size: number) { this.doc.setFont('times', style); this.doc.setFontSize(size) }
  width(text: string, style: FontStyle, size: number) { this.font(style, size); return this.doc.getTextWidth(text) }

  // Word-wrap a single-style string, left- or center-aligned.
  writeText(text: string, size: number, style: FontStyle, opts: { x?: number; maxWidth?: number; center?: boolean; lineHeight?: number } = {}) {
    const x = opts.x ?? MARGIN_X
    const maxWidth = opts.maxWidth ?? CONTENT_W
    const lh = opts.lineHeight ?? size * 1.32
    const words = text.split(/\s+/).filter(Boolean)
    const spaceW = this.width(' ', style, size)
    const lines: string[] = []
    let cur = ''
    let curW = 0
    for (const w of words) {
      const wW = this.width(w, style, size)
      const need = cur === '' ? wW : curW + spaceW + wW
      if (need > maxWidth && cur !== '') { lines.push(cur); cur = w; curW = wW }
      else { cur = cur === '' ? w : cur + ' ' + w; curW = need }
    }
    if (cur) lines.push(cur)
    if (lines.length === 0) lines.push('')
    for (const ln of lines) {
      this.ensureRoom(lh)
      this.font(style, size)
      const lw = this.doc.getTextWidth(ln)
      const cx = opts.center ? x + (maxWidth - lw) / 2 : x
      this.doc.text(ln, cx, this.y + size * 0.9)
      this.y += lh
    }
  }
  space(pts: number) { this.y += pts }
}

export function buildResumePdf(text: string): jsPDF {
  const blocks = parseResume(text)
  const w = new PdfWriter()

  for (const b of blocks) {
    switch (b.kind) {
      case 'name':
        w.writeText(b.text, 16, 'bold', { center: true }); w.space(2); break
      case 'contact':
        w.writeText(b.text, 10, 'normal', { center: true }); w.space(8); break
      case 'section': {
        w.space(9); w.ensureRoom(16)
        w.writeText(b.text.toUpperCase(), 11, 'bold', { lineHeight: 13 })
        w.doc.setDrawColor(0); w.doc.setLineWidth(1.2)
        w.doc.line(MARGIN_X, w.y - 1, MARGIN_X + CONTENT_W, w.y - 1)
        w.space(4); break
      }
      case 'jobtitle':
        w.writeText(b.text, 11, 'italic'); w.space(1); break
      case 'companyDate': {
        w.space(8); w.ensureRoom(14)
        w.font('bold', 11); w.doc.text(b.company, MARGIN_X, w.y + 10)
        w.font('normal', 10.5)
        const dw = w.doc.getTextWidth(b.date)
        w.doc.text(b.date, MARGIN_X + CONTENT_W - dw, w.y + 10)
        w.y += 14; break
      }
      case 'skill': {
        w.ensureRoom(14)
        // Label bold, value normal, on one wrapped line
        w.font('bold', 11)
        const labelText = b.label + ': '
        const labelW = w.doc.getTextWidth(labelText)
        w.doc.text(labelText, MARGIN_X, w.y + 11 * 0.9)
        w.writeText(b.value, 11, 'normal', { x: MARGIN_X + labelW, maxWidth: CONTENT_W - labelW })
        w.space(1); break
      }
      case 'bullet': {
        w.ensureRoom(14)
        w.font('normal', 11)
        w.doc.text('•', MARGIN_X + 6, w.y + 11 * 0.9)
        w.writeText(b.text, 11, 'normal', { x: MARGIN_X + 18, maxWidth: CONTENT_W - 18 })
        w.space(1); break
      }
      case 'para':
        w.writeText(b.text, 11, 'normal'); w.space(2); break
    }
  }
  return w.doc
}

export function resumePdfDataUrl(text: string): string {
  return buildResumePdf(text).output('datauristring')
}

export function downloadResumePdf(text: string, filename: string): void {
  buildResumePdf(text).save(filename)
}
