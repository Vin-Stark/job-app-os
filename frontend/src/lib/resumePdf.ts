import { jsPDF } from 'jspdf'

// Direct-download, TEXT-BASED resume PDF built from the Tiptap document.
// Text-based matters: a rasterized (screenshot) PDF cannot be parsed by
// ATS scanners, which would defeat the whole product. jsPDF's built-in
// Times font keeps the file small and fully selectable/parseable.

// ── Page geometry (US Letter, points) ────────────────────────────────────────
const PAGE_W = 612
const PAGE_H = 792
const MARGIN_X = 72   // 1in
const MARGIN_Y = 54   // 0.75in
const CONTENT_W = PAGE_W - MARGIN_X * 2

type FontStyle = 'normal' | 'bold' | 'italic' | 'bolditalic'

interface Run {
  text: string
  style: FontStyle
}

// Minimal Tiptap JSON node shape (only what we consume)
interface TiptapNode {
  type?: string
  text?: string
  marks?: { type: string }[]
  attrs?: Record<string, unknown>
  content?: TiptapNode[]
}

function markStyle(marks?: { type: string }[]): FontStyle {
  const bold = marks?.some(m => m.type === 'bold')
  const italic = marks?.some(m => m.type === 'italic')
  if (bold && italic) return 'bolditalic'
  if (bold) return 'bold'
  if (italic) return 'italic'
  return 'normal'
}

// Flatten a paragraph-like node into styled text runs
function nodeRuns(node: TiptapNode, base: FontStyle = 'normal'): Run[] {
  const runs: Run[] = []
  for (const child of node.content ?? []) {
    if (child.type === 'text' && child.text) {
      const style = markStyle(child.marks)
      runs.push({ text: child.text, style: base !== 'normal' && style === 'normal' ? base : style })
    } else if (child.type === 'hardBreak') {
      runs.push({ text: '\n', style: base })
    }
  }
  return runs
}

class PdfWriter {
  doc: jsPDF
  y = MARGIN_Y

  constructor() {
    this.doc = new jsPDF({ unit: 'pt', format: 'letter' })
  }

  ensureRoom(height: number) {
    if (this.y + height > PAGE_H - MARGIN_Y) {
      this.doc.addPage()
      this.y = MARGIN_Y
    }
  }

  setFont(style: FontStyle, size: number) {
    this.doc.setFont('times', style)
    this.doc.setFontSize(size)
  }

  measure(text: string, style: FontStyle, size: number): number {
    this.setFont(style, size)
    return this.doc.getTextWidth(text)
  }

  // Word-wrap styled runs into lines that fit maxWidth; render each line.
  // Handles mixed bold/italic runs inside one paragraph.
  writeRuns(
    runs: Run[],
    size: number,
    opts: { x?: number; maxWidth?: number; align?: 'left' | 'center'; lineHeight?: number } = {}
  ) {
    const x = opts.x ?? MARGIN_X
    const maxWidth = opts.maxWidth ?? CONTENT_W
    const lineHeight = opts.lineHeight ?? size * 1.32

    // Tokenize into words (keeping style), respecting explicit line breaks
    type Word = { text: string; style: FontStyle }
    const lines: Word[][] = []
    let current: Word[] = []
    let currentWidth = 0
    const spaceW = (style: FontStyle) => this.measure(' ', style, size)

    const pushLine = () => {
      lines.push(current)
      current = []
      currentWidth = 0
    }

    for (const run of runs) {
      const pieces = run.text.split('\n')
      for (let p = 0; p < pieces.length; p++) {
        if (p > 0) pushLine() // explicit line break between pieces
        const words = pieces[p].split(/\s+/).filter(Boolean)
        for (const w of words) {
          const wWidth = this.measure(w, run.style, size)
          const needed = current.length === 0 ? wWidth : currentWidth + spaceW(run.style) + wWidth
          if (needed > maxWidth && current.length > 0) pushLine()
          current.push({ text: w, style: run.style })
          currentWidth = current.length === 1 ? wWidth : currentWidth + spaceW(run.style) + wWidth
        }
      }
    }
    if (current.length > 0) pushLine()
    if (lines.length === 0) return

    for (const line of lines) {
      this.ensureRoom(lineHeight)
      const lineWidth = line.reduce((acc, w, i) => {
        const wW = this.measure(w.text, w.style, size)
        return acc + wW + (i > 0 ? this.measure(' ', w.style, size) : 0)
      }, 0)
      let cx = opts.align === 'center' ? x + (maxWidth - lineWidth) / 2 : x
      for (let i = 0; i < line.length; i++) {
        const w = line[i]
        if (i > 0) cx += this.measure(' ', w.style, size)
        this.setFont(w.style, size)
        this.doc.text(w.text, cx, this.y + size * 0.9)
        cx += this.measure(w.text, w.style, size)
      }
      this.y += lineHeight
    }
  }

