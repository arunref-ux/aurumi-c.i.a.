import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CollectionEditor } from "@/components/assessment/collection-editor";
import { assessmentStudio as S, studioConfig } from "@/data/assessment-studio";
import { repos, ValidationError } from "@/data/repositories";
import { seedUsers } from "@/data/seed";
import { memoryBackend, store } from "@/data/store";
import { AccessDeniedError } from "@/domain/permissions";
import { isValidIsoDate, validateFinding } from "@/domain/research";
import { useAssessmentList } from "@/lib/assessment-queries";
import { SessionProvider, useSession } from "@/lib/session";

const u = (id: string) => ({ user: seedUsers.find((x) => x.id === id)! });
const PRO = u("u_pro");
const MGR = u("u_manager");
const ADMIN = u("u_admin");
const PARTNER = u("u_partner_pro");

beforeEach(() => {
  studioConfig.latencyMs = 0;
  store.attach(null);
  store.reset();
});
afterEach(cleanup);

const evidence = (over: Record<string, unknown> = {}) => ({
  attribute: "api",
  statement: "Vendor documents a REST API",
  status: "research_finding" as const,
  sources: [
    {
      title: "Vendor docs",
      sourceType: "vendor_documentation" as const,
      retrievedAt: "2026-11-01T00:00:00Z",
    },
  ],
  researchedAt: "2026-11-01T00:00:00Z",
  confidence: { level: "medium" as const },
  verification: { state: "unverified" as const },
  links: [],
  ...over,
});

async function completeAssessment(ctx = PRO) {
  const a = await S.create(ctx, {
    type: "tenant",
    title: "Full",
    subjectName: "Acme (fictional)",
    channel: "direct",
  });
  await S.saveOverview(ctx, a.id, { purpose: "p", scope: "s", primaryContact: "c" });
  await S.saveProfile(ctx, a.id, {
    industry: "Retail",
    geography: "Pune",
    employees: "20",
    businessModel: "Retail",
  });
  await S.upsertChild(ctx, a.id, "systems", { name: "Ledger book", classification: "manual" });
  const proc = await S.upsertChild(ctx, a.id, "processes", { name: "Billing" });
  await S.upsertChild(ctx, a.id, "painPoints", { processId: proc, description: "Slow" });
  await S.upsertChild(ctx, a.id, "requirements", {
    category: "workflow",
    statement: "Faster billing",
    basis: "confirmed",
  });
  await S.upsertChild(ctx, a.id, "evidence", evidence());
  await S.saveFindings(ctx, a.id, {
    environment: "e",
    problems: "p",
    opportunities: "o",
    nextSteps: "n",
  });
  for (const q of ["q_goal", "q_pain", "q_systems", "q_decision"])
    await S.saveAnswer(ctx, a.id, { questionId: q, state: "answered", value: "yes" });
  return a;
}

describe("1. creation and defaults", () => {
  it("creates a draft with an empty workspace and the creator as owner", async () => {
    const a = await S.create(PRO, {
      type: "tenant",
      title: "New",
      subjectName: "Biz",
      channel: "direct",
    });
    expect(a.status).toBe("draft");
    expect(a.ownerId).toBe("u_pro");
    const v = await S.get(PRO, a.id);
    expect(v.workspace.systems).toEqual([]);
    expect(v.workspace.profile.businessName).toBe("Biz");
    expect(v.readiness).toBe("incomplete");
  });
  it("rejects missing names and unknown fields", async () => {
    await expect(
      S.create(PRO, { type: "tenant", title: "", subjectName: "B", channel: "direct" }),
    ).rejects.toThrow(ValidationError);
    await expect(
      S.create(PRO, {
        type: "tenant",
        title: "T",
        subjectName: "B",
        channel: "direct",
        status: "approved",
      } as never),
    ).rejects.toThrow(ValidationError);
  });
});

describe("2/13. draft persistence and refresh/resume", () => {
  it("saved drafts survive a reload with stable ids and timestamps, and seed never overwrites them", async () => {
    const backend = memoryBackend();
    store.attach(backend);
    const a = await S.create(PRO, {
      type: "tenant",
      title: "Persist me",
      subjectName: "Biz",
      channel: "direct",
    });
    const sys = await S.upsertChild(PRO, a.id, "systems", {
      name: "Excel",
      classification: "spreadsheet",
    });
    const before = await S.get(PRO, a.id);
    store.attach(backend); // simulated browser refresh
    const after = await S.get(PRO, a.id);
    expect(after.assessment).toEqual(before.assessment);
    expect(after.workspace.systems[0]!.id).toBe(sys);
    expect(after.workspace.systems[0]!.createdAt).toBe(before.workspace.systems[0]!.createdAt);
    await S.upsertChild(PRO, a.id, "systems", {
      id: sys,
      name: "Excel 365",
      classification: "spreadsheet",
    });
    store.attach(backend);
    const resumed = await S.get(PRO, a.id);
    expect(resumed.workspace.systems[0]!.name).toBe("Excel 365");
    expect(resumed.workspace.systems[0]!.createdAt).toBe(before.workspace.systems[0]!.createdAt);
  });
});

