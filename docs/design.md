# Tailr — Design System

> Reverse-engineered from live product screenshots (dashboard, applications table, generate docs, profile, landing page, login). Values marked `[INFERRED]` are best-effort estimates from visual inspection — verify against actual CSS/Tailwind config before treating as source of truth.

## 1. Overview

**Design System Name:** Tailr Dark
**Brand essence:** A precision instrument for job hunting — engineered, confident, no fluff.
**Key principles:**
- **Data-first, decoration-last.** Every screen leads with a number, a status, or a score. Chrome stays minimal so the data reads instantly.
- **One accent, used sparingly.** Lime green is the only color that shouts. It marks primary actions and the one metric you should notice.
- **Monospace for machine-truth, sans for human-read.** Labels, counters, and system text use a mono face; headlines and body copy use a humanist sans. This split signals "this is computed" vs. "this is written for you."
- **Near-black, not pure-black.** Backgrounds sit just above true black so elevation and borders stay visible.
- **Confidence over cleverness.** Landing page copy is blunt and short ("Apply with precision.") — the product explains itself, it doesn't need to charm.

---

## 2. Brand & Emotional Guidelines

**Tone of voice:** Direct, competent, slightly clinical — like a well-built internal tool, not a consumer app trying to be liked. Confidence without hype.

**The UI should feel:** Fast, trustworthy, quietly powerful. Like a cockpit, not a brochure.

**Do's:**
- Do lead every card/metric with the number first, label second (`6` then `TOTAL TRACKED`).
- Do use the lime accent only for the single most important action or metric on a screen.
- Do keep copy short and literal ("No responses yet" not "Looks like you're just getting started!").
- Do use uppercase mono labels for structural/system text (section headers, table columns, stat labels).

**Don'ts:**
- Don't use more than one saturated accent color per screen — status pills use muted blue, not lime, to avoid competing with primary CTAs.
- Don't add decorative illustrations, gradients, or stock photography inside the app shell (the moody skyline photo is reserved for the login screen only, as a one-time emotional beat).
- Don't use exclamation points, emoji, or "delightful" microcopy — this breaks the precision-tool tone.
- Don't let borders/dividers get louder than the content; keep them barely-there.

---

## 3. Color System

### Base tokens
```
--black-950:  #0A0A0A   /* app shell background */
--black-900:  #121212   /* card/panel background [INFERRED] */
--black-850:  #1A1A1A   /* elevated surface, hover states [INFERRED] */
--gray-700:   #2A2A2A   /* borders, dividers [INFERRED] */
--gray-500:   #6B7280   /* secondary/muted text [INFERRED] */
--gray-300:   #9CA3AF   /* placeholder text [INFERRED] */
--white:      #FFFFFF   /* primary text */

--lime-400:   #CFFF3D   /* primary accent — CTAs, key metrics, active nav [INFERRED, verify exact hex] */
--lime-500:   #B8E62E   /* accent hover/active state [INFERRED] */

--blue-500:   #3B82F6   /* status: Applied pill text/dot [INFERRED] */
--blue-900:   #1E293B   /* status: Applied pill background [INFERRED] */

--success:    #22C55E   /* Offer status, positive states */
--danger:     #EF4444   /* Rejected status, destructive actions */
--warning:    #F59E0B   /* Phone Screen / pending states */
```

### Light mode
Not currently implemented in the product — Tailr ships dark-only. If a light mode is ever built, invert the black scale to a warm-white base (`#FAFAFA` / `#F0F0F0`) and darken the lime accent for contrast (`#8FBF00`-ish) since lime-on-white fails contrast at the current saturation.

### Usage rules
- **Lime** = one per screen, reserved for the single primary action (`Try it now`, `Get started`, `Start for free`, `Analyze Fit`). Never use it for secondary buttons or decorative accents.
- **Blue** = status pills only (`Applied`). Muted/desaturated so it doesn't compete with lime.
- **Black-950 vs black-900** = shell vs. card. The 12–16px value difference is what creates "elevation" — no shadows are used for this.
- Borders (`gray-700`) should be nearly invisible at rest; they exist to separate zones, not to decorate them.

---

## 4. Typography

### Families
```
--font-mono: "JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace;
--font-sans: "Inter", -apple-system, "Helvetica Neue", sans-serif;
```
`[INFERRED]` — the uppercase system labels (`NAVIGATION`, `PIPELINE BREAKDOWN`, `TOTAL TRACKED`, table column headers) read as monospaced/geometric with fixed letter-spacing. The large landing-page headline (`Apply with precision.`) and body copy read as a clean grotesque sans. Confirm exact family names in the codebase.

### Scale
| Token | Size | Weight | Usage |
|---|---|---|---|
| `display` | 64–72px | 800 | Landing hero headline only |
| `h1` | 28px | 700 | Page titles ("Overview", "Applications", "Profile") |
| `h2` | 18px | 600 | Card/section titles |
| `stat-xl` | 40px | 700 | Big dashboard numbers (6, 0%, 0) |
| `body` | 15px | 400 | Table rows, descriptions |
| `label-mono` | 11px | 500, uppercase, +0.06em tracking | Section labels, table headers, stat captions |
| `caption` | 13px | 400 | Secondary/meta text (dates, counts) |

