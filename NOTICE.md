# Notices

## Coursework starter

LabClear was developed for the course 06048308 Intelligent Chatbot Development from the
architecture of the coursework starter `chacharin/chatbot-it-kmitl`. That repository did not
publish a software license, so this project grants no new rights to its code. Use LabClear for
learning and demonstration; ask the upstream author before any commercial use.

## Bundled third-party components

These files are included in the repository unchanged.

| Component | License | Location |
|---|---|---|
| marked 15.0.12 | MIT | `static/vendor/marked.min.js`, `static/vendor/marked-LICENSE.md` |
| DOMPurify 3.4.16 | Apache-2.0 or MPL-2.0 | `static/vendor/purify.min.js`, `static/vendor/dompurify-LICENSE` |
| Three.js 0.186.1 (bundled into `static/js/hero3d.js`) | MIT | `static/vendor/three/LICENSE` |
| reveal.js 5.2.1 (slides only) | MIT | `presentation/vendor/reveal.js-5.2.1/LICENSE` |

Source URLs and hashes of the scripts are listed in `static/vendor/SOURCES.json`.

## Fonts

All fonts are self-hosted under the SIL Open Font License 1.1. No font is loaded from a remote
service at runtime.

| Font | Use | License file |
|---|---|---|
| IBM Plex Sans Thai | Thai body text; Thai text in generated knowledge PDFs | `static/fonts/IBMPlexSansThai-OFL.txt` |
| Trirong | Thai headings | `static/fonts/Trirong-OFL.txt` |
| Geist, Geist Mono | Latin text and code | `static/fonts/Geist-OFL.txt` |
| Source Serif 4 | Latin display headings | `static/fonts/SourceSerif4-OFL.txt` |

## Design references

The OCR table uses native HTML and JavaScript. Its search, sticky header and filtering are inspired by
the MIT-licensed Origin UI table patterns (<https://originui.com/tables>,
<https://21st.dev/@originui/components/table>). No Origin UI code or other UI framework is bundled.

## Python dependencies

Packages in `requirements.txt` are installed from PyPI under their own licenses and are not bundled
in this repository. Examples: reportlab (BSD), used to generate LabClear summary PDFs, and pypdfium2
(BSD-3-Clause or Apache-2.0), used to render PDF pages.

## Medical sources

The documents in `knowledge/medical_sources/raw/` are public education and reference pages from the
publishers listed in `knowledge/evidence/catalog.json`, kept so answers can be checked against them.
They remain the property of their publishers. The knowledge records are summaries for education, not
copies of the publishers' documents.

## Hospital links

`business_data/hospital_links.json` links to official public pages of real hospitals. The names and
pages belong to those hospitals. LabClear has no partnership with them and does not book with them.

## AI providers

LabClear can call third-party AI services (Typhoon, OpenAI, Anthropic, Google, Hugging Face,
OpenRouter, xAI, Moonshot, Alibaba Cloud, DeepSeek, iApp and TypeSafe). Each is used under its own
terms with the operator's own API key. No provider code is bundled.

## Data

All packages, prices, centers, payments and lab reports in this project are simulated. The LabClear
name and logo were created for this project.
