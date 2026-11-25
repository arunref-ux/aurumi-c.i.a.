import { beforeEach, expect, it } from "vitest";
import { loadDemoProposals } from "@/data/demo-proposals";
import { proposalStudio as P } from "@/data/proposal-studio";
import { resetProposalTestState, ADMIN } from "./proposal-fixtures";

beforeEach(() => {
  // Issuance is a durable commit, so the fixture's in-memory backend stays attached.
  resetProposalTestState();
});

it("loads three reference proposals in issued, review and draft states", async () => {
  await loadDemoProposals();
  const rows = (await P.list(ADMIN)).filter((r) => !r.legacy);
  expect(rows.map((r) => r.proposal.status).sort()).toEqual(["draft", "in_review", "shared"]);
});

it("gives the issued sample proposal a printable frozen version", async () => {
  await loadDemoProposals();
  const issued = (await P.list(ADMIN))
    .filter((r) => !r.legacy)
    .find((r) => r.proposal.status === "shared");
  expect(issued).toBeTruthy();
  const v = await P.get(ADMIN, issued!.proposal.id);
  expect(v.versions.length).toBe(1);
  expect(v.preview).toBeTruthy();
  expect(v.readinessPercent).toBe(100);
});
