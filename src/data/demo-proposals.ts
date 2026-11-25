/**
 * Reference sample proposals (fictional). Built only through the real
 * Assessment / Solution / Proposal services, so every record passes the normal
 * validation, independent review and snapshot integrity rules.
 */
import { loadDemoSolutions } from "@/data/demo-solutions";
import { seedUsers } from "@/data/seed";
import { proposalConfig, proposalStudio as P } from "@/data/proposal-studio";
import type { ContentKey } from "@/domain/proposal";
import type { ProposalTrack } from "@/domain/types";

const u = (id: string) => ({ user: seedUsers.find((x) => x.id === id)! });
const PRO = u("u_pro");
const MGR = u("u_manager");
const REVIEWER = u("u_reviewer");

type Stage = "issued" | "in_review" | "draft";

const SECTIONS: Partial<Record<ContentKey, string>> = {
  executive_summary:
    "Kesar Textiles chases overdue invoices by hand every week. This proposal sets up a daily ageing view inside their existing accounting workspace, so finance sees what is due without rebuilding a spreadsheet.",
  challenges:
    "Collections are worked from memory and a weekly spreadsheet. Nothing tells finance which invoices are overdue, who was last contacted, or how the backlog is moving.",
  proposed_solution:
    "A receivables app in the existing accounting workspace, connected to the current ledger, with a daily ageing list and follow-up prompts.",
  commercials:
    "Prices reference the illustrative Pricing Studio price book at the version shown. Taxes appear only where configured. Not a signed contract.",
  assumptions:
    "The customer keeps their current accounting edition, confirms the connector applies to it, and names one finance lead for follow-up.",
  next_steps:
    "• Confirm scope and the open connector question\n• Agree responsibilities and the indicative timeline\n• Approve internally, then issue to the customer",
};

/** Fills the parts readiness checks, using only facts already in the snapshot. */
async function fill(id: string) {
  const v = await P.get(PRO, id);
  for (const d of v.workspace.deliverables) {
    const info = v.deliverables[d.id];
    await P.upsertChild(PRO, id, "deliverables", {
      id: d.id,
      recommendationId: d.recommendationId,
      description: d.description,
      inclusion: d.inclusion,
      acceptanceCriterion:
        d.acceptanceCriterion.trim() || "Finance sees the daily ageing list in the workspace",
      responsibleParty: d.responsibleParty,
      qualification:
        info?.needsQualification && !d.qualification.trim()
          ? "Depends on validating the connector for this accounting edition"
          : d.qualification,
    });
  }
  for (const [key, body] of Object.entries(SECTIONS) as [ContentKey, string][]) {
    if (v.workspace.sections.some((s) => s.key === key))
      await P.saveSection(PRO, id, key, { body });
  }
  for (const r of v.workspace.risks)
    await P.upsertChild(PRO, id, "risks", {
      id: r.id,
      category: r.category,
      description: r.description,
      severity: r.severity,
      resolution: "accepted",
      qualification: "Validated during the foundation phase before delivery starts",
    });
}

/** Adds the priced lines a commercial proposal needs. */
async function price(id: string) {
  for (const line of [
    {
      category: "aurumi_subscription",
      priceBookItemId: "pb_receivables",
      description: "Receivables app",
    },
    {
      category: "implementation",
      priceBookItemId: "pb_impl_standard",
      description: "Standard implementation package",
    },
  ] as const)
    await P.upsertChild(PRO, id, "lines", {
      category: line.category,
      priceBookItemId: line.priceBookItemId,
      quantity: 1,
      description: line.description,
    });
}

async function build(track: ProposalTrack, title: string, stage: Stage) {
  const snapshots = (await P.candidates(PRO)).flatMap((c) =>
    c.snapshots.filter((s) => s.compatible),
  );
  const snap = snapshots[0];
  if (!snap) throw new Error("No approved solution snapshot is available to sample from");
  const p = await P.create(PRO, { solutionSnapshotId: snap.id, track, title });
  await fill(p.id);
  if (track === "tenant_commercial") await price(p.id);
  if (stage === "draft") return p.id;
  const ver = await P.submitForReview(PRO, p.id);
  if (stage === "in_review") return p.id;
  const view = await P.get(PRO, p.id);
  const acknowledged = [
    ...view.workspace.deliverables
      .filter((d) => view.deliverables[d.id]?.needsQualification)
      .map((d) => d.id),
    ...view.workspace.risks.filter((r) => r.resolution === "accepted").map((r) => r.id),
  ];
  await P.approve(REVIEWER, p.id, ver.id, { acknowledged });
  await P.issue(MGR, p.id, ver.id);
  return p.id;
}

/**
 * Creates three reference proposals (issued, in review, draft) from an approved
 * solution snapshot, loading the sample solutions first when none exist.
 */
export async function loadDemoProposals() {
  const prev = proposalConfig.latencyMs;
  proposalConfig.latencyMs = 0;
  try {
    const candidates = await P.candidates(PRO);
    if (!candidates.some((c) => c.snapshots.some((s) => s.compatible))) await loadDemoSolutions();
    await build("tenant_commercial", "Collections uplift — Kesar Textiles", "issued");
    await build(
      "tenant_solution",
      "Collections uplift — Kesar Textiles (solution only)",
      "in_review",
    );
    await build("tenant_commercial", "Receivables follow-up — Kesar Textiles", "draft");
  } finally {
    proposalConfig.latencyMs = prev;
  }
}
