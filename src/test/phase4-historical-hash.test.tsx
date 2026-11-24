/** P1-05: genuine released payloads coexist, without upgrading historical authorization. */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VersionsSection } from "@/components/proposal/review";
import { proposalStudio as P } from "@/data/proposal-studio";
import { memoryBackend, QUARANTINE_KEY, STORAGE_KEY, store } from "@/data/store";
import * as assessment from "@/domain/assessment";
import {
  documentHash,
  HASH_CONTRACT,
  isLegacyVersion,
  LEGACY_HASH_CONTRACT,
  versionHashMetadata,
  versionIntegrityProblems,
  type ProposalVersionRecord,
} from "@/domain/proposal";
import originalIssued from "./fixtures/legacy-e696c05-issued.json";
import originalApproved from "./fixtures/legacy-e696c05-approved.json";
import strengthenedIssued from "./fixtures/legacy-8da73f4-issued.json";
import strengthenedApproved from "./fixtures/legacy-8da73f4-approved.json";
import {
  issuedProposal,
  readyProposal,
  resetProposalTestState,
  REVIEWER,
} from "./proposal-fixtures";
import { MGR, PRO } from "./solution-fixtures";

beforeEach(resetProposalTestState);
type Fixture = {
  proposalId: string;
  versionId: string;
  envelope: { tables: { proposalVersions: unknown[] } };
};
const fixtures = [
  {
    label: "e696c05",
    issued: originalIssued,
    approved: originalApproved,
    contract: LEGACY_HASH_CONTRACT,
    assurance: "historical-original",
  },
  {
    label: "8da73f4",
    issued: strengthenedIssued,
    approved: strengthenedApproved,
    contract: HASH_CONTRACT,
    assurance: "historical-strengthened",
  },
] as const;
function version(fx: Fixture): ProposalVersionRecord {
  const v = fx.envelope.tables.proposalVersions.find(
    (v) => v !== null && typeof v === "object" && "id" in v && v.id === fx.versionId,
  );
  if (!v) throw new Error("Fixture version missing");
  return structuredClone(v) as unknown as ProposalVersionRecord;
}
function restore(fx: Fixture) {
  const backend = memoryBackend();
  const raw = JSON.stringify(fx.envelope);
  backend.write(STORAGE_KEY, raw);
  store.attach(backend);
  return { backend, raw };
}
const acknowledge = (v: ProposalVersionRecord) => [
  ...v.document.deliverables.filter((d) => d.info.needsQualification).map((d) => d.id),
  ...v.document.risks.filter((r) => r.resolution === "accepted").map((r) => r.id),
];

