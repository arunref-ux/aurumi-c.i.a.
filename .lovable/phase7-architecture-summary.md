# C.I.A. Workspace consolidated architecture

Authoritative rules remain root `AGENTS.md` and `src/data/AGENTS.md`; this document summarizes rather than replaces them.

Foundation supplies shared shell/navigation, immutable audit identities, scoped repositories and derived dashboard metrics. Promise-based services and query hooks isolate Assessment, Solution, Proposal, Business Fit and Delivery/Network from the simulated store.

Business Fit pins questionnaire/rules/public-safe catalog and effective self-reported responses; consented mock lead/intake conversion carries unverified provenance into Assessment. Assessment independently approved hand-offs embed evidence and complete question definitions. Solution pins the baseline and versioned catalog, validates claims/dependency closure and embeds the assessment in its approved hand-off. Proposal pins the solution, illustrative price references and exact submitted document; independent approval/issue/sharing are version-bound. Engagement initiation derives exact obligations from the issued source or direct scope, needs bound commencement authorization, maps exact-version acceptance and applies only independently approved obligation amendments. Versioned outcomes/measurements feed material-state reviews and immutable completion; continuation is a recommendation, not an obligation. Network references existing identities and independently governed qualifications/affiliations.

Repositories/service boundaries enforce six-role organization/team/self scope; commercials and Business Fit contacts are separate grants. Noncommercial delivery projections suppress nested commercial source/completion content without rewriting canonical data. Client-side mock identity is not production security.

Shared browser persistence validates restored data, confirms intact quarantine backup before allowing unsafe recovery/writes, and retains valid siblings. Business Fit and Phase 6 material operations use acknowledged durable commits and stable adapter intent keys. Solution catalog-await writes fingerprint/re-authorize current actor/source/content before synchronous commitment. Mutable malformed partner fields/revisions are quarantined separately.

No Phase 7 integrity algorithm changed: Assessment/Solution /2 hand-offs; Proposal explicit strengthened /2 with genuinely absent historical original/strengthened matching; Business Fit released /1 history and current /2; Delivery original /1 history-only and strengthened /2 obligation/commencement/outcome/review/completion contracts. Explicit unknown markers fail closed; historical source-bound prospective revalidation never retroactively certifies history. Local hashes prove consistency, not external authenticity.

Typed adapters remain mocks owned by their upstream Aurumi products. No production API/database/auth, deployment, new reporting engine or new domain workflow was added. SSR-visible date/number output is deterministic; browser-local Overview renders after hydration. Existing report panels print actual A4 output.

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