  space(pts: number) {
    this.y += pts
  }
}

export function downloadResumePdf(docJson: TiptapNode, filename: string) {
  const w = new PdfWriter()
  const nodes = docJson.content ?? []
  let seenH1 = false
  let contactDone = false

  for (const node of nodes) {
    switch (node.type) {
      case 'heading': {
        const level = (node.attrs?.level as number) ?? 1
        const runs = nodeRuns(node)
        if (runs.length === 0) break
        if (level === 1) {
          // Candidate name — centered, bold, 16pt
          w.writeRuns(runs.map(r => ({ ...r, style: 'bold' as FontStyle })), 16, { align: 'center' })
          w.space(2)
          seenH1 = true
        } else if (level === 2) {
          // Section header — bold caps with underline rule
          w.space(9)
          w.ensureRoom(16)
          const text = runs.map(r => r.text).join(' ').toUpperCase()
          w.writeRuns([{ text, style: 'bold' }], 11, { lineHeight: 13 })
          w.doc.setDrawColor(0)
          w.doc.setLineWidth(1.2)
          w.doc.line(MARGIN_X, w.y - 1, MARGIN_X + CONTENT_W, w.y - 1)
          w.space(4)
        } else {
          // Job title — italic
          w.writeRuns(runs.map(r => ({ ...r, style: 'italic' as FontStyle })), 11)
          w.space(1)
        }
        break
      }

      case 'companyDate': {
        const company = String(node.attrs?.company ?? '')
        const date = String(node.attrs?.date ?? '')
        w.space(8)
        w.ensureRoom(14)
        w.setFont('bold', 11)
        w.doc.text(company, MARGIN_X, w.y + 10)
        w.setFont('normal', 10.5)
        const dateW = w.doc.getTextWidth(date)
        w.doc.text(date, MARGIN_X + CONTENT_W - dateW, w.y + 10)
        w.y += 14
        break
      }

      case 'paragraph': {
        const runs = nodeRuns(node)
        if (runs.length === 0) { w.space(4); break }
        // Contact line: first paragraph after the name — centered, smaller
        if (seenH1 && !contactDone) {
          w.writeRuns(runs, 10, { align: 'center' })
          w.space(8)
          contactDone = true
        } else {
          w.writeRuns(runs, 11)
          w.space(2)
        }
        break
      }

      case 'bulletList':
      case 'orderedList': {
        let index = 1
        for (const li of node.content ?? []) {
          for (const liChild of li.content ?? []) {
            if (liChild.type !== 'paragraph') continue
            const runs = nodeRuns(liChild)
            if (runs.length === 0) continue
            const marker = node.type === 'orderedList' ? `${index}.` : '•'
            w.ensureRoom(14)
            w.setFont('normal', 11)
            w.doc.text(marker, MARGIN_X + 6, w.y + 11 * 0.9)
            w.writeRuns(runs, 11, { x: MARGIN_X + 18, maxWidth: CONTENT_W - 18 })
            w.space(1)
          }
          index++
        }
        w.space(3)
        break
      }

      default:
        break
    }
  }

  w.doc.save(filename)
}