describe("3. tenant vs partner", () => {
  it("partner assessments get partner fields; tenants cannot save them", async () => {
    const p = await S.create(MGR, {
      type: "partner",
      title: "P",
      subjectName: "Vendor",
      channel: "partner_referral",
    });
    await S.savePartner(MGR, p.id, { partnerCategory: "Accounting software vendor" });
    const v = await S.get(MGR, p.id);
    expect(v.workspace.partner?.partnerCategory).toBe("Accounting software vendor");
    expect(v.workspace.partner?.relationshipStatus).toBe("prospective");
    expect(v.sections.some((s) => s.key === "partner")).toBe(true);
    const t = await S.create(MGR, {
      type: "tenant",
      title: "T",
      subjectName: "Biz",
      channel: "direct",
    });
    await expect(S.savePartner(MGR, t.id, { partnerCategory: "x" })).rejects.toThrow(
      ValidationError,
    );
    expect((await S.get(MGR, t.id)).sections.some((s) => s.key === "partner")).toBe(false);
  });
});

describe("4/5. inventory and connector compatibility", () => {
  it("accepts arbitrary custom/manual/unknown systems with compatibility unknown by default", async () => {
    const a = await S.create(PRO, {
      type: "tenant",
      title: "Inv",
      subjectName: "Biz",
      channel: "direct",
    });
    for (const classification of ["custom", "manual", "legacy", "unknown"] as const)
      await S.upsertChild(PRO, a.id, "systems", {
        name: `Thing ${classification}`,
        classification,
      });
    const v = await S.get(PRO, a.id);
    expect(v.workspace.systems).toHaveLength(4);
    expect(v.workspace.systems.every((s) => s.compatibility.status === "unknown")).toBe(true);
  });
  it("refuses supported/beta/planned without verified evidence, and downgrades when evidence is unverified", async () => {
    const a = await S.create(PRO, {
      type: "tenant",
      title: "Inv",
      subjectName: "Biz",
      channel: "direct",
    });
    await expect(
      S.upsertChild(PRO, a.id, "systems", {
        name: "X",
        classification: "commercial",
        compatibility: { status: "supported" },
      }),
    ).rejects.toThrow(ValidationError);
    const unver = await S.upsertChild(PRO, a.id, "evidence", evidence());
    await expect(
      S.upsertChild(PRO, a.id, "systems", {
        name: "X",
        classification: "commercial",
        compatibility: { status: "beta", evidenceIds: [unver] },
      }),
    ).rejects.toThrow(/verified/);
    const sys = await S.upsertChild(PRO, a.id, "systems", {
      name: "X",
      classification: "commercial",
    });
    const ver = await S.upsertChild(
      PRO,
      a.id,
      "evidence",
      evidence({
        status: "confirmed_fact",
        applicability: "connector_supported",
        links: [{ kind: "system", id: sys }],
        verification: { state: "verified", method: "Catalog check" },
      }),
    );
    await S.upsertChild(PRO, a.id, "systems", {
      id: sys,
      name: "X",
      classification: "commercial",
      compatibility: { status: "supported", evidenceIds: [ver] },
    });
    await S.upsertChild(PRO, a.id, "evidence", { ...evidence(), id: ver });
    const v = await S.get(PRO, a.id);
    expect(v.workspace.systems.find((s) => s.id === sys)!.compatibility.status).toBe("unknown");
  });
});

