# Genuine historical proposal fixtures

These are actual persisted mock-service envelopes, not reconstructed proposal documents.
They contain only fictional workspace data. Fixture payloads and historical hashes are
kept unchanged; classification happens only at runtime.

| Files | Released implementation | Provenance |
| --- | --- | --- |
| `legacy-e696c05-issued.json`, `legacy-e696c05-approved.json` | `e696c056f14d5253a03236672126654aec38a0bd` | Retained original fixtures; both rechecked using that commit's original `versionIntegrityProblems` on 2026-11-24. |
| `legacy-8da73f4-issued.json`, `legacy-8da73f4-approved.json` | `8da73f45fe27ddace05e62beb92f8a851ebd61d6` | Generated on 2026-11-24 by running that commit's actual Proposal, Solution and Assessment services in an isolated temporary source folder. Its original validator accepted both before saving. |

## Reproduction

Read the released commit's source/configuration with `git show <commit>:<path>` into
a separate temporary folder, with the same installed dependencies and Vitest config.
Do not overlay the current domain or service onto that historical folder.

Run a temporary Vitest test using that release's `src/test/proposal-fixtures.ts` helpers:

1. Call `resetProposalTestState()` and attach `memoryBackend()` to `store`.
2. For the issued fixture call `issuedProposal()` (actual submit → independent approval → issue).
3. For the approved fixture start afresh, call `readyProposal()`, submit with `PRO`, then
   approve with `REVIEWER`, acknowledging qualifying deliverables and accepted risks.
4. Assert the release's `versionIntegrityProblems(version)` returns no problems and
   `hashContract` is genuinely absent.
5. Read the actual `STORAGE_KEY` envelope from the backend, then save it inside
   `{ generatedBy: <full commit>, proposalId, versionId, envelope }`.

IDs and timestamps naturally differ on regeneration; do not recompute or rewrite the
checked-in fixture hashes to make tests pass. Both historical algorithms are checked
independently against the unchanged original payloads by the current regression suite.

## Original file SHA-256 (before any formatting)

```text
78e0d7c89d897d6aa42e2121f5d2ee9454165cc9ca01eb8e5e27e13fbbd669bc  legacy-e696c05-approved.json
381f6e8d1a80876213596ebfd7611b39bdb32881ed68bdca8feb613210519713  legacy-e696c05-issued.json
7b1d72ee393f991194b0e937ae4cda585dabdbed2ff5777da9ac83d9fc9006ed  legacy-8da73f4-approved.json
ec0f8fbaf31fc9a1712ce5bec7a5dcb32565a3c4e06edd1ee6ba47f9bdf05f65  legacy-8da73f4-issued.json
```

## Assurance boundary

Only a truly absent marker permits the two historical consistency checks. Unknown,
null, undefined-present and explicitly unsupported `/1` markers fail closed. Explicit
`/2` never falls back to `/1`. Exactly one historical match is required, along with
the normal structural, financial, pinned-source and relationship validations.

Runtime metadata distinguishes historical original, historical strengthened and current
strengthened contracts without changing documents, review or issue records. Every
unmarked version is history-only for fresh approval/issuance; revise, create an explicit
`/2` version and obtain fresh authorization. This is compatibility/consistency, **not
cryptographic authentication**: untrusted browser storage cannot prove whether a marker
was originally absent or later stripped. Classification therefore never upgrades an
unmarked record's authority to create a new commitment.