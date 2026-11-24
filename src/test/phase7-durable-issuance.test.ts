/** P7-P1-01: proposal issuance is one acknowledged durable commitment. Fictional data. */
import { writeFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { proposalStudio as P } from "@/data/proposal-studio";
import { STORAGE_KEY, memoryBackend, store, type PersistenceBackend } from "@/data/store";
import { readyProposal, resetProposalTestState, REVIEWER } from "./proposal-fixtures";
import { MGR, PRO } from "./solution-fixtures";

beforeEach(resetProposalTestState);

/** Memory backend whose writes / read-backs can be made to fail on demand. */
function flaky() {
  const inner = memoryBackend();
  const ctl = { failWrite: false, lieOnRead: false };
  const b: PersistenceBackend = {
    kind: "memory",
    read: (k) => (ctl.lieOnRead && k === STORAGE_KEY ? "{}" : inner.read(k)),
    write: (k, v) => {
      if (ctl.failWrite && k === STORAGE_KEY) throw new Error("quota exceeded");
      inner.write(k, v);
    },
  };
  return { b, inner, ctl };
}
async function approvedProposal(b: PersistenceBackend) {
  store.attach(b);
  const r = await readyProposal();
  const ver = await P.submitForReview(PRO, r.p.id);
  const ack = [
    ...ver.document.deliverables.filter((d) => d.info.needsQualification).map((d) => d.id),
    ...ver.document.risks.filter((x) => x.resolution === "accepted").map((x) => x.id),
  ];
  await P.approve(REVIEWER, r.p.id, ver.id, { acknowledged: ack });
  return { pid: r.p.id, vid: ver.id };
}
const saved = (b: PersistenceBackend) => JSON.parse(b.read(STORAGE_KEY)!);
const savedState = (b: PersistenceBackend, pid: string, vid: string) => {
  const s = saved(b);
  return {
    status: s.tables.proposals.find((p: { id: string }) => p.id === pid).status as string,
    issue: s.tables.proposalVersions.find((v: { id: string }) => v.id === vid).issue ?? null,
    issueAudits: s.audit.filter(
      (a: { action: string; resourceId: string }) =>
        a.action === "proposal.issue" && a.resourceId === pid,
    ).length as number,
    issuedComments: s.tables.proposalWorkspaces
      .find((w: { proposalId: string }) => w.proposalId === pid)
      .comments.filter((c: { kind: string }) => c.kind === "issued").length as number,
  };
};
const memState = async (pid: string, vid: string) => {
  const v = await P.get(MGR, pid);
  return {
    status: v.proposal.status,
    issue: v.versions.find((x) => x.id === vid)!.issue ?? null,
    issueAudits: store
      .audit()
      .filter(
        (a) => a.action === "proposal.issue" && a.resourceId === pid && a.outcome === "allowed",
      ).length,
    issuedComments: v.workspace.comments.filter((c) => c.kind === "issued").length,
  };
};
const approvedNothingIssued = {
  status: "approved",
  issue: null,
  issueAudits: 0,
  issuedComments: 0,
};

describe("P7-P1-01 durable proposal issuance", () => {
  it("A: complete write failure → controlled failure, consistent memory and storage, safe retry", async () => {
    const { b, ctl } = flaky();
    const { pid, vid } = await approvedProposal(b);
    ctl.failWrite = true;
    await expect(P.issue(MGR, pid, vid)).rejects.toThrow(/Unable to save/);
    expect(await memState(pid, vid)).toEqual(approvedNothingIssued);
    expect(savedState(b, pid, vid)).toEqual(approvedNothingIssued);
    store.attach(b); // reload
    expect(await memState(pid, vid)).toEqual(approvedNothingIssued);
    ctl.failWrite = false;
    const issued = await P.issue(MGR, pid, vid);
    expect(issued.issue?.issuedBy).toBe(MGR.user.id);
    const ok = { status: "shared", issueAudits: 1, issuedComments: 1 };
    expect(savedState(b, pid, vid)).toMatchObject(ok);
    store.attach(b);
    expect(await memState(pid, vid)).toMatchObject(ok);
    expect((await memState(pid, vid)).issue).toEqual(issued.issue);
  });

  it("B: the version/parent write boundary is gone — one payload carries both, or neither", async () => {
    const { b, inner, ctl } = flaky();
    const { pid, vid } = await approvedProposal(b);
    if (process.env["PHASE7_CAPTURE"] === "1") {
      writeFileSync("/tmp/phase7-approved-envelope.json", inner.read(STORAGE_KEY) ?? "");
      writeFileSync("/tmp/phase7-approved-ids.json", JSON.stringify({ proposalId: pid }));
    }
    const writes: string[] = [];
    const orig = inner.write;
    inner.write = (k, v) => {
      if (k === STORAGE_KEY) writes.push(v);
      orig(k, v);
    };
    await P.issue(MGR, pid, vid);
    // Exactly one storage write during the commit; it already holds issue + shared + audit.
    expect(writes).toHaveLength(1);
    const only = JSON.parse(writes[0]!);
    expect(only.tables.proposals.find((p: { id: string }) => p.id === pid).status).toBe("shared");
    expect(
      only.tables.proposalVersions.find((v: { id: string }) => v.id === vid).issue,
    ).toBeTruthy();
    expect(ctl.failWrite).toBe(false);
  });

  it("B2: a legacy partially saved issuance is detected, left untouched and never silently completed", async () => {
    const { b } = flaky();
    const { pid, vid } = await approvedProposal(b);
    const s = saved(b);
    const ver = s.tables.proposalVersions.find((v: { id: string }) => v.id === vid);
    ver.issue = {
      issuedAt: "2026-01-01T00:00:00.000Z",
      issuedBy: MGR.user.id,
      effectiveAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-02-01T00:00:00.000Z",
    };
    b.write(STORAGE_KEY, JSON.stringify(s));
    store.attach(b);
    const before = saved(b).tables;
    await expect(P.issue(MGR, pid, vid)).rejects.toThrow(/only partially saved/);
    // Records are untouched (only the denial audit entry is appended).
    expect(saved(b).tables).toEqual(before);
    expect(savedState(b, pid, vid).issueAudits).toBe(0);
    expect((await memState(pid, vid)).status).toBe("approved");
  });

  it("C: concurrent and repeated requests create exactly one commitment", async () => {
    const { b } = flaky();
    const { pid, vid } = await approvedProposal(b);
    const results = await Promise.allSettled([P.issue(MGR, pid, vid), P.issue(MGR, pid, vid)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(P.issue(MGR, pid, vid)).rejects.toThrow();
    expect(savedState(b, pid, vid)).toMatchObject({
      status: "shared",
      issueAudits: 1,
      issuedComments: 1,
    });
  });

  it("D: author cannot issue, and a retry after failure keeps permission checks", async () => {
    const { b, ctl } = flaky();
    const { pid, vid } = await approvedProposal(b);
    ctl.failWrite = true;
    await expect(P.issue(MGR, pid, vid)).rejects.toThrow(/Unable to save/);
    ctl.failWrite = false;
    await expect(P.issue(PRO, pid, vid)).rejects.toThrow();
    expect(savedState(b, pid, vid)).toEqual(approvedNothingIssued);
  });

  it("E: unacknowledged read-back → protected, no success; reload reconciles to the stored copy", async () => {
    const { b, ctl } = flaky();
    const { pid, vid } = await approvedProposal(b);
    ctl.lieOnRead = true;
    await expect(P.issue(MGR, pid, vid)).rejects.toThrow(/did not acknowledge/);
    expect(store.persistence().protected).toBe(true);
    expect((await memState(pid, vid)).status).toBe("approved");
    ctl.lieOnRead = false;
    expect(store.retryRecovery().ok).toBe(true);
    // The write actually landed: reconciliation reads it rather than issuing again.
    expect(await memState(pid, vid)).toMatchObject({ status: "shared", issueAudits: 1 });
    await expect(P.issue(MGR, pid, vid)).rejects.toThrow();
    expect(savedState(b, pid, vid).issueAudits).toBe(1);
  });
});