describe("6. questions and answers", () => {
  it("persists answers with who answered, supports N/A, custom questions and verification", async () => {
    const a = await S.create(PRO, {
      type: "tenant",
      title: "Q",
      subjectName: "Biz",
      channel: "direct",
    });
    await S.saveAnswer(PRO, a.id, { questionId: "q_goal", state: "answered", value: "Grow" });
    await S.saveAnswer(PRO, a.id, { questionId: "q_reporting", state: "not_applicable" });
    const cq = await S.upsertChild(PRO, a.id, "customQuestions", {
      prompt: "Any franchises?",
      section: "profile",
      required: true,
    });
    await S.saveAnswer(PRO, a.id, { questionId: cq, state: "answered", value: "No" });
    await S.verifyAnswer(PRO, a.id, cq);
    const v = await S.get(PRO, a.id);
    expect(v.workspace.answers.find((x) => x.questionId === "q_goal")).toMatchObject({
      state: "answered",
      value: "Grow",
      answeredBy: "u_pro",
    });
    expect(v.workspace.answers.find((x) => x.questionId === "q_reporting")!.state).toBe(
      "not_applicable",
    );
    expect(v.workspace.answers.find((x) => x.questionId === cq)!.verifiedBy).toBe("u_pro");
    await expect(
      S.saveAnswer(PRO, a.id, { questionId: "q_nope", state: "answered", value: "x" }),
    ).rejects.toThrow(ValidationError);
    await expect(
      S.saveAnswer(PRO, a.id, { questionId: "q_goal", state: "answered", value: " " }),
    ).rejects.toThrow(ValidationError);
  });
});

describe("7. evidence validation and provenance", () => {
  it("records the verifier from the session, not the caller, and rejects bad provenance", async () => {
    const a = await S.create(PRO, {
      type: "tenant",
      title: "E",
      subjectName: "Biz",
      channel: "direct",
    });
    await expect(
      S.upsertChild(
        PRO,
        a.id,
        "evidence",
        evidence({ verification: { state: "verified", method: "x", verifiedBy: "u_admin" } }),
      ),
    ).rejects.toThrow(ValidationError);
    const id = await S.upsertChild(
      PRO,
      a.id,
      "evidence",
      evidence({
        status: "confirmed_fact",
        verification: { state: "verified", method: "Called vendor" },
      }),
    );
    const e = (await S.get(PRO, a.id)).workspace.evidence.find((x) => x.id === id)!;
    expect(e.verification).toMatchObject({
      state: "verified",
      verifiedBy: "u_pro",
      method: "Called vendor",
    });
    await expect(
      S.upsertChild(PRO, a.id, "evidence", evidence({ status: "ai_inference" })),
    ).rejects.toThrow(/generated/);
    await expect(
      S.upsertChild(PRO, a.id, "evidence", evidence({ status: "confirmed_fact" })),
    ).rejects.toThrow(/verified/);
    await expect(
      S.upsertChild(
        PRO,
        a.id,
        "evidence",
        evidence({ links: [{ kind: "system", id: "sys_missing" }] }),
      ),
    ).rejects.toThrow(ValidationError);
    const assumption = await S.upsertChild(
      PRO,
      a.id,
      "evidence",
      evidence({ status: "professional_assumption", sources: [] }),
    );
    expect(assumption).toBeTruthy();
  });
});

describe("8. research calendar dates", () => {
  it.each([
    ["2026-02-30T10:00:00Z", false],
    ["2025-02-29", false],
    ["2024-02-29T00:00:00Z", true],
    ["2000-02-29", true],
    ["1900-02-29", false],
    ["2026-04-31", false],
    ["2026-13-01", false],
    ["2026-12-31T24:00:00Z", false],
    ["2026-12-31T23:60:00Z", false],
    ["2026-12-31T23:59:59.5+05:30", true],
    ["2026-06-01T10:00:00+25:00", false],
  ])("%s → %s", (v, ok) => {
    expect(isValidIsoDate(v)).toBe(ok);
  });
  it("validateFinding rejects an impossible research date", () => {
    expect(
      validateFinding({ ...evidence(), researchedAt: "2026-02-30T10:00:00Z" } as never),
    ).toContain("researchedAt must be an ISO date");
  });
});

describe("9/10. inherited authorization and partner isolation", () => {
  it("child writes inherit the parent's access", async () => {
    // asm_c belongs to the partnerships team; an advisory professional has no access.
    await expect(
      S.upsertChild(PRO, "asm_c", "systems", { name: "X", classification: "manual" }),
    ).rejects.toThrow(AccessDeniedError);
    await expect(S.get(PRO, "asm_c")).rejects.toThrow(AccessDeniedError);
    await expect(
      S.saveAnswer(PRO, "asm_c", { questionId: "q_p_api", state: "not_applicable" }),
    ).rejects.toThrow(AccessDeniedError);
    // The reviewer can read but not write.
    await expect(S.get(u("u_reviewer"), "asm_b")).resolves.toBeTruthy();
    await expect(S.saveProfile(u("u_reviewer"), "asm_b", { industry: "x" })).rejects.toThrow(
      AccessDeniedError,
    );
  });
  it("partner professionals see only their own or assigned assessments", async () => {
    expect(await S.list(PARTNER)).toEqual([]);
    const mine = await S.create(PARTNER, {
      type: "partner",
      title: "Mine",
      subjectName: "V",
      channel: "partner_referral",
    });
    expect((await S.list(PARTNER)).map((r) => r.assessment.id)).toEqual([mine.id]);
    await expect(S.get(PARTNER, "asm_c")).rejects.toThrow(AccessDeniedError);
    await expect(S.assign(PARTNER, mine.id, { assignedUserIds: ["u_pm"] })).rejects.toThrow(
      AccessDeniedError,
    );
  });
});