for (const f of fixtures)
  describe(`${f.label} genuine historical fixture`, () => {
    it("recognizes exactly its released contract with explicit runtime assurance", () => {
      const v = version(f.issued);
      expect("hashContract" in v).toBe(false);
      expect(documentHash(v.document, f.contract)).toBe(v.contentHash);
      expect(
        documentHash(
          v.document,
          f.contract === HASH_CONTRACT ? LEGACY_HASH_CONTRACT : HASH_CONTRACT,
        ),
      ).not.toBe(v.contentHash);
      expect(versionHashMetadata(v)).toEqual({
        contract: f.contract,
        assurance: f.assurance,
        problem: null,
      });
      expect(versionIntegrityProblems(v)).toEqual([]);
      expect(isLegacyVersion(v)).toBe(true);
    });
    it("restores without quarantine and preserves the entire record and saved payload", async () => {
      const { backend, raw } = restore(f.issued);
      expect(store.persistence()).toMatchObject({ quarantined: 0, protected: false });
      const view = await P.get(PRO, f.issued.proposalId);
      expect(view.versions.find((v) => v.id === f.issued.versionId)).toEqual(version(f.issued));
      expect(backend.read(STORAGE_KEY)).toBe(raw);
      expect(backend.read(QUARANTINE_KEY)).toBeNull();
    });
    it("version history opens the original issued preview without changing approvals or issuance", async () => {
      restore(f.issued);
      const view = await P.get(PRO, f.issued.proposalId);
      render(<VersionsSection view={view} />);
      fireEvent.click(screen.getByRole("button", { name: /^Version 1$/ }));
      expect(screen.getByText("Frozen version 1 — Issued")).toBeTruthy();
      expect((await P.get(PRO, f.issued.proposalId)).versions).toEqual(view.versions);
    });
    it("cannot newly issue a historical approved version, even when its hash is strengthened", async () => {
      restore(f.approved);
      const before = version(f.approved);
      await expect(P.issue(MGR, f.approved.proposalId, f.approved.versionId)).rejects.toThrow(
        /unmarked historical.*fresh approval/,
      );
      expect(
        (await P.get(PRO, f.approved.proposalId)).versions.find((v) => v.id === before.id),
      ).toEqual(before);
      expect(before.issue).toBeUndefined();
    });
    it("requires a new explicit /2 version and fresh authorization after revision", async () => {
      restore(f.approved);
      await P.revise(PRO, f.approved.proposalId, "Fresh explicit authorization");
      const v = await P.submitForReview(PRO, f.approved.proposalId);
      expect(v.hashContract).toBe(HASH_CONTRACT);
      expect(v.review).toBeUndefined();
      await expect(P.issue(MGR, f.approved.proposalId, v.id)).rejects.toThrow();
      await P.approve(REVIEWER, f.approved.proposalId, v.id, { acknowledged: acknowledge(v) });
      const issued = await P.issue(MGR, f.approved.proposalId, v.id);
      expect(issued.review?.by).toBe(REVIEWER.user.id);
      expect(issued.issue?.issuedBy).toBe(MGR.user.id);
      const old = (await P.get(PRO, f.approved.proposalId)).versions.find(
        (x) => x.id === f.approved.versionId,
      );
      expect(old?.document).toEqual(version(f.approved).document);
      expect(old?.contentHash).toBe(version(f.approved).contentHash);
      expect(old?.review).toEqual(version(f.approved).review);
      expect(old?.issue).toBeUndefined();
    });
    it("quarantines inconsistent finances while preserving a valid historical sibling", () => {
      const fx: Fixture = structuredClone(f.issued);
      const bad = version(f.issued);
      const total = bad.document.commercials.summary.totals[0];
      if (!total) throw new Error("Missing fixture total");
      total.monthly += 1;
      const badRow = { ...bad, id: "pv_bad_finances" };
      fx.envelope.tables.proposalVersions.push(badRow);
      const { backend } = restore(fx);
      expect(store.persistence()).toMatchObject({ quarantined: 1, backupSaved: true });
      expect(store.table("proposalVersions")).toEqual([version(f.issued)]);
      expect(backend.read(QUARANTINE_KEY)).toContain("pv_bad_finances");
    });
    it("retains full pinned-source and relationship checks even with a matching historical hash", () => {
      const v = version(f.issued);
      const solution = { ...structuredClone(v.document.solution), solutionId: "wrong_solution" };
      const changed = { ...v, document: { ...v.document, solution } };
      const bad = { ...changed, contentHash: documentHash(changed.document, f.contract) };
      expect(versionHashMetadata(bad).contract).toBe(f.contract);
      expect(versionIntegrityProblems(bad).join()).toMatch(/embedded solution id/);
    });
  });

