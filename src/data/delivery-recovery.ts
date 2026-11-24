/** Relationship restoration supplements structural parsing; original payload is backed up by the shared store. */
import { canonical } from "@/domain/assessment";
import {
  workspaceProblems,
  ProfileSchema,
  EngagementSchema,
  contentValue,
  lifecycleAuthorizationProblems,
  type ProfessionalProfile,
} from "@/domain/delivery";
import type { Tables } from "./store";
import type { QuarantineEntry } from "./persisted-schema";
export function sanitizeDeliveryRelationships(t: Tables): QuarantineEntry[] {
  const out: QuarantineEntry[] = [];
  const quarantine = (table: string, value: unknown, reason: string) =>
    out.push({ table, path: table, reason, value });
  const profiles: ProfessionalProfile[] = [];
  const seenUsers = new Set<string>(),
    seenIds = new Set<string>();
  for (const p of t.networkProfiles) {
    try {
      ProfileSchema.parse(p);
      const u = t.users.find((u) => u.id === p.userId);
      const legacy = t.professionals.find((r) => r.userId === p.userId);
      if (
        !u ||
        u.organizationId !== p.organizationId ||
        u.teamId !== p.teamId ||
        (legacy && legacy.id !== p.id) ||
        seenUsers.has(p.userId) ||
        seenIds.has(p.id)
      )
        throw Error("Duplicate or invalid professional identity");
      for (const a of p.affiliations)
        if (
          a.organizationId !== p.organizationId ||
          !t.affiliations.some(
            (r) => r.id === a.organization && r.organizationId === p.organizationId,
          ) ||
          (a.status === "approved" && !a.approval) ||
          (a.end && a.end < a.start)
        )
          throw Error("Invalid professional affiliation");
      for (const q of p.qualifications)
        if (
          q.professionalId !== p.id ||
          q.organizationId !== p.organizationId ||
          (q.status === "verified" &&
            (!q.verification || !q.evidenceReference || q.category === "self_declared")) ||
          (q.expiryDate && q.expiryDate < q.issueDate)
        )
          throw Error("Invalid qualification relationship");
      seenUsers.add(p.userId);
      seenIds.add(p.id);
      profiles.push(p);
    } catch (e) {
      quarantine("networkProfiles", p, e instanceof Error ? e.message : "Invalid profile");
    }
  }
  t.networkProfiles = profiles;
  const valid = t.deliveryWorkspaces.filter((w) => {
    try {
      const problems = workspaceProblems(w);
      if (problems.length) throw Error(problems.join("; "));
      const e = t.engagements.find((e) => e.id === w.engagementId);
      if (!e) throw Error("Missing engagement");
      EngagementSchema.parse(e);
      const authorizationProblems=lifecycleAuthorizationProblems(e.status,w);
      if(authorizationProblems.length) throw Error(authorizationProblems.join("; "));
      if (
        e.organizationId !== w.organizationId ||
        e.initiationId !== w.initiation.id ||
        e.proposalId !==
          (w.initiation.source.kind === "proposal" ? w.initiation.source.proposalId : "")
      )
        throw Error("Engagement initiation mismatch");
      if (
        (e.status === "completed") !== !!w.completion ||
        (e.status === "cancelled") !== !!w.cancellation
      )
        throw Error("Engagement completion or cancellation mismatch");
      const users = new Set(
        w.assignments.filter((a) => a.status === "active").map((a) => a.userId),
      );
      if (canonical([...users].sort()) !== canonical([...e.assignedUserIds].sort()))
        throw Error("Assignment access mirror mismatch");
      for (const a of w.assignments) {
        const p = profiles.find((p) => p.id === a.professionalId);
        if (
          !p ||
          p.userId !== a.userId ||
          p.organizationId !== w.organizationId ||
          !p.affiliations.some(
            (f) =>
              f.id === a.affiliation.id &&
              f.organization === a.affiliation.organization &&
              f.relationship === a.affiliation.relationship,
          ) ||
          a.qualificationIds.some((id) => !p.qualifications.some((q) => q.id === id)) ||
          (a.workstreamId && !w.workstreams.some((s) => s.id === a.workstreamId))
        )
          throw Error("Invalid assignment provenance");
      }
      if (w.initiation.source.kind === "follow_on") {
        const source = w.initiation.source;
        const previous = t.deliveryWorkspaces.find(
          (r) => r.engagementId === source.previousEngagementId,
        );
        if (
          !previous ||
          previous.organizationId !== w.organizationId ||
          previous.initiation.integrityValue !== w.initiation.source.previousInitiationValue
        )
          throw Error("Follow-on initiation mismatch");
      }
      return true;
    } catch (e) {
      quarantine(
        "deliveryWorkspaces",
        w,
        e instanceof Error ? e.message : "Invalid delivery workspace",
      );
      return false;
    }
  });
  t.deliveryWorkspaces = valid;
  t.engagements = t.engagements.filter((e) => {
    if (!e.deliverySchema) return true;
    if (valid.some((w) => w.engagementId === e.id)) return true;
    quarantine("engagements", e, "Engagement workspace unavailable");
    return false;
  });
  t.deliveryOperations = t.deliveryOperations.filter((o) => {
    try {
      const actor = t.users.find((u) => u.id === o.actorId);
      if (!actor || actor.organizationId !== o.organizationId)
        throw Error("Operation actor mismatch");
      if (o.kind === "create") {
        if (o.sourceValue !== contentValue(o.payload))
          throw Error("Creation operation source mismatch");
        if (o.state === "complete" && !valid.some((w) => w.engagementId === o.engagementId))
          throw Error("Completed creation missing engagement");
      } else {
        const w = valid.find((w) => w.engagementId === o.engagementId);
        if (!w || w.organizationId !== o.organizationId)
          throw Error("Handoff engagement unavailable");
        const ws =
          o.kind === "task"
            ? String(o.payload["workstreamId"] ?? "")
            : o.kind === "demand"
              ? (w.concerns.find((c) => c.id === o.targetId)?.workstreamId ?? "")
              : "";
        if (
          o.sourceValue !==
          contentValue({
            id: o.engagementId,
            kind: o.kind,
            targetId: o.targetId,
            payload: o.payload,
            ws,
          })
        )
          throw Error("Handoff operation source mismatch");
        if (
          o.reference &&
          o.reference !==
            `mock://${o.kind === "task" ? "tasks-calendar" : o.kind === "continuation" ? "shoptalk" : "demand-studio"}/${o.id}`
        )
          throw Error("Handoff operation reference mismatch");
        if (o.state !== "pending" && !o.reference) throw Error("Handoff reference missing");
        if (
          o.kind === "task" &&
          o.state === "complete" &&
          !w.tasks.some(
            (task) =>
              task.operationId === o.id && task.reference === o.reference && task.id === o.targetId,
          )
        )
          throw Error("Task operation relationship mismatch");
        if (
          o.kind === "continuation" &&
          o.state === "complete" &&
          !w.continuations.some(
            (r) => r.id === o.targetId && r.opportunityReference === o.reference,
          )
        )
          throw Error("Continuation operation relationship mismatch");
      }
      return true;
    } catch (e) {
      quarantine("deliveryOperations", o, e instanceof Error ? e.message : "Invalid operation");
      return false;
    }
  });
  return out;
}
