/** Dashboard metrics derived from records (§4) — never independent counters. */
import type { AcquisitionChannel, Assessment, Engagement, Proposal } from "./types";

export interface DashboardFilters {
  type: "all" | "tenant" | "partner";
  ownerId: "all" | string;
  channel: "all" | AcquisitionChannel;
  sinceDays: number | null;
  now: Date;
}

export function computeMetrics(a: Assessment[], p: Proposal[], e: Engagement[], f: DashboardFilters) {
  const since = f.sinceDays ? f.now.getTime() - f.sinceDays * 86400000 : -Infinity;
  const asm = a.filter((x) =>
    (f.type === "all" || x.type === f.type) &&
    (f.ownerId === "all" || x.ownerId === f.ownerId || x.assignedUserIds.includes(f.ownerId)) &&
    (f.channel === "all" || x.channel === f.channel) &&
    new Date(x.createdAt).getTime() >= since);
  const ids = new Set(asm.map((x) => x.id));
  const prp = p.filter((x) => ids.has(x.assessmentId));
  const prpIds = new Set(prp.map((x) => x.id));
  const eng = e.filter((x) => prpIds.has(x.proposalId));
  const count = (s: Proposal["status"][]) => prp.filter((x) => s.includes(x.status)).length;
  return {
    activeAssessments: asm.filter((x) => x.status === "draft" || x.status === "in_progress" || x.status === "under_review").length,
    proposalsInPreparation: count(["draft"]),
    proposalsAwaitingReview: count(["in_review"]),
    proposalsShared: count(["shared"]),
    proposalsAccepted: count(["accepted"]),
    proposalsGenerated: prp.length,
    activeEngagements: eng.filter((x) => x.status === "active").length,
    websiteOriginated: asm.filter((x) => x.channel === "website_self" || x.channel === "website_boss").length,
    funnel: (["tenant", "partner"] as const).map((t) => {
      const ta = asm.filter((x) => x.type === t);
      const tp = prp.filter((x) => ta.some((y) => y.id === x.assessmentId));
      return { type: t, assessments: ta.length, proposals: tp.length, accepted: tp.filter((x) => x.status === "accepted").length };
    }),
    assessments: asm,
    proposals: prp,
  };
}
