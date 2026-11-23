# Data layer rules
- Proposal Studio (`src/data/proposal-studio.ts`, hooks in `src/lib/proposal-queries.ts`) stores proposals in the shared `proposals` table with a pinned `source` solution hand-off (/2); such rows are blocked from generic repository updates, so lifecycle changes go only through the workflow service.
- Proposal deliverable classes, readiness and commercial totals are derived in `src/domain/proposal.ts` (never input); totals are per currency and billing period, taxes only when configured with a source, and prices are pinned references to the read-only Pricing Studio adapter, so a proposal can't become a competing price master.
- Submitting freezes a `proposalVersions` record with a content hash; approval and issue bind to that exact version and any later material edit supersedes it, so an old approval never authorizes changed terms.
- Proposal sharing and recipient responses are simulated records (`proposalShares`); acceptance is never treated as a signed contract.
