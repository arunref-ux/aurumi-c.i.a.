import { beforeEach, describe, expect, it } from "vitest";
import { adminActions, auditLog, directory, repos, ValidationError } from "@/data/repositories";
import { seedUsers } from "@/data/seed";
import { store } from "@/data/store";
import { AccessDeniedError } from "@/domain/permissions";
import { evidenceToFinding, findingToEvidence, validateFinding } from "@/domain/research";
import type { ResearchFinding, User } from "@/domain/types";
import { research } from "@/integrations/adapters/mock";
import { mockControls } from "@/integrations/adapters/mock";

const u = (id: string) => ({ user: seedUsers.find((x) => x.id === id)! });
const publicVisitor: User = {
  id: "u_public",
  organizationId: "org_aurumi",
  name: "Visitor",
  email: "v@example.com",
  teamId: "team_advisory",
  roles: ["public_visitor"],
  affiliation: "aurumi",
};
const otherOrgAdmin: User = {
  id: "u_other",
  organizationId: "org_other",
  name: "Other",
  email: "o@example.com",
  teamId: "team_other",
  roles: ["cia_admin"],
  affiliation: "aurumi",
};
const raw = (id: string) => store.table("proposals").find((p) => p.id === id)!;
const rawAsm = (id: string) => store.table("assessments").find((p) => p.id === id)!;

beforeEach(() => store.reset());