describe("11/12. protected approval and immutable snapshots", () => {
  it("generic updates cannot set review statuses", () => {
    expect(() => repos.assessments.update(MGR, "asm_d", { status: "approved" })).toThrow(
      ValidationError,
    );
    expect(() => repos.assessments.update(MGR, "asm_d", { status: "under_review" })).toThrow(
      ValidationError,
    );
    expect(() => repos.assessments.update(PRO, "asm_b", { status: "draft" })).not.toThrow();
  });
  it("only an authorized non-owner approves; snapshots stay unchanged after revision", async () => {
    const a = await completeAssessment(PRO);
    await expect(S.approve(MGR, a.id)).rejects.toThrow(ValidationError); // not in review yet
    await S.submitForReview(PRO, a.id);
    await expect(S.saveProfile(PRO, a.id, { industry: "x" })).rejects.toThrow(ValidationError); // locked in review
    await expect(S.approve(PRO, a.id)).rejects.toThrow(AccessDeniedError); // no approve permission
    await expect(S.approve(u("u_reviewer"), a.id)).rejects.toThrow(AccessDeniedError);
    await expect(S.approve(u("u_pm"), a.id)).rejects.toThrow(AccessDeniedError); // other team
    const snap = await S.approve(MGR, a.id, "Looks good");
    expect(snap).toMatchObject({
      schema: "aurumi.cia.assessment-handoff/2",
      version: 1,
      approval: { approvedBy: "u_manager" },
    });
    expect((await S.get(PRO, a.id)).readiness).toBe("approved");

    await S.reopen(PRO, a.id, "Client added a site");
    await S.saveProfile(PRO, a.id, { industry: "Changed" });
    const v = await S.get(PRO, a.id);
    expect(v.workspace.profile.industry).toBe("Changed");
    expect(v.snapshots[0]!.profile.industry).toBe("Retail");
    expect(Object.isFrozen(snap.profile)).toBe(true);
    expect(() => {
      (snap.profile as { industry: string }).industry = "hack";
    }).toThrow();
  });
  it("managers cannot approve their own assessments; returning requires a comment", async () => {
    const a = await completeAssessment(MGR);
    await S.submitForReview(MGR, a.id);
    await expect(S.approve(MGR, a.id)).rejects.toThrow(AccessDeniedError);
    await expect(S.returnForRevision(ADMIN, a.id, "")).rejects.toThrow(ValidationError);
    await S.returnForRevision(ADMIN, a.id, "Add evidence");
    expect((await S.get(MGR, a.id)).assessment.status).toBe("returned");
  });
  it("incomplete assessments cannot be approved", async () => {
    const a = await S.create(PRO, {
      type: "tenant",
      title: "Thin",
      subjectName: "Biz",
      channel: "direct",
    });
    await S.submitForReview(PRO, a.id);
    await expect(S.approve(MGR, a.id)).rejects.toThrow(/incomplete/);
  });
});

describe("14. accessibility", () => {
  it("collection editor fields are labelled and keyboard reachable", async () => {
    render(
      <CollectionEditor
        items={[]}
        fields={[{ key: "name", label: "Process", kind: "text", required: true }]}
        blank={() => ({ name: "" })}
        summary={() => null}
        onSave={async () => {}}
        onRemove={async () => {}}
        canEdit
        emptyTitle="Empty"
        addLabel="Add process"
        itemLabel={() => "x"}
      />,
    );
    act(() => screen.getByRole("button", { name: "+ Add process" }).click());
    expect(screen.getByLabelText("Process *")).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});

describe("15. identity change during a pending request", () => {
  it("never shows the previous identity's list to the next identity", async () => {
    studioConfig.latencyMs = 30;
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>
        <SessionProvider>{children}</SessionProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => ({ list: useAssessmentList(), s: useSession() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.list.data?.length).toBeGreaterThan(0));
    act(() => result.current.s.setUserId("u_partner_pro"));
    // Immediately after the switch, the manager's rows must not be exposed.
    expect(result.current.list.data).toBeUndefined();
    await waitFor(() => expect(result.current.list.data).toEqual([]));
  });
});