describe("Historical compatibility fail-closed boundaries", () => {
  it("all three histories coexist without rewriting any hashes, documents or decisions", async () => {
    const backend = memoryBackend();
    store.attach(backend);
    const current = await issuedProposal();
    const envelope = {
      tables: {
        proposalVersions: [version(originalIssued), version(strengthenedIssued), current.issued],
      },
    };
    backend.write(STORAGE_KEY, JSON.stringify(envelope));
    store.attach(backend);
    expect(store.persistence().quarantined).toBe(0);
    expect(store.table("proposalVersions")).toEqual(envelope.tables.proposalVersions);
    expect(store.table("proposalVersions").map((v) => versionHashMetadata(v).assurance)).toEqual([
      "historical-original",
      "historical-strengthened",
      "current-strengthened",
    ]);
  });
  it("rejects an unmarked record matching neither algorithm", () => {
    const v = { ...version(strengthenedIssued), contentHash: "fnv1a-invalid" };
    expect(versionHashMetadata(v).contract).toBeNull();
    expect(versionIntegrityProblems(v).join()).toMatch(
      /neither historical contract|either historical contract/,
    );
  });
  it("rejects ambiguous classification rather than assigning assurance", () => {
    // Force a collision at the canonical serialization boundary to exercise safe rejection.
    const mock = vi.spyOn(assessment, "canonical").mockReturnValue("same");
    try {
      const v = version(strengthenedIssued);
      const collision = { ...v, contentHash: documentHash(v.document) };
      expect(versionHashMetadata(collision)).toEqual({
        contract: null,
        assurance: "invalid",
        problem: "ambiguous historical content hash contract",
      });
      expect(versionIntegrityProblems(collision).join()).toMatch(/ambiguous/);
    } finally {
      mock.mockRestore();
    }
  });
  it("embedded assessment corruption in unmarked strengthened history is quarantined", () => {
    const fx = structuredClone(strengthenedIssued);
    const v = fx.envelope.tables.proposalVersions[0];
    const r = v?.document.solution.sourceAssessment.requirements[0];
    if (!r) throw new Error("Missing fixture requirement");
    r.statement = "Corrupted embedded assessment";
    restore(fx);
    expect(store.persistence().quarantined).toBe(1);
  });
  it("newly submitted unmarked strengthened content cannot acquire approval by classification", async () => {
    const r = await readyProposal();
    const v = await P.submitForReview(PRO, r.p.id);
    const { hashContract: _marker, ...unmarked } = v;
    store.replace("proposalVersions", [unmarked]);
    expect(versionIntegrityProblems(unmarked)).toEqual([]);
    await expect(
      P.approve(REVIEWER, r.p.id, v.id, { acknowledged: acknowledge(v) }),
    ).rejects.toThrow(/unmarked historical/);
    expect(store.table("proposalVersions")[0]?.review).toBeUndefined();
  });
  it("failed backup writes retain the exact original payload and prohibit writes/reset until recovery", () => {
    const values = new Map<string, string>();
    let fail = true;
    const backend = {
      kind: "memory" as const,
      read: (k: string) => values.get(k) ?? null,
      write: (k: string, val: string) => {
        if (k === QUARANTINE_KEY && fail) throw new Error("QuotaExceededError");
        values.set(k, val);
      },
    };
    const good = version(strengthenedIssued);
    const bad = { ...good, id: "bad", contentHash: "bad-hash" };
    const raw = JSON.stringify({ tables: { proposalVersions: [good, bad] } });
    values.set(STORAGE_KEY, raw);
    store.attach(backend);
    expect(store.persistence()).toMatchObject({
      protected: true,
      backupSaved: false,
      quarantined: 1,
    });
    expect(store.table("proposalVersions")).toEqual([good]);
    expect(() => store.replace("proposalVersions", [])).toThrow(/protected/);
    expect(() => store.reset()).toThrow(/protected/);
    store.log({
      organizationId: "org_aurumi",
      actorId: PRO.user.id,
      action: "test",
      resourceType: "proposal",
      summary: "audit",
      outcome: "allowed",
    });
    expect(values.get(STORAGE_KEY)).toBe(raw);
    fail = false;
    expect(store.retryRecovery().ok).toBe(true);
    const backup = values.get(QUARANTINE_KEY);
    if (!backup) throw new Error("Missing recovery copy");
    expect(JSON.parse(backup)[0].originalPayload).toBe(raw);
    expect(values.get(STORAGE_KEY)).toBe(raw);
    store.replace("proposalVersions", [good]);
    store.attach(backend);
    expect(store.persistence()).toMatchObject({ quarantined: 0, protected: false });
    expect(store.table("proposalVersions")).toEqual([good]);
  });
});

describe("Current explicitly strengthened records never fall back", () => {
  it("new explicit /2 records still create, approve and issue normally", async () => {
    const r = await issuedProposal();
    expect(r.issued.hashContract).toBe(HASH_CONTRACT);
    expect(versionIntegrityProblems(r.issued)).toEqual([]);
    expect(r.issued.review?.by).toBe(REVIEWER.user.id);
    expect(r.issued.issue?.issuedBy).toBe(MGR.user.id);
  });
  it("does not rescue an original historical hash with an explicit /2 marker", () => {
    const v = { ...version(originalIssued), hashContract: HASH_CONTRACT };
    expect(versionIntegrityProblems(v).join()).toMatch(/content hash/);
  });
  for (const marker of [LEGACY_HASH_CONTRACT, "proposal-content-hash/99", null, undefined, 2, {}])
    it(`fails closed for the present malformed/unsupported marker ${String(marker)}`, () => {
      const v = {
        ...version(strengthenedIssued),
        hashContract: marker,
      } as unknown as ProposalVersionRecord;
      expect(versionHashMetadata(v).contract).toBeNull();
      expect(versionIntegrityProblems(v).join()).toMatch(/unknown hash contract/);
    });
  for (const kind of ["solution", "assessment", "totals"] as const)
    it(`rejects corrupted current ${kind} without historical fallback`, async () => {
      const { issued } = await issuedProposal();
      const v = {
        ...structuredClone(issued),
        document: {
          ...structuredClone(issued.document),
          solution: {
            ...structuredClone(issued.document.solution),
            solutionId: kind === "solution" ? "wrong" : issued.document.solution.solutionId,
          },
        },
      };
      if (kind === "assessment") {
        const r = v.document.solution.sourceAssessment.requirements[0];
        if (!r) throw new Error("Missing requirement");
        r.statement = "Swapped";
      }
      if (kind === "totals") {
        const total = v.document.commercials.summary.totals[0];
        if (!total) throw new Error("Missing total");
        total.monthly += 1;
      }
      expect(versionIntegrityProblems(v).length).toBeGreaterThan(0);
    });
});
