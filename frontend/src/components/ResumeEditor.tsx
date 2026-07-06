import { forwardRef, useImperativeHandle, useRef, useEffect } from 'react'
import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { Bold, Italic, UnderlineIcon, List, ListOrdered, Download } from 'lucide-react'
import { downloadResumePdf } from '@/lib/resumePdf'

// ── Custom node: Company | Date row ─────────────────────────────────────────

const CompanyDateView = ({ node }: NodeViewProps) => (
  <NodeViewWrapper as="div" className="company-date-row">
    <span className="company-name">{node.attrs.company}</span>
    <span className="company-date">{node.attrs.date}</span>
  </NodeViewWrapper>
)

const CompanyDateNode = Node.create({
  name: 'companyDate',
  group: 'block',
  atom: true,
  draggable: false,

  addAttributes() {
    return {
      company: { default: '' },
      date: { default: '' },
    }
  },

  parseHTML() {
    return [{
      tag: 'div[data-type="company-date"]',
      getAttrs: (dom) => {
        const el = dom as HTMLElement
        return {
          company: el.getAttribute('data-company') ?? '',
          date: el.getAttribute('data-date') ?? '',
        }
      },
    }]
  },

  renderHTML({ node }) {
    return [
      'div',
      {
        'data-type': 'company-date',
        'data-company': node.attrs.company,
        'data-date': node.attrs.date,
        style: 'display:flex;justify-content:space-between;font-weight:bold;margin:14px 0 1px',
      },
      ['span', {}, node.attrs.company],
      ['span', {}, node.attrs.date],
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CompanyDateView)
  },
})

// ── Plain text → Tiptap HTML ─────────────────────────────────────────────────

function isDateFragment(s: string) {
  return /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December|\d{4}|Present)\b/i.test(s)
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function plainTextToHtml(text: string): string {
  if (!text.trim()) return '<p></p>'

  const lines = text.split('\n')
  const html: string[] = []
  let inList = false
  let nonEmptyCount = 0
  let prevWasCompanyDate = false

  function closeBullets() {
    if (inList) { html.push('</ul>'); inList = false }
  }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()

    if (!trimmed) {
      closeBullets()
      prevWasCompanyDate = false
      continue
    }

    nonEmptyCount++

    // ── Line 1: candidate name ── h1
    if (nonEmptyCount === 1) {
      html.push(`<h1>${esc(trimmed)}</h1>`)
      prevWasCompanyDate = false
      continue
    }

    // ── Line 2 (contact info): phone | email | links
    if (nonEmptyCount === 2 && (trimmed.includes('@') || trimmed.includes('|') || /\d{3}/.test(trimmed))) {
      html.push(`<p>${esc(trimmed)}</p>`)
      prevWasCompanyDate = false
      continue
    }

    // ── ALL CAPS section header (EXPERIENCE, SKILLS, etc.)
    const isAllCaps = trimmed === trimmed.toUpperCase()
      && /^[A-Z][A-Z\s&\/\-]{2,}$/.test(trimmed)
      && trimmed.length < 60
      && !trimmed.includes('|')
    if (isAllCaps) {
      closeBullets()
      html.push(`<h2>${esc(trimmed)}</h2>`)
      prevWasCompanyDate = false
      continue
    }

    // ── Job title line (line immediately after a company-date row)
    if (prevWasCompanyDate && !/^[•\-\*]/.test(trimmed)) {
      closeBullets()
      html.push(`<h3>${esc(trimmed)}</h3>`)
      prevWasCompanyDate = false
      continue
    }

    // ── Company | Date line: "Google | Jan 2022 – Present"
    if (trimmed.includes(' | ') && !trimmed.includes('@')) {
      const lastPipe = trimmed.lastIndexOf(' | ')
      const afterPipe = trimmed.substring(lastPipe + 3)
      if (isDateFragment(afterPipe)) {
        closeBullets()
        const company = trimmed.substring(0, lastPipe)
        html.push(`<div data-type="company-date" data-company="${esc(company)}" data-date="${esc(afterPipe)}"></div>`)
        prevWasCompanyDate = true
        continue
      }
    }

    prevWasCompanyDate = false

    // ── Bullet point
    if (/^[•\-\*]\s+/.test(trimmed)) {
      if (!inList) { html.push('<ul>'); inList = true }
      html.push(`<li><p>${esc(trimmed.replace(/^[•\-\*]\s+/, ''))}</p></li>`)
      continue
    }

    // ── Skills line: "Languages: Python, Go, TypeScript"
    if (/^[A-Za-z][A-Za-z\s\/]{1,25}:\s+\S/.test(trimmed)) {
      closeBullets()
      const colon = trimmed.indexOf(':')
      const label = trimmed.substring(0, colon).trim()
      const value = trimmed.substring(colon + 1).trim()
      html.push(`<p><strong>${esc(label)}:</strong> ${esc(value)}</p>`)
      continue
    }

    // ── Regular paragraph
    closeBullets()
    html.push(`<p>${esc(trimmed)}</p>`)
  }

  closeBullets()
  return html.join('')
}

// ── Component ────────────────────────────────────────────────────────────────

export interface ResumeEditorHandle {
  downloadPDF: () => void
}

interface Props {
  initialContent: string
  filename: string
}

