# Phase 7 print evidence — fictional data only

- Tested application source: the working tree committed in the commit that adds this directory
  (parent `4a13ce3`). PDFs were generated from that exact source before committing; no application
  source changed between generation and commit. Any later documentation-only commit must be checked
  with `git diff <tested>..HEAD -- src` (expected empty).
- Browser: Chromium 147.0.7727.15 (Playwright, headless), locale en-GB.
- Print settings: `page.pdf(format="A4", print_background=True, prefer_css_page_size=True)` with
  print media emulated and the same body class the in-app "Print / save as PDF" button sets
  (`printing-proposal` / `printing-delivery`); CSS `@page { size: A4; margin: 14mm }`. 595×842 pt pages.
- Generator: `scripts/phase7_print_evidence.py`. Sources are service-generated envelopes written by
  tests with `PHASE7_CAPTURE=1` (`phase7-journeys` J01, `phase7-print-commercials`,
  `phase7-amended-unsuccessful`); the Business Fit report is produced by the anonymous browser flow.
- Inspection: every page rasterised (pdftoppm) and viewed; text extracted with pypdf.

| File | Report | Fictional source | Pages | SHA-256 | Inspection |
|---|---|---|---|---|---|
| 01-business-fit-report.pdf | Public Business Fit report | Anonymous "Small distributor" check, Cedar Distribution (fictional) | 5 | 30d032c648049a020cbc28e637c80ab0e809ded571d49ed23efd85b838c4f66b | Pass: identity, context, maturity, recommendations with explanations, limitations; no contact fields; no app controls. Page 1 is short (cover + context) by design of section break rules. |
| 02-standard-issued-proposal.pdf | Standard issued proposal | J01 Phase 7 Harbour Hotel proposal, version 1, issued | 3 | 2c4afa260f5328f32924b630113b6e0b215d2ee2fe237ad46db0138f908c2fee | Pass: identity/version, issued status and validity, scope, commercials, assumptions/exclusions, tax note, simulated acceptance wording. |
| 03-long-multicurrency-proposal.pdf | Long multi-currency issued proposal | Acme Collections proposal (phase7-print-commercials) | 5 | 3b91f626d2fe552f98b3c9bc95a741e8a0fbf2575af63415fbef00a9f95933d5 | Pass after fix: separate INR (one-time tax 39,600; monthly tax 450; annual tax 1,728) and USD (monthly 99) panels, never combined; 24-line table breaks between rows. |
| 04-standard-completion-report.pdf | Standard completion report | J01 hotel engagement completion | 2 | 48ca3be83790d7c629b9274cb49cf3c275737205c6805cda654122d34c94b1fa | Pass: identity/version, original scope, commitments, accepted deliverables, outcome (partially achieved, 120→80, target 60), responsibilities, simulated authorization. |
| 05-amended-unsuccessful-completion-report.pdf | Amended, unsuccessful completion | Coral Bay Resort `delivery_hotel` via governed services (phase7-amended-unsuccessful) | 2 | afb8d0a556d2a701f43729df3e7be9a0b1f2e3f4b5391074a20db11b643cd310 | Pass: original obligation "superseded by amendment", revised obligation satisfied, applied amendment listed, "not achieved · baseline 120 · target 60 · actual 180", 80-minute step in authored summary, outstanding responsibilities, "Simulated — not a legal signature". No commercial figures. |

Print defect found and fixed: proposal line-item columns broke amounts mid-number ("INR 60,0 / 00")
because of `overflow-wrap: anywhere`. Non-description columns of the line table now stay unbroken.
Remaining minor item: narrow "Responsible" header in the scope table wraps; readable.