describe("F01 protected writes", () => {
  it("allows an ordinary permitted edit and stamps update metadata internally", () => {
    const r = repos.assessments.update(u("u_pro"), "asm_a", { title: "Renamed" });
    expect(r.title).toBe("Renamed");
    expect(r.updatedBy).toBe("u_pro");
    expect(r.createdBy).toBe("u_pro");
    expect(rawAsm("asm_a").title).toBe("Renamed");
  });
  it("rejects moving a record to another organization", () => {
    expect(() =>
      repos.assessments.update(u("u_pro"), "asm_a", { organizationId: "org_x" } as never),
    ).toThrow(ValidationError);
    expect(rawAsm("asm_a").organizationId).toBe("org_aurumi");
  });
  it("rejects forged creation metadata", () => {
    expect(() =>
      repos.assessments.update(u("u_pro"), "asm_a", {
        createdBy: "u_admin",
        createdAt: "2000-01-01",
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      repos.assessments.create(u("u_pro"), {
        type: "tenant",
        title: "x",
        subjectName: "y",
        channel: "direct",
        id: "asm_forged",
      } as never),
    ).toThrow(ValidationError);
    expect(rawAsm("asm_a").createdBy).toBe("u_pro");
    expect(store.table("assessments")).toHaveLength(5);
  });
  it("rejects assignment by a professional without assign authority", () => {
    expect(() =>
      repos.assessments.update(u("u_pro"), "asm_a", { assignedUserIds: ["u_manager"] }),
    ).toThrow(AccessDeniedError);
    expect(() => repos.assessments.update(u("u_pro"), "asm_a", { ownerId: "u_manager" })).toThrow(
      AccessDeniedError,
    );
    expect(rawAsm("asm_a").assignedUserIds).toEqual([]);
  });
  it("lets a manager assign within their team but not to another team", () => {
    expect(
      repos.assessments.update(u("u_manager"), "asm_d", { assignedUserIds: ["u_pro"] })
        .assignedUserIds,
    ).toEqual(["u_pro"]);
    expect(() =>
      repos.assessments.update(u("u_manager"), "asm_d", { assignedUserIds: ["u_pm"] }),
    ).toThrow(AccessDeniedError);
    expect(() =>
      repos.assessments.update(u("u_manager"), "asm_d", { teamId: "team_partners" }),
    ).toThrow(AccessDeniedError);
    expect(rawAsm("asm_d").assignedUserIds).toEqual(["u_pro"]);
  });
  it("rejects approve/share transitions through generic update", () => {
    expect(() => repos.proposals.update(u("u_pro"), "prp_b", { status: "approved" })).toThrow(
      AccessDeniedError,
    );
    expect(() => repos.proposals.update(u("u_pro"), "prp_b", { status: "shared" })).toThrow(
      AccessDeniedError,
    );
    expect(() => repos.proposals.update(u("u_admin"), "prp_b", { status: "approved" })).toThrow(
      ValidationError,
    );
    expect(raw("prp_b").status).toBe("draft");
    expect(repos.proposals.update(u("u_pro"), "prp_b", { status: "in_review" }).status).toBe(
      "in_review",
    );
  });
  it("rejects out-of-scope updates and invalid parents without changing data", () => {
    expect(() => repos.proposals.update(u("u_pro"), "prp_c", { title: "hijack" })).toThrow(
      AccessDeniedError,
    );
    expect(raw("prp_c").title).toBe("Joint pilot & revenue-share proposal");
    expect(() =>
      repos.proposals.create(u("u_pro"), {
        assessmentId: "asm_missing",
        title: "x",
        track: "tenant_solution",
      }),
    ).toThrow(ValidationError);
    expect(() =>
      repos.proposals.create(u("u_pro"), {
        assessmentId: "asm_c",
        title: "x",
        track: "tenant_solution",
      }),
    ).toThrow(ValidationError);
    expect(store.table("proposals")).toHaveLength(4);
    expect(
      repos.proposals.create(u("u_pro"), {
        assessmentId: "asm_a",
        title: "ok",
        track: "tenant_solution",
      }).ownerId,
    ).toBe("u_pro");
  });
});

describe("F02 state isolation", () => {
  it("returned records cannot alter stored data, including nested arrays", () => {
    const got = repos.assessments.get(u("u_manager"), "asm_b");
    got.title = "x";
    got.assignedUserIds.push("u_admin");
    const listed = repos.assessments.list(u("u_manager"))[0]!;
    listed.assignedUserIds.push("u_admin");
    expect(rawAsm("asm_b").title).not.toBe("x");
    expect(rawAsm("asm_b").assignedUserIds).toEqual(["u_pro"]);
  });
  it("mutating create/update results or inputs after a write changes nothing", () => {
    const input = {
      type: "tenant" as const,
      title: "New",
      subjectName: "S",
      channel: "direct" as const,
    };
    const created = repos.assessments.create(u("u_pro"), input);
    input.title = "mutated";
    created.assignedUserIds.push("u_admin");
    const stored = rawAsm(created.id);
    expect(stored.title).toBe("New");
    expect(stored.assignedUserIds).toEqual([]);
    const patch = { assignedUserIds: ["u_pro"] };
    const updated = repos.assessments.update(u("u_manager"), "asm_d", patch);
    patch.assignedUserIds.push("u_admin");
    updated.assignedUserIds.push("u_admin");
    expect(rawAsm("asm_d").assignedUserIds).toEqual(["u_pro"]);
  });
  it("authorized writes still notify and audit", () => {
    let n = 0;
    const off = store.subscribe(() => n++);
    repos.assessments.update(u("u_pro"), "asm_a", { title: "T" });
    off();
    expect(n).toBeGreaterThan(0);
    expect(store.audit()[0]).toMatchObject({
      action: "assessment.update",
      outcome: "allowed",
      organizationId: "org_aurumi",
      teamId: "team_advisory",
    });
  });
  it("a read-only reviewer cannot alter a proposal through a returned reference", () => {
    const p = repos.proposals.get(u("u_reviewer"), "prp_c");
    p.status = "approved";
    p.assignedUserIds.push("u_reviewer");
    expect(raw("prp_c").status).toBe("in_review");
    expect(raw("prp_c").assignedUserIds).toEqual([]);
  });
});

describe("F03 scoped reads and admin actions", () => {
  it("team managers cannot see other teams' audit details", () => {
    const ev = auditLog.list(u("u_manager"));
    expect(ev.some((e) => e.resourceId === "prp_c")).toBe(false);
    expect(auditLog.list(u("u_admin")).some((e) => e.resourceId === "prp_c")).toBe(true);
  });
  it("partner professionals cannot see unassigned proposal details", () => {
    expect(repos.proposals.list(u("u_partner_pro"))).toEqual([]);
    expect(() => repos.proposals.get(u("u_partner_pro"), "prp_c")).toThrow(AccessDeniedError);
  });
  it("public visitors cannot read directories, audit or run settings actions", async () => {
    const ctx = { user: publicVisitor };
    expect(directory.professionals(ctx)).toEqual([]);
    expect(directory.teams(ctx)).toEqual([]);
    expect(auditLog.list(ctx)).toEqual([]);
    await expect(adminActions.run(ctx, "x", () => 1)).rejects.toThrow(AccessDeniedError);
  });
  it("non-admins cannot change mock controls; admins can", async () => {
    await expect(
      adminActions.run(u("u_manager"), "fail crm", () => mockControls.failing.add("crm")),
    ).rejects.toThrow(AccessDeniedError);
    expect(mockControls.failing.has("crm")).toBe(false);
    await adminActions.run(u("u_admin"), "noop", () => undefined);
    expect(store.audit()[0]).toMatchObject({ action: "settings.manage", outcome: "allowed" });
  });
  it("separate organizations stay isolated", () => {
    const ctx = { user: otherOrgAdmin };
    expect(repos.assessments.list(ctx)).toEqual([]);
    expect(directory.professionals(ctx)).toEqual([]);
    expect(auditLog.list(ctx)).toEqual([]);
    expect(() => repos.assessments.update(ctx, "asm_a", { title: "x" })).toThrow(AccessDeniedError);
  });
});

describe("F04 research provenance", () => {
  const at = "2026-11-20T10:00:00.000Z";
  const base: ResearchFinding = {
    attribute: "vendor",
    statement: "Made by Acme",
    status: "research_finding",
    researchedAt: at,
    sources: [
      {
        title: "Acme site",
        url: "https://acme.example",
        sourceType: "vendor_site",
        retrievedAt: at,
        observedAt: "2026-11-01T00:00:00.000Z",
      },
    ],
    confidence: { level: "unknown", reason: "single source" },
    verification: { state: "unverified" },
  };

  it("round-trips without losing provenance and keeps record time separate", () => {
    const ev = findingToEvidence(base, {
      id: "ev_1",
      organizationId: "org_aurumi",
      subjectId: "sys_1",
      actorId: "u_pro",
      now: "2026-11-23T00:00:00.000Z",
    });
    expect(ev.createdAt).not.toBe(ev.researchedAt);
    expect(evidenceToFinding(JSON.parse(JSON.stringify(ev)))).toEqual(base);
  });
  it("keeps AI inference distinct from verified fact", () => {
    expect(
      validateFinding({
        ...base,
        status: "ai_inference",
        generatedBy: "m",
        verification: { state: "verified", verifiedBy: "u", verifiedAt: at, method: "call" },
      }),
    ).not.toEqual([]);
    expect(validateFinding({ ...base, status: "confirmed_fact" })).toContain(
      "a confirmed fact must be verified",
    );
    expect(
      validateFinding({
        ...base,
        status: "confirmed_fact",
        verification: {
          state: "verified",
          verifiedBy: "u_pro",
          verifiedAt: at,
          method: "vendor call",
        },
      }),
    ).toEqual([]);
    expect(validateFinding({ ...base, status: "ai_inference" })).toContain(
      "an AI inference must name what generated it",
    );
  });
  it("requires a reason for unknown confidence", () => {
    expect(validateFinding({ ...base, confidence: { level: "unknown", reason: "" } })).toContain(
      "unknown confidence needs a reason",
    );
  });
  it("research mock returns valid findings with explicit unknowns", async () => {
    mockControls.latencyMs = 0;
    const r = await research.lookupSoftware("eSSL", "https://example.com");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const f of r.data.findings) expect(validateFinding(f)).toEqual([]);
    expect(r.data.findings.some((f) => f.status === "ai_inference")).toBe(true);
    expect(r.data.findings.some((f) => f.confidence.level === "unknown")).toBe(true);
    expect(r.data.findings.every((f) => f.verification.state === "unverified")).toBe(true);
  });
});
