import { beforeEach, describe, expect, it } from "vitest";
import { networkService as N, assignmentEligible } from "@/data/network";
import { engagementService as E } from "@/data/delivery";
import { store } from "@/data/store";
import { currentAffiliation, validQualification } from "@/domain/delivery";
import { reset, M, A, P, PARTNER, HOTEL, STREAM, ctx, first } from "./delivery-fixtures";
beforeEach(reset);
describe("Phase 6 identity and professional governance", () => {
  it("activation requires verified unexpired authorization for every granted service", async () => {
    const p = await N.get(A, "pro_ananya");
    store.replace(
      "networkProfiles",
      store.table("networkProfiles").map((row) =>
        row.id === p.id
          ? {
              ...row,
              status: "pending_review",
              qualifications: row.qualifications.map((q) => ({
                ...q,
                status: "pending",
                verification: null,
              })),
            }
          : row,
      ),
    );
    await expect(
      N.status(A, p.id, "active", "mock://approval", "Activate without verified credential", [
        "implementation",
      ]),
    ).rejects.toThrow("service authorization");
    expect((await N.get(A, p.id)).status).toBe("pending_review");
  });
  it("reuses existing user identity and rejects a duplicate professional", async () => {
    const p = await N.create(A, {
      userId: "u_admin",
      title: "Network administrator",
      country: "India",
      timezone: "Asia/Kolkata",
    });
    expect(p.userId).toBe("u_admin");
    expect(store.table("users")).toHaveLength(6);
    await expect(
      N.create(A, {
        userId: "u_admin",
        title: "Duplicate",
        country: "India",
        timezone: "Asia/Kolkata",
      }),
    ).rejects.toThrow("already");
  });
  it("reuses the existing legacy professional ID", async () => {
    store.replace(
      "networkProfiles",
      store.table("networkProfiles").filter((p) => p.id !== "pro_ananya"),
    );
    const p = await N.create(P, {
      userId: "u_pro",
      title: "Independent professional",
      country: "India",
      timezone: "Asia/Kolkata",
    });
    expect(p.id).toBe("pro_ananya");
  });
  it("self profile input cannot reassign identity or grant services", async () => {
    await expect(
      N.update(P, "pro_ananya", { userId: "u_admin" } as unknown as Parameters<typeof N.update>[2]),
    ).rejects.toThrow();
    expect((await N.get(P, "pro_ananya")).userId).toBe("u_pro");
  });
  it("returns cloned professional records", async () => {
    const p = await N.get(P, "pro_ananya");
    p.title = "Mutated copy";
    expect((await N.get(P, "pro_ananya")).title).not.toBe("Mutated copy");
  });
  it("denies unscoped and cross-organization identity calls", async () => {
    await expect(N.get(P, "pro_rohan")).rejects.toThrow();
    await expect(N.list({ user: { ...A.user, organizationId: "org_other" } })).rejects.toThrow();
  });
  it("rejects unknown partner affiliation", async () => {
    await expect(
      N.addAffiliation(A, "pro_ananya", {
        organization: "missing",
        relationship: "independent",
        start: "2026-11-01",
        end: null,
      }),
    ).rejects.toThrow("Unknown");
  });
  it("requires explicit affiliation approval and rejects overlaps", async () => {
    let p = await N.addAffiliation(A, "pro_ananya", {
      organization: "aff_northledger",
      relationship: "reseller",
      start: "2026-12-01",
      end: null,
    });
    const a = p.affiliations.at(-1);
    if (!a) throw Error("Missing affiliation");
    expect(a.status).toBe("pending");
    await expect(
      N.approveAffiliation(A, p.id, a.id, "mock://approval", "Approved transfer"),
    ).rejects.toThrow("overlapping");
    await N.endAffiliation(
      A,
      p.id,
      first(p.affiliations).id,
      "2026-11-30",
      "mock://end",
      "Employment ends before transfer",
    );
    p = await N.approveAffiliation(A, p.id, a.id, "mock://approval", "Approved future transfer");
    expect(p.affiliations.at(-1)?.status).toBe("approved");
    expect(currentAffiliation(p)?.relationship).toBe("independent");
  });
  it("does not promote self-declared expertise to verified credential", async () => {
    const p = await N.addQualification(P, "pro_ananya", {
      name: "Self-declared Tally knowledge",
      issuer: "Professional",
      category: "self_declared",
      issueDate: "2026-11-01",
      expiryDate: null,
      evidenceReference: "",
      services: ["integration_advisory"],
      notes: "Self declaration only",
    });
    const q = p.qualifications.at(-1);
    if (!q) throw Error("No qualification");
    expect(q.status).toBe("self_declared");
    expect(validQualification(q, "integration_advisory")).toBe(false);
    await expect(
      N.verifyQualification(A, p.id, q.id, "verified", "mock://evidence", "Review"),
    ).rejects.toThrow("Self-declared");
  });
  it("requires independent qualification review and evidence", async () => {
    let p = await N.addQualification(P, "pro_ananya", {
      name: "External integration certificate",
      issuer: "Fictional issuer",
      category: "external",
      issueDate: "2026-01-01",
      expiryDate: "2027-01-01",
      evidenceReference: "mock://file-hub/certificate",
      services: ["integration_advisory"],
      notes: "",
    });
    const q = p.qualifications.at(-1);
    if (!q) throw Error("No qualification");
    await expect(
      N.verifyQualification(P, p.id, q.id, "verified", "mock://verify", "Verify own"),
    ).rejects.toThrow();
    p = await N.verifyQualification(
      A,
      p.id,
      q.id,
      "verified",
      "mock://verify",
      "Independent review",
    );
    expect(p.qualifications.at(-1)?.status).toBe("verified");
  });
  it("rejects future, expired and unsupported service credentials", async () => {
    const p = await N.get(M, "pro_rohan"),
      q = first(p.qualifications);
    expect(validQualification({ ...q, expiryDate: "2026-01-01" }, "implementation")).toBe(false);
    expect(validQualification({ ...q, issueDate: "2027-01-01" }, "implementation")).toBe(false);
    expect(validQualification({ ...q, services: ["custom"] }, "implementation")).toBe(false);
  });
  it("cannot activate without an approved affiliation and service authorization", async () => {
    const p = await N.create(A, {
      userId: "u_reviewer",
      title: "Reviewer",
      country: "India",
      timezone: "Asia/Kolkata",
    });
    await expect(
      N.status(A, p.id, "active", "mock://approval", "Activate", ["implementation"]),
    ).rejects.toThrow("affiliation");
  });
  it("professional cannot self-activate or suspend someone else", async () => {
    await expect(
      N.status(P, "pro_ananya", "active", "mock://approval", "Self activate"),
    ).rejects.toThrow();
    await expect(
      N.status(P, "pro_rohan", "suspended", "mock://approval", "Suspend other"),
    ).rejects.toThrow();
  });
  it("suspension restricts ongoing assigned professional delivery", async () => {
    await N.status(A, "pro_ananya", "suspended", "mock://approval", "Access suspended");
    await expect(E.get(P, HOTEL)).rejects.toThrow();
    expect(await N.get(P, "pro_ananya")).toHaveProperty("status", "suspended");
  });
  it("ended affiliation restricts ongoing delivery and future assignments", async () => {
    const p = await N.get(A, "pro_ananya");
    await N.endAffiliation(
      A,
      p.id,
      first(p.affiliations).id,
      "2026-11-01",
      "mock://approval",
      "Engagement affiliation ended",
    );
    await expect(E.get(P, HOTEL)).rejects.toThrow();
    expect(() =>
      assignmentEligible(first(store.table("networkProfiles")), "implementation", []),
    ).toThrow();
  });
  it("expiry or revocation prevents assignment eligibility", async () => {
    const p = await N.get(A, "pro_ananya"),
      q = first(p.qualifications);
    expect(() =>
      assignmentEligible(
        { ...p, qualifications: [{ ...q, status: "revoked" }] },
        "integration_advisory",
        [],
      ),
    ).toThrow("authorization");
    expect(() =>
      assignmentEligible(
        { ...p, qualifications: [{ ...q, expiryDate: "2026-11-01" }] },
        "integration_advisory",
        [],
      ),
    ).toThrow("authorization");
  });
  it("required qualification IDs must actually be applicable and verified", async () => {
    const p = await N.get(A, "pro_ananya");
    expect(() => assignmentEligible(p, "integration_advisory", ["missing"])).toThrow(
      "Required qualification",
    );
  });
  it("reseller sees only explicitly assigned customer delivery", async () => {
    expect((await E.list(PARTNER)).map((v) => v.engagement.id)).toEqual(["delivery_reseller"]);
    await expect(E.get(PARTNER, HOTEL)).rejects.toThrow();
  });
  it("independent specialist cannot read unrelated scope or commercial records", async () => {
    const v = await E.get(P, HOTEL);
    expect(v.commercialVisible).toBe(false);
    expect(v.initiation).toBeNull();
    expect(v.scopes).toEqual([]);
    expect(v.workspace.assignments.map((a) => a.userId)).toEqual(["u_pro"]);
    expect(v.overview.customerReference).toBe("");
    await expect(
      E.workstream(P, HOTEL, {
        name: "Other customer access",
        description: "",
        ownerProfessionalId: "pro_ananya",
        start: "2026-11-24",
        end: "2026-12-01",
        dependencies: [],
      }),
    ).rejects.toThrow();
  });
  it("removal revokes read access and preserves assignment history", async () => {
    const v = await E.get(M, HOTEL),
      a = v.workspace.assignments.find((a) => a.userId === "u_pro");
    if (!a) throw Error("No assignment");
    await E.removeAssignment(M, HOTEL, a.id, "mock://remove", "Assignment ended");
    await expect(E.get(P, HOTEL)).rejects.toThrow();
    const after = await E.get(M, HOTEL);
    expect(after.workspace.assignments.find((x) => x.id === a.id)?.status).toBe("ended");
    expect(after.engagement.assignedUserIds).not.toContain("u_pro");
  });
  it("reassignment preserves the prior accountable lead", async () => {
    await E.assign(M, HOTEL, {
      professionalId: "pro_ananya",
      responsibility: "lead",
      workstreamId: "",
      service: "implementation",
      qualificationIds: [],
      start: "2026-11-24",
      end: null,
      allocationHours: 6,
    });
    const v = await E.get(M, HOTEL);
    expect(
      v.workspace.assignments
        .filter((a) => a.status === "active" && a.responsibility === "lead")
        .map((a) => a.professionalId),
    ).toEqual(["pro_ananya"]);
    expect(
      v.workspace.assignments.some((a) => a.professionalId === "pro_rohan" && a.status === "ended"),
    ).toBe(true);
  });
  it("estimates workload from scoped assignments without payroll or ratings", async () => {
    const w = await N.workload(P, "pro_ananya");
    expect(w.estimated).toBe(true);
    expect(w.estimatedHours).toBe(8);
    expect(w.assignments.every((a) => a.userId === "u_pro")).toBe(true);
  });
  it("expertise management is restricted to authorized administrators", async () => {
    await expect(N.addExpertise(P, "Self issued credential")).rejects.toThrow();
    const e = await N.addExpertise(A, "Independent technical review");
    expect(e.label).toBe("Independent technical review");
  });
  it("invalid absence dates are rejected without altering saved profile", async () => {
    const prior = await N.get(P, "pro_ananya");
    await expect(
      N.update(P, prior.id, { absenceStart: "2026-11-30", absenceEnd: "2026-11-24" }),
    ).rejects.toThrow();
    expect(await N.get(P, prior.id)).toEqual(prior);
  });
});