### Hierarchy rules
- Every dashboard card follows: mono label (small, gray) → number (large, white) → caption (small, gray). Never reorder this.
- Page headers pair an `h1` with a `caption`-weight subtitle directly beneath (e.g. "Overview" / "Week of June 17, 2026").
- Table headers are always `label-mono`, uppercase, gray — never the same weight as row content.

---

## 5. Spacing & Layout Grid

### Base scale (4px increments)
```
4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96
```

### Layout
- **Sidebar:** fixed ~280–320px, dark, own vertical rhythm separate from main content.
- **Main content max-width:** full-bleed within the viewport minus sidebar; cards arrange in a responsive grid (4-up stat cards, 2-up content panels below).
- **Card padding:** 24px internal padding standard.
- **Card gap:** 16–20px between grid items.
- **Landing page:** generous vertical rhythm — 96–160px between major sections (hero → how-it-works → features → CTA). This is intentionally much airier than the dashboard.
- **Breakpoints:** `[INFERRED — not visible in screenshots]` — recommend standard `640 / 768 / 1024 / 1280` until confirmed.

### Vertical rhythm
Dashboard is dense (short gaps, information-forward). Landing/marketing pages are sparse (long gaps, breathing room). This contrast is intentional — don't apply dashboard spacing to marketing pages or vice versa.

---

## 6. Elevation / Depth / Effects

- **No drop shadows observed.** Elevation is communicated purely through background color steps (black-950 → black-900) and 1px borders (`gray-700`).
- **Borders:** 1px solid, low-contrast, used on cards, table rows (as dividers), and inputs.
- **Border radius scale:**
```
--radius-sm: 6px    /* inputs, small tags */
--radius-md: 10px   /* cards, panels */
--radius-lg: 16px   /* large feature cards, modals [INFERRED] */
--radius-full: 999px /* buttons, pills, status badges, avatar circles */
```
- **Blur/glow:** The lime CTA on the pricing-style callout section has a very subtle glow/highlight treatment — use sparingly, only on the single most important CTA per page.

---

## 7. Components & Patterns

**Buttons**
- Primary: lime background, black text, fully rounded (`radius-full`), medium weight. Used for exactly one primary action per view.
- Secondary/ghost: transparent or dark background, white text, subtle border — used for "Sign in" style secondary actions.
- States: hover = darken lime slightly (`lime-500`); disabled = reduce opacity to ~40%, no color change.

**Cards (stat cards)**
- Dark surface (`black-900`), 1px border, `radius-md`.
- Content structure locked: icon (top-right, muted) → mono label → large number → small caption.

**Status pills/badges**
- Fully rounded, small dot + label, muted background matching the status color at low opacity (e.g. `blue-900` bg + `blue-500` text/dot for "Applied").
- Never use the lime accent for status — reserve lime for actions only.

**Inputs**
- Dark background, 1px border (`gray-700`), `radius-sm`, white text, gray placeholder.
- Focus state: `[INFERRED]` — recommend border shifts to lime at low opacity, avoid full lime outline (too loud against dark background).

**Navigation (sidebar)**
- Icon + label rows, generous vertical padding (~14–16px per item).
- Active state: light/white background pill behind the item (as seen on "Dashboard", "Applications", "Profile" when selected) — inverts to dark text on light background rather than using the lime accent. This keeps nav state distinct from CTA color.

**Tables**
- Header row: `label-mono`, uppercase, gray, no background.
- Rows: 1px bottom border, generous row height (~64px), avatar/initial badge in first column, status pill in last-but-one column.
- No zebra striping — rely on row dividers only.

**Empty states**
- Icon in a soft circular container, bold short headline ("No analysis yet"), one line of muted supporting copy, no illustration.

**Landing page patterns**
- Hero: eyebrow pill label (bordered, mono, lime dot) → huge two-line headline (white line + lime line) → supporting paragraph + inline stat card → primary CTA + trust microcopy ("No credit card required").
- Numbered feature list: large mono numerals (`01 02 03`) as visual anchors, not decoration — don't replace with icons.
- Closing CTA: full-width dark-lime-tinted panel, large headline, single button, right-aligned or centered.

---

## 8. Iconography & Illustration Style

- **Icon style:** Thin-stroke, minimal line icons (briefcase, clock, checkmark, bell) — no filled/solid icon variants, no duotone.
- **Avatars/initials:** Single-letter monogram in a rounded square, muted dark background, white text — used consistently for both company logos-as-initial (table rows) and user profile.
- **No illustration system observed** — the product relies entirely on typography, data, and the login-page photograph. Don't introduce illustrated mascots, spot art, or gradients elsewhere; it would break the "precision tool" tone.
- **Photography:** Reserved exclusively for the login screen (moody city skyline) as an emotional bookend — not used inside the authenticated app.

---

## Anti-patterns (explicit — for agent guardrails)
- ❌ Don't add a second saturated color competing with lime on any screen.
- ❌ Don't use drop shadows for elevation — use background-step + border only.
- ❌ Don't use rounded-corner-only buttons for secondary actions — reserve full pill shape + lime fill for primary CTAs so it stays a single, unambiguous signal.
- ❌ Don't inject illustrations, emoji, or playful copy — tone is engineered/confident, not friendly/cute.
- ❌ Don't apply landing-page spacious rhythm to dashboard views, or dashboard density to marketing pages.