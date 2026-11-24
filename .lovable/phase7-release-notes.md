# Aurumi C.I.A. V1.0 — Validated Prototype Release Candidate

**Review candidate; Phase 7 not closed.** No publishing or deployment. Exact final-commit CI and independent Codex GO remain required.

## Scope
Foundation, Assessment/Solution/Proposal studios, anonymous Business Fit/consented intake, governed Engagement delivery/outcomes/reviews/completion and C.I.A. Network. Clean hotel and actual reseller source chains, anonymous distribution, restricted specialist, direct/ongoing advisory, amendment, unfavorable outcome, unknown ERP and recovery were service-tested.

## Stabilization
Deterministic visible dates/browser-local Overview hydration, usable studio shortcuts, mobile dialog keyboard behavior, accessible intake/system controls, consultation focus, exact proposal print identity and tax periods/basis, completion obligation/concern/authorization presentation, strict share expiry, stale Solution catalog-await decision rejection and mutable nested restoration quarantine.

## Validation
643 baseline tests retained; 24 new tests; 667/667 across 27 files. ESLint 0 errors/31 existing warnings. Automatic type/build signal OK; no standalone run claimed. Genuine released fixture restoration and recovery, fresh desktop hotel intake conversion, public/mobile task workflows and five-size responsive checks executed. Actual A4 Business Fit (5 pages), proposal (3), completion (2), long multi-currency proposal (5) generated/rasterized/inspected. Browser Chromium 147.0.7727.15 at localhost:8080. Not every service journey was clicked through in the browser; no WCAG certification.

## Limitations and accepted deferrals
All identities, persistence, integrations/pricing, sharing/acceptance and authorization evidence are simulated. No real signatures/commissions. Indicative roadmap sequencing and extra draft/withdrawal UX remain accepted prototype P2; full cross-browser/screen-reader auditing and complete J01–J10 click-through remain further QA. Real customer use requires the production-readiness prerequisites.

## Final corrective pass (P7-P1-01 and print acceptance)

- **P7-P1-01 reproduction:** `issue()` wrote version, workspace, parent status and audit as separate best-effort saves; a failed write left memory `shared` but storage `approved` (A), or a saved issuance with an `approved` parent that could not be retried (B).
- **Root cause:** issuance did not use the acknowledged `store.durable` commit used by Phases 5–6.
- **Correction:** all issuance changes run inside one `store.durable` commit (one storage write plus read-back). On failure memory and audit roll back, no success is returned; unacknowledged read-back puts the store into protected recovery, and `retryRecovery()` reconciles to the stored copy. The version/parent write boundary no longer exists.
- **Existing partial records:** a version carrying an issuance record under an `approved` parent is rejected with an explicit "only partially saved" message and left untouched; it is never silently completed. No migration.
- **Concurrency:** validation and commit are synchronous after the price-book await, so a second request sees the issuance and is rejected; one audit entry.
- **Tests:** `src/test/phase7-durable-issuance.test.ts` (A, B, B2, C, D, E; real services, injected write and read-back failures, persisted and in-memory assertions including audit). Historical fixtures unchanged and passing. Proposal fixtures now attach an in-memory store because issuance requires acknowledged storage.
- **Print:** five A4 PDFs preserved in `qa-evidence/phase7-print/` with `MANIFEST.md` (checksums, browser, settings). One print defect fixed (amounts split in the line table).
- **Validation:** Vitest 674/674 (667 retained + 7 new), `tsgo -b --noEmit` 0 errors, ESLint 0 errors/31 warnings, automatic build OK, browser issuance → reload shows `shared` with one audit entry. Exact-SHA GitHub Actions for the new commit: not yet verified.
- **Limits:** "acknowledged" means a synchronous browser-storage write confirmed by read-back, not a production transaction.

## Targeted authorization corrections
- Proposal issuance (and approval/submit/price refresh/line edits) re-check the actor's current canonical record after pricing waits; revoked authority is denied with nothing committed.
- Partially saved proposal issuances can no longer source new engagements or commencement authority; they remain viewable.
- Report rendering code unchanged (no diff under `src/components`, `src/routes`, `src/styles.css`); `qa-evidence/phase7-print/` untouched.
- Tests: 685 passing (674 retained + 11 new). TypeScript 0 errors; ESLint 0 errors/31 warnings.