const ToolbarButton = ({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) => (
  <button
    type="button"
    onMouseDown={e => { e.preventDefault(); onClick() }}
    title={title}
    className={`w-7 h-7 flex items-center justify-center rounded text-[12px] font-medium transition-colors ${
      active
        ? 'bg-foreground text-background'
        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
    }`}
  >
    {children}
  </button>
)

const Sep = () => <div className="w-px h-5 bg-border mx-0.5 flex-shrink-0" />

export const ResumeEditor = forwardRef<ResumeEditorHandle, Props>(
  ({ initialContent, filename }, ref) => {
    const paperRef = useRef<HTMLDivElement>(null)

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          bulletList: { keepMarks: true },
          orderedList: { keepMarks: true },
        }),
        Underline,
        CompanyDateNode,
      ],
      content: plainTextToHtml(initialContent),
      editorProps: {
        attributes: {
          class: 'outline-none',
          spellcheck: 'true',
        },
      },
    })

    useEffect(() => {
      if (editor && initialContent) {
        editor.commands.setContent(plainTextToHtml(initialContent))
      }
    }, [initialContent]) // eslint-disable-line react-hooks/exhaustive-deps

    // Direct file download (lands in the browser's Downloads bar) —
    // text-based PDF built from the CURRENT editor content including edits.
    const handleDownload = () => {
      if (!editor) return
      downloadResumePdf(editor.getJSON(), filename)
    }

    useImperativeHandle(ref, () => ({
      downloadPDF: handleDownload,
    }))

    return (
      <div className="flex flex-col h-full">
        {/* Toolbar */}
        <div className="flex items-center gap-0.5 px-4 py-2 border-b border-border bg-card flex-shrink-0 flex-wrap">
          <ToolbarButton active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()} title="Bold (⌘B)">
            <Bold size={13} strokeWidth={2.5} />
          </ToolbarButton>
          <ToolbarButton active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Italic (⌘I)">
            <Italic size={13} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()} title="Underline (⌘U)">
            <UnderlineIcon size={13} strokeWidth={2} />
          </ToolbarButton>

          <Sep />

          <ToolbarButton active={editor?.isActive('heading', { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} title="Name (H1)">
            H1
          </ToolbarButton>
          <ToolbarButton active={editor?.isActive('heading', { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="Section Header (H2)">
            H2
          </ToolbarButton>
          <ToolbarButton active={editor?.isActive('heading', { level: 3 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} title="Job Title (H3)">
            H3
          </ToolbarButton>
          <ToolbarButton
            active={editor?.isActive('paragraph') && !editor?.isActive('heading')}
            onClick={() => editor?.chain().focus().setParagraph().run()}
            title="Normal text"
          >
            ¶
          </ToolbarButton>

          <Sep />

          <ToolbarButton active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Bullet list">
            <List size={13} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Numbered list">
            <ListOrdered size={13} strokeWidth={2} />
          </ToolbarButton>

          <div className="flex-1" />

          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 h-7 text-[11px] font-medium bg-foreground text-background rounded-md hover:opacity-85 transition-opacity"
          >
            <Download size={11} strokeWidth={2} />
            Download PDF
          </button>
        </div>

        {/* Paper */}
        <div className="flex-1 overflow-auto bg-zinc-100 py-8">
          <div
            ref={paperRef}
            className="mx-auto bg-white shadow-md resume-paper"
            style={{
              width: '680px',
              minHeight: '880px',
              padding: '56px 64px',
              fontFamily: '"Times New Roman", Times, serif',
              fontSize: '11pt',
              lineHeight: '1.4',
              color: '#000000',
            }}
          >
            <style>{`
              /* Name */
              .resume-paper .ProseMirror h1 {
                font-family: "Times New Roman", Times, serif;
                font-size: 16pt;
                font-weight: 700;
                text-align: center;
                margin: 0 0 3px;
                color: #000;
                letter-spacing: 0.02em;
              }
              /* Contact line (first <p> after <h1>) */
              .resume-paper .ProseMirror h1 + p {
                text-align: center;
                font-size: 10pt;
                color: #000;
                margin: 0 0 14px;
              }
              /* Section headers */
              .resume-paper .ProseMirror h2 {
                font-family: "Times New Roman", Times, serif;
                font-size: 11pt;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.06em;
                border-bottom: 1.5px solid #000;
                padding-bottom: 1px;
                margin: 14px 0 5px;
                color: #000;
              }
              /* Job title */
              .resume-paper .ProseMirror h3 {
                font-family: "Times New Roman", Times, serif;
                font-size: 11pt;
                font-weight: 400;
                font-style: italic;
                margin: 0 0 3px;
                color: #000;
              }
              /* Regular paragraphs */
              .resume-paper .ProseMirror p {
                font-family: "Times New Roman", Times, serif;
                font-size: 11pt;
                margin: 2px 0;
                color: #000;
              }
              /* Bullets */
              .resume-paper .ProseMirror ul {
                margin: 2px 0 5px 18px;
                list-style-type: disc;
              }
              .resume-paper .ProseMirror ul li {
                margin: 1px 0;
              }
              .resume-paper .ProseMirror ul li p {
                margin: 0;
              }
              .resume-paper .ProseMirror ol {
                margin: 2px 0 5px 18px;
              }
              /* Company | Date row */
              .resume-paper .company-date-row {
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                margin: 12px 0 0;
              }
              .resume-paper .company-name {
                font-weight: 700;
                font-size: 11pt;
              }
              .resume-paper .company-date {
                font-size: 10.5pt;
                font-weight: 400;
              }
              /* Strong / em inside paragraphs */
              .resume-paper .ProseMirror strong {
                font-weight: 700;
              }
              .resume-paper .ProseMirror em {
                font-style: italic;
              }
              .resume-paper .ProseMirror:focus {
                outline: none;
              }
              /* Tiptap node selection indicator */
              .resume-paper .ProseMirror .ProseMirror-selectednode {
                outline: 2px solid #3b82f6;
                outline-offset: 1px;
              }
            `}</style>
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    )
  }
)

ResumeEditor.displayName = 'ResumeEditor'
