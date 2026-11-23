/** Shared Proposal Studio test fixtures (fictional data). */
import { proposalConfig, proposalStudio as P } from "@/data/proposal-studio";
import { solutionStudio as S } from "@/data/solution-studio";
import type { ProposalTrack } from "@/domain/types";
import { MGR, PRO, readySolution, resetSolutionTestState, u } from "./solution-fixtures";

export const REVIEWER = u("u_reviewer");
export const ADMIN = u("u_admin");
export function resetProposalTestState() {
  resetSolutionTestState();
  proposalConfig.latencyMs = 0;
}
/** An approved solution hand-off (schema /2). */
export async function approvedSolution() {
  const r = await readySolution();
  await S.submitForReview(PRO, r.sol.id);
  const handoff = await S.approve(MGR, r.sol.id, "ok");
  return { ...r, handoff };
}
/** A proposal that passes every readiness check for its track. */
export async function readyProposal(track: ProposalTrack = "tenant_commercial") {
  const base = await approvedSolution();
  const p = await P.create(PRO, { solutionSnapshotId: base.handoff.id, track, title: "Collections proposal" });
  let v = await P.get(PRO, p.id);
  const d = v.workspace.deliverables[0]!;
  await P.upsertChild(PRO, p.id, "deliverables", {
    id: d.id,
    recommendationId: d.recommendationId,
    description: d.description,
    inclusion: "included",
    acceptanceCriterion: "Daily ageing list is available to finance",
    responsibleParty: "aurumi",
    qualification: "Depends on validating the Tally connector for this edition",
  });
  for (const key of ["executive_summary", "next_steps", "commercials", "assumptions", "collaboration_model", "integration_ai"] as const)
    if (v.workspace.sections.some((s) => s.key === key))
      await P.saveSection(PRO, p.id, key, { body: `${key} written by the professional` });
  for (const r of v.workspace.risks)
    await P.upsertChild(PRO, p.id, "risks", {
      id: r.id,
      category: r.category,
      description: r.description,
      severity: r.severity,
      resolution: "accepted",
      qualification: "Validated during foundation phase",
    });
  let lineId: string | undefined;
  if (track === "tenant_commercial") {
    lineId = await P.upsertChild(PRO, p.id, "lines", {
      category: "aurumi_subscription",
      priceBookItemId: "pb_receivables",
      quantity: 1,
      description: "Receivables app",
    });
    await P.upsertChild(PRO, p.id, "lines", {
      category: "implementation",
      priceBookItemId: "pb_impl_standard",
      quantity: 1,
      description: "Implementation",
    });
  }
  v = await P.get(PRO, p.id);
  return { ...base, p, view: v, lineId };
}
/** Submit → approve (acknowledging every qualification) → issue. */
export async function issuedProposal(track: ProposalTrack = "tenant_commercial") {
  const r = await readyProposal(track);
  const ver = await P.submitForReview(PRO, r.p.id);
  const ack = [
    ...ver.document.deliverables.filter((d) => d.info.needsQualification).map((d) => d.id),
    ...ver.document.risks.filter((x) => x.resolution === "accepted").map((x) => x.id),
  ];
  await P.approve(REVIEWER, r.p.id, ver.id, { acknowledged: ack });
  const issued = await P.issue(MGR, r.p.id, ver.id);
  return { ...r, ver, ack, issued };
}
