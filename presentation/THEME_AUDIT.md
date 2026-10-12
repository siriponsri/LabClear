# LabClear Theme Audit and Reference Selection Map

Audit date: 12 October 2026 (Asia/Bangkok)  
Brand source revision: `38e39f03a8a21a294001cbb2bd146a4c7ea611eb`
Primary source: `static/css/base.css`; page patterns from `static/css/site.css`, `static/css/workspace.css`, and `static/css/admin.css`.

## LabClear Brand Tokens

Values below are presentation-safe sRGB conversions of local OKLCH tokens. LabClear local design remains authoritative; reference repos guide composition only.

| Role | Local source token | Deck value / use |
|---|---|---|
| Canvas | `--color-bg: oklch(99.3% 0.002 295)` | `#FDFCFE`; near-white slide background. |
| Surface | `--color-surface: oklch(100% 0 0)` | `#FFFFFF`; product image frame and repeated workflow nodes only. |
| Secondary surface | `--color-surface-2: oklch(96.4% 0.005 295)` | `#F3F2F6`; restrained lane or grouped-node separation. |
| Main text | `--color-fg: oklch(20.5% 0.012 295)` | `#17161C`; headings and core labels. |
| Muted text | `--color-fg-muted: oklch(48% 0.014 295)` | `#5E5C65`; supporting copy. |
| Soft text | `--color-fg-soft: oklch(56% 0.012 295)` | `#75737B`; eyebrow and source notes. |
| Accent | `--color-accent: oklch(46% 0.17 297)` | `#6539A9`; selected step, route, or emphasis only. |
| Strong accent | `--color-accent-strong: oklch(34% 0.2 302)` | `#4E008A`; closing emphasis. |
| Accent surface / border | `--color-accent-subtle`, `--color-accent-border` | `#F3EFFF`, `#D4CBEE`; subtle focus and separators. |
| Success | `--color-ok: oklch(45% 0.11 155)` | `#036639`, paired with `#E3F8E9` and a text label. |
| Warning | `--color-warn: oklch(48% 0.1 70)` | `#81520A`, paired with `#FEF2D9` and a text label. |
| Error | `--color-bad: oklch(48% 0.16 25)` | `#A5292B`, paired with `#FFECE9` and a text label. |

Typography follows the current HTML CSS stack: `Geist, PlexThai` for body/numerals and `RSDisplay, RSDisplayThai` for headlines, with local Source Serif 4, Trirong and IBM Plex Sans Thai assets. The live browser font checks are recorded as HTML-03 in the final QA run. PPTX font fidelity is out of scope because HTML is the final format.

Composition uses a 1280 × 720 canvas, 88 px outer margins, a restrained 4/8/16/24/32/48 px rhythm, 8 px corners, thin neutral separators and whitespace. Repeated node boxes are used only where they explain a flow; sections are not stacked into nested cards. Status colors always include text labels.

## Candidate Composition Map

| Slide | Message | Composition | LabClear treatment |
|---:|---|---|---|
| 1 | LabClear is a prototype whose sources can be inspected. | Signal-style opening with a decorative vector route illustration. | Product name and scope are HTML text; synthetic packages/prices are labelled as simulated. |
| 2 | The project is framed around choosing, reading, and confirming. | Three-part project framing. | Editable groups, near-white canvas, restrained violet, explicit “not customer research” qualifier. |
| 3 | A service request ends at staff confirmation. | Five-step process. | HTML labels/shapes; simulator and no-transfer caveat visible. |
| 4 | Users review extracted values before explanation. | Five-step evidence sequence. | Native editable steps and visible clinical-validation limit. |
| 5 | Server checks separate browser requests from application services. | Layered architecture. | Simplified from current single-service architecture; scope note avoids claiming every route or production scale. |
| 6 | Retrieval adds references but does not prove truth. | Evidence chain with caution band. | Native editable labels and statement; no answer-quality claim. |
| 7 | Human handoff requires consent and ownership. | User/system/staff swimlane. | Local tests and queue privacy behavior are distinguished from production privacy or an SLA. |
| 8 | Automated local browser workflow checks passed 37/37. | Primary-result metric and bar. | Count and bar are native shapes/text; fixture/mock conditions stay adjacent. |
| 9 | Several release gates remain unverified. | Evidence/limitation register. | Six visible rows include production privacy and retention/restore separately. |
| 10 | Evidence comes before a readiness promise. | Quiet closing statement. | Recommendation is labeled as a recommendation, not an outcome. |
| A1–A5 | Coverage, architecture, AI limits, provenance, and business assumptions. | Table, flow, comparison, source record, and open questions. | Same tokens and typography; appendix is not in the speaking-time total. |

## Reference Revisions and Roles

| Reference | Revision | Use |
|---|---|---|
| `ambymon/presentation-design-system` | `04f135e96f7c79d80ab2479edcf40522e9a9cbac` | Project framing and general product/data composition. |
| `joaovitor2763/Core-Slides-G4` | `c1435232f1277b1e1b1cd97913145a2faee3a4b8` | Journey, architecture, process and swimlane composition. |
| `zarazhangrui/beautiful-html-templates` / Signal | `e5e204fb1f3b06290846e7dcd7aceddabeceec8c` | Opening/closing rhythm only. |
| `zarazhangrui/frontend-slides` | `9906a34d640d2111f724544cbc50f7f130569ae1` | Art direction and motion pacing only. |
| `jxpeng98/slidev-theme-scholarly` | `7b829aa5acbbf97e7cb261be1cfcbe0c4b0aa01c` | Evidence, citation, result and limitation layouts. |

No reference palette or full theme was copied. The deck is the direct HTML source at `presentation/index.html`, with local Reveal.js and local LabClear assets. Browser layout, Thai font loading, desktop/mobile navigation, print mode and PDF bytes are checked by `scripts/verify_html_deck.mjs`; exact results belong in `presentation/QA_REPORT.md`. Visual editing in a separate no-code slide editor and PPTX export are not requirements of this HTML delivery.
