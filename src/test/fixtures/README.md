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

## Additional Phase 7 released-source captures

On 2026-11-24, each source/configuration file was read using permitted `git show <SHA>:<path>` into its own isolated `/tmp/phase7-released/<revision>` folder. Installed test dependencies were shared; no current domain/service overlay was used. One capture test per release executed its original services and passed. Captured JSON is copied byte-for-byte, never rehashed or synthesized. `phase7-released-history.test.ts` checks original immutable values and failed operations across three reloads and source-bound recovery.

| File prefix `phase7-released-` | Original source | SHA-256 |
|---|---|---|
| `25909e3-issued.json` | `25909e3519c27b53d16a9837037e002280a9606d` | `9737522ac50eb8b960c67ce352273b89c4635ccdc3655282ead142d7d1467b4e` |
| `aa406c5-issued.json` | `aa406c53293585e97a717f00c1dc4d3ae9aa6a85` | `392d78cd4906ef658a8052dc465af18417faa0afb1764cd21bf123291a715f48` |
| `e49e770-issued.json` | `e49e770050c35403178c5b51a0e384db5df988cc` | `b6ce700e0555a94391af2df6cc853a99ce6cfdeb06a2ecb11c95eae16ad2d288` |
| `9e19f209-business-fit.json` | `9e19f209b70827e59851c19818a85697af4e8b39` | `7845a689b29b7ebbb0179251b4528e4848f0f2ebc20bba59ff1f0bd24234d780` |
| `47ec5df-delivery.json` | `47ec5dfbc69003781e338c514a1d991f4127cd7a` | `953beb2d20e1642e0e5692266d9ce24e64c86e4612ce1dd9fc8e7f6d239301d7` |

These include actual approved Assessment/Solution hand-offs, issued proposal formats, consented Business Fit and strengthened completed/recoverable delivery records. Existing genuine `e696c05`, `8da73f4`, `ebe4033` and `9ce518a` fixtures remain untouched. Isolated capture tests are supporting execution evidence, not added to the application suite count.

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

## Genuine initial Phase 6 history

`phase6-9ce518a-history.json` was generated by running the actual released
`9ce518ad7e1f5e39007418bdd1422e056cbf3f67` services in the working tree before
the first domain/service correction. The actual persisted envelope includes draft,
direct authorized and active issued-proposal engagements, applied scope amendment,
accepted artifact, 120-minute baseline, independently verified 80-minute observation,
monthly/completion reviews, completed engagement and a failed recoverable task intent.

`phase6-9ce518a-assignment-history.json` was generated separately from that commit's
unaltered source/configuration read with `git show` into an isolated `/tmp` folder.
Its actual assignment service replaced the Brightline lead with the specialist,
retaining the former lead's ended assignment. The original service assertions passed.
Neither fixture uses the strengthened implementation, reconstructed immutable records,
or rewritten historical seals.

Original captured SHA-256 values:

```text
3eee27ad832bf777937764540d186a39d5725cc89cb839b0370db3823d6e5345  phase6-9ce518a-history.json
44a1dbd08c5d817a8e89cffdb32dfc55fb2c947cbe7cbd368165d38ab9fc0137  phase6-9ce518a-assignment-history.json
```

The corrective tests compare actual restored rows with these unchanged envelopes
across repeated reloads. Released `/1` evidence remains historical-only: current
authorized revalidation permits prospective source-bound follow-on/recovery, never
retroactive content-bound verification or compliant-completion certification.