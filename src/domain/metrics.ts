/** Dashboard metrics derived from records (§4) — never independent counters. */
import type { AcquisitionChannel, Assessment, Engagement, Proposal } from "./types";
import type { DeliveryWorkspace, ProfessionalProfile } from "./delivery";

export interface DashboardFilters {
  type: "all" | "tenant" | "partner";
  ownerId: "all" | string;
  channel: "all" | AcquisitionChannel;
  sinceDays: number | null;
  now: Date;
}
export function computeDeliveryMetrics(
  rows: readonly {
    engagement: Engagement;
    workspace: Pick<
      DeliveryWorkspace,
      "milestones" | "deliverables" | "concerns" | "assignments" | "reviews"
    >;
  }[],
  profiles: readonly ProfessionalProfile[] = [],
  now = new Date(),
) {
  const day = now.toISOString().slice(0, 10),
    month = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  return {
    active: rows.filter((v) => v.engagement.status === "active").length,
    onHold: rows.filter((v) => v.engagement.status === "on_hold").length,
    overdueMilestones: rows
      .flatMap((v) => v.workspace.milestones)
      .filter((m) => m.due < day && !["completed", "cancelled"].includes(m.status)),
    awaitingDeliverables: rows
      .flatMap((v) => v.workspace.deliverables)
      .filter((d) => ["submitted", "under_review"].includes(d.status)),
    openIssues: rows
      .flatMap((v) => v.workspace.concerns)
      .filter((r) => r.kind === "issue" && r.status === "open"),
    materialIssues: rows
      .flatMap((v) => v.workspace.concerns)
      .filter((r) => r.kind === "issue" && r.impact === "high" && r.status === "open"),
    upcomingMilestones: rows
      .flatMap((v) => v.workspace.milestones)
      .filter(
        (m) => m.due >= day && m.due <= month && !["completed", "cancelled"].includes(m.status),
      ),
    unassigned: rows.filter(
      (v) =>
        !v.workspace.assignments.some((a) => a.status === "active" && a.responsibility === "lead"),
    ).length,
    activeProfessionals: profiles.filter((p) => p.status === "active").length,
    pendingProfessionals: profiles.filter((p) => p.status === "pending_review").length,
    suspendedProfessionals: profiles.filter((p) => ["suspended", "inactive"].includes(p.status))
      .length,
    qualificationQueue: profiles
      .flatMap((p) => p.qualifications)
      .filter((q) => q.status === "pending"),
    expiringQualifications: profiles
      .flatMap((p) => p.qualifications)
      .filter((q) => q.expiryDate && q.expiryDate >= day && q.expiryDate <= month),
    estimatedHours: rows
      .flatMap((v) => v.workspace.assignments)
      .filter((a) => a.status === "active")
      .reduce((sum, a) => sum + a.allocationHours, 0),
  };
}

export function computeMetrics(
  a: Assessment[],
  p: Proposal[],
  e: Engagement[],
  f: DashboardFilters,
) {
  const since = f.sinceDays ? f.now.getTime() - f.sinceDays * 86400000 : -Infinity;
  const asm = a.filter(
    (x) =>
      (f.type === "all" || x.type === f.type) &&
      (f.ownerId === "all" || x.ownerId === f.ownerId || x.assignedUserIds.includes(f.ownerId)) &&
      (f.channel === "all" || x.channel === f.channel) &&
      new Date(x.createdAt).getTime() >= since,
  );
  const ids = new Set(asm.map((x) => x.id));
  const prp = p.filter((x) => ids.has(x.assessmentId));
  const prpIds = new Set(prp.map((x) => x.id));
  const eng = e.filter((x) => prpIds.has(x.proposalId));
  const count = (s: Proposal["status"][]) => prp.filter((x) => s.includes(x.status)).length;
  return {
    activeAssessments: asm.filter(
      (x) => x.status === "draft" || x.status === "in_progress" || x.status === "under_review",
    ).length,
    proposalsInPreparation: count(["draft"]),
    proposalsAwaitingReview: count(["in_review"]),
    proposalsShared: count(["shared"]),
    proposalsAccepted: count(["accepted"]),
    proposalsGenerated: prp.length,
    activeEngagements: eng.filter((x) => x.status === "active").length,
    websiteOriginated: asm.filter(
      (x) => x.channel === "website_self" || x.channel === "website_boss",
    ).length,
    funnel: (["tenant", "partner"] as const).map((t) => {
      const ta = asm.filter((x) => x.type === t);
      const tp = prp.filter((x) => ta.some((y) => y.id === x.assessmentId));
      return {
        type: t,
        assessments: ta.length,
        proposals: tp.length,
        accepted: tp.filter((x) => x.status === "accepted").length,
      };
    }),
    assessments: asm,
    proposals: prp,
  };
}
