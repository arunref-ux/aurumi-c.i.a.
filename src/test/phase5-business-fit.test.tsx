import { beforeEach, describe, expect, it, vi } from "vitest";
import { businessFitPublic as P } from "@/data/business-fit-public";
import { businessFitInternal as I } from "@/data/business-fit-internal";
import { FIT_QUESTIONNAIRE as Q, FIT_RULES as R, FIT_SCENARIOS } from "@/data/business-fit-seed";
import { studioConfig, assessmentStudio as A } from "@/data/assessment-studio";
import { store, memoryBackend, STORAGE_KEY, QUARANTINE_KEY } from "@/data/store";
import { seedUsers } from "@/data/seed";
import {
  businessFitLead,
  businessFitLeadConfig,
  publicFitCatalog,
} from "@/integrations/adapters/business-fit";
import {
  evaluate,
  visibleQuestions,
  validateResponses,
  validateDefinition,
  DIMENSIONS,
  type BusinessFitResponse,
  type SessionHandle,
} from "@/domain/business-fit";
import { NO_SESSION_USER } from "@/lib/session";
import type { Ctx } from "@/data/repositories";
const actor = (id: string): Ctx => {
  const user = seedUsers.find((u) => u.id === id);
  if (!user) throw new Error("Fixture identity missing");
  return { user };
};
const ADMIN = actor("u_admin"),
  MGR = actor("u_manager"),
  PRO = actor("u_pro"),
  PARTNER = actor("u_partner_pro"),
  REVIEWER = actor("u_reviewer"),
  PUBLIC = { user: NO_SESSION_USER };
const contact = {
  name: "Fictional Respondent",
  businessName: "Demo Co",
  email: "owner@demo.example",
  phone: "",
  country: "India",
  preferredContact: "email",
  comments: "",
  contactConsent: true,
  marketingConsent: false,
};
const record = {
  id: "report-fixture",
  organizationId: "org_public",
  createdAt: "2026-11-24T00:00:00.000Z",
  createdBy: "anonymous",
  updatedAt: "2026-11-24T00:00:00.000Z",
  updatedBy: "anonymous",
};
function scenario(index = 0) {
  const value = FIT_SCENARIOS[index];
  if (!value) throw new Error("Scenario missing");
  return structuredClone(value.responses);
}
function ready(index = 0) {
  const h = P.begin();
  P.save(h, scenario(index), 4);
  P.generate(h);
  return h;
}
async function submitted(index = 0) {
  const h = ready(index);
  await P.consult(h, contact);
  const row = I.list(MGR)[0];
  if (!row) throw new Error("Intake missing");
  return { h, id: row.intake.id };
}
beforeEach(() => {
  vi.restoreAllMocks();
  store.attach(memoryBackend());
  store.reset();
  studioConfig.latencyMs = 0;
  businessFitLeadConfig.failNext = false;
});
describe("Phase 5 public journey", () => {
  it("anonymous user begins with isolated nonsequential credentials", () => {
    const a = P.begin(),
      b = P.begin();
    expect(a.id).not.toBe(b.id);
    expect(a.token.length).toBeGreaterThanOrEqual(32);
    expect(a.token).not.toBe(b.token);
    expect(P.get(a).step).toBe(0);
  });
  it("optional business name and unanswered friction remain optional", () => {
    const h = P.begin();
    const response = scenario(4);
    delete response["businessName"];
    P.save(h, response, 4);
    expect(P.generate(h).schema).toBe("aurumi.cia.business-fit-report/1");
  });
  it("contact-free report generation creates no intake, contact or lead", () => {
    const spy = vi.spyOn(businessFitLead, "createOrAssociate");
    const h = ready();
    expect(P.get(h).report).toBeDefined();
    expect(I.list(MGR)).toEqual([]);
    expect(store.table("fitConsultations")).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
  it("conditional hospitality question appears only for hospitality", () => {
    expect(visibleQuestions(Q, { industry: "Hospitality" }, 0).map((q) => q.id)).toContain(
      "subcategory",
    );
    expect(visibleQuestions(Q, { industry: "Retail" }, 0).map((q) => q.id)).not.toContain(
      "subcategory",
    );
  });
  it("conditional other role appears only for Other", () => {
    expect(visibleQuestions(Q, { respondentRole: "Other" }, 0).map((q) => q.id)).toContain(
      "roleOther",
    );
    expect(visibleQuestions(Q, { respondentRole: "Owner" }, 0).map((q) => q.id)).not.toContain(
      "roleOther",
    );
  });
  it("previous and next preserve responses", () => {
    const h = P.begin();
    P.save(h, scenario(), 0);
    P.move(h, "next");
    expect(P.get(h).step).toBe(1);
    P.move(h, "previous");
    expect(P.get(h).responses).toEqual(scenario());
  });
  it("next refuses unanswered required fields", () => {
    const h = P.begin();
    expect(() => P.move(h, "next")).toThrow("Please answer");
    expect(P.get(h).step).toBe(0);
  });
  it("report refuses incomplete required business context", () => {
    const h = P.begin();
    P.save(h, { priorities: ["Improve reporting"] }, 4);
    expect(() => P.generate(h)).toThrow("Please answer");
  });
  it("at most three primary priorities are enforced in service", () => {
    expect(() =>
      validateResponses(Q, {
        priorities: [
          "Improve reporting",
          "Connect existing software",
          "Strengthen accountability",
          "Reduce repetitive manual work",
        ],
      }),
    ).toThrow("at most 3");
  });
  it("duplicate priorities are rejected", () => {
    expect(() =>
      validateResponses(Q, { priorities: ["Improve reporting", "Improve reporting"] }),
    ).toThrow();
  });
  it("secondary priorities are not restricted to three", () => {
    expect(
      validateResponses(Q, {
        secondaryPriorities: [
          "Improve reporting",
          "Connect existing software",
          "Strengthen accountability",
          "Reduce repetitive manual work",
        ],
      })["secondaryPriorities"],
    ).toHaveLength(4);
  });
  it("unknown question and invalid option are rejected", () => {
    expect(() => P.save(P.begin(), { secret: "credential" }, 0)).toThrow("Unknown question");
    expect(() => validateResponses(Q, { industry: "invented" })).toThrow("Invalid answer");
  });
  it("systems allow multiple entries per function and unknown free text", () => {
    const h = P.begin();
    const systems = [
      { function: "Accounting and finance", kind: "commercial", name: "Tally" },
      { function: "Accounting and finance", kind: "custom", name: "Custom ledger" },
    ];
    P.save(h, { systems }, 1);
    expect(P.get(h).responses["systems"]).toEqual(systems);
  });
  it("restart clears only the intended session", () => {
    const a = ready(),
      b = ready();
    P.clear(a);
    expect(() => P.get(a)).toThrow("unavailable");
    expect(P.get(b).report).toBeDefined();
  });
  it("bearer for one session cannot retrieve another report", () => {
    const a = ready(),
      b = ready();
    expect(() => P.get({ id: b.id, token: a.token })).toThrow("unavailable");
  });
  it("public responses cannot supply an internal organization or assignment", () => {
    expect(() =>
      P.save(P.begin(), { organizationId: "org_aurumi", assignedUserIds: ["u_admin"] }, 0),
    ).toThrow("Unknown question");
  });
  it("report generation is idempotent and later editing is blocked", () => {
    const h = ready();
    expect(P.generate(h)).toEqual(P.get(h).report);
    expect(() => P.save(h, scenario(1), 4)).toThrow("frozen");
  });
  it("returned public session cannot mutate the store", () => {
    const h = P.begin(),
      value = P.get(h);
    expect(() => {
      value.responses["industry"] = "Retail";
    }).toThrow();
    expect(P.get(h).responses).toEqual({});
  });
});
describe("Phase 5 explainable evaluation", () => {
  it("identical pinned inputs produce deterministic report content", () => {
    expect(evaluate(scenario(), Q, R, publicFitCatalog(), record)).toEqual(
      evaluate(scenario(), Q, R, publicFitCatalog(), record),
    );
  });
  for (let i = 0; i < 5; i++)
    it(`scenario ${i + 1} has a valid qualitative six-dimension report`, () => {
      const r = evaluate(scenario(i), Q, R, publicFitCatalog(), record);
      expect(r.dimensions.map((d) => d.dimension)).toEqual([...DIMENSIONS]);
      expect(r.responses).toEqual(scenario(i));
    });
  it("hotel reporting and mature professional services receive different opportunities", () => {
    const hotel = evaluate(scenario(0), Q, R, publicFitCatalog(), record),
      professional = evaluate(scenario(2), Q, R, publicFitCatalog(), record);
    expect(hotel.opportunities.map((o) => o.id)).toContain("reports-Always");
    expect(professional.opportunities.map((o) => o.id)).toContain("ai-priority");
    expect(professional.opportunities.map((o) => o.id)).not.toContain("reports-Always");
  });
  it("missing and Not sure answers are never negative evidence", () => {
    const r = evaluate(scenario(4), Q, R, publicFitCatalog(), record);
    expect(r.dimensions.every((d) => d.level === "Insufficient information")).toBe(true);
    expect(r.opportunities).toEqual([]);
  });
  it("unknown custom ERP is not upgraded to an available connector", () => {
    const r = evaluate(scenario(3), Q, R, publicFitCatalog(), record);
    expect(
      r.opportunities.some(
        (o) => o.capability?.kind === "connector" && o.capability.claim === "available",
      ),
    ).toBe(false);
    expect(r.dimensions.find((d) => d.dimension === "Systems interoperability")?.level).toBe(
      "Insufficient information",
    );
  });
  it("recommendations retain valid response and rule references", () => {
    const r = evaluate(scenario(), Q, R, publicFitCatalog(), record);
    for (const o of r.opportunities) {
      expect(o.responseRefs.length).toBeGreaterThan(0);
      expect(o.ruleRefs.length).toBeGreaterThan(0);
      expect(o.ruleRefs.every((ref) => R.rules.some((rule) => rule.id === ref))).toBe(true);
      expect(o.responseRefs.every((ref) => r.responses[ref] !== undefined)).toBe(true);
    }
  });
  it("public projection excludes unpublished roadmap, internal notes and dependencies", () => {
    const cat = publicFitCatalog();
    expect(cat.some((c) => c.id === "roadmap_custom_bridge")).toBe(false);
    expect(
      cat.every((c) => !("dependencies" in c) && !("limitations" in c) && !("provider" in c)),
    ).toBe(true);
  });
  it("unsupported catalog functionality remains unsupported", () => {
    const c = publicFitCatalog().find((c) => c.id === "conn_pms_generic");
    expect(c?.claim).toBe("unsupported");
  });
  it("mature businesses can have conversational opportunities without replacement", () => {
    const r = evaluate(scenario(2), Q, R, publicFitCatalog(), record);
    expect(r.dimensions.find((d) => d.dimension === "Information accessibility")?.level).toBe(
      "Advanced",
    );
    expect(r.opportunities.find((o) => o.id === "ai-priority")?.category).toBe(
      "AI-assisted information access",
    );
  });
  it("rules referencing missing questions cannot evaluate", () => {
    const rules = structuredClone(R);
    const first = rules.rules[0];
    if (!first) throw new Error("Rule missing");
    first.conditions[0] = { questionId: "missing", operator: "answered" };
    expect(() => evaluate(scenario(), Q, rules, publicFitCatalog(), record)).toThrow(
      "Unknown question",
    );
  });
  it("unsupported condition operators and executable expressions are rejected", () => {
    const draft = I.draftRules(ADMIN, R.id, Q.id);
    expect(() =>
      I.editRules(ADMIN, draft.id, {
        name: "bad",
        rules: [{ ...R.rules[0], expression: "return true;" }] as never,
      }),
    ).toThrow();
  });
});
describe("Phase 5 immutable publication", () => {
  it("published questionnaire cannot be edited in place", () => {
    expect(() =>
      I.editQuestionnaire(ADMIN, Q.id, {
        title: "Changed",
        description: "",
        questions: Q.questions,
      }),
    ).toThrow("draft");
  });
  it("published rules cannot be edited in place", () => {
    expect(() => I.editRules(ADMIN, R.id, { name: "Changed", rules: R.rules })).toThrow("draft");
  });
  it("draft edit and explicit publish preserve in-progress session versions", () => {
    const h = P.begin(),
      draft = I.draftQuestionnaire(ADMIN, Q.id);
    I.editQuestionnaire(ADMIN, draft.id, {
      title: "Updated check",
      description: draft.description,
      questions: draft.questions,
    });
    I.publish(ADMIN, "questionnaire", draft.id);
    const rules = I.draftRules(ADMIN, R.id, draft.id);
    I.publish(ADMIN, "rules", rules.id);
    expect(P.get(h).questionnaire.id).toBe(Q.id);
    expect(P.get(P.begin()).questionnaire.id).toBe(draft.id);
  });
  it("historical reports remain unchanged after publishing new rules", () => {
    const h = ready(),
      before = P.get(h).report;
    const draft = I.draftRules(ADMIN, R.id, Q.id);
    const changed = structuredClone(draft.rules);
    const r = changed[0];
    if (!r) throw new Error("Missing rule");
    r.recommendation = "Changed future guidance";
    I.editRules(ADMIN, draft.id, { name: "Updated rules", rules: changed });
    I.publish(ADMIN, "rules", draft.id);
    expect(P.get(h).report).toEqual(before);
  });
  it("nonexistent rule question prevents publication", () => {
    const draft = I.draftRules(ADMIN, R.id, Q.id);
    const rules = structuredClone(draft.rules),
      r = rules[0];
    if (!r) throw new Error("Missing rule");
    r.conditions = [{ questionId: "nonexistent", operator: "equals", value: "Yes" }];
    I.editRules(ADMIN, draft.id, { name: "bad", rules });
    expect(() => I.publish(ADMIN, "rules", draft.id)).toThrow("Unknown question");
  });
  it("unsupported rule answer prevents publication", () => {
    const draft = I.draftRules(ADMIN, R.id, Q.id),
      rules = structuredClone(draft.rules),
      r = rules[0];
    if (!r) throw new Error("Missing rule");
    r.conditions = [{ questionId: "industry", operator: "equals", value: "Fictional option" }];
    I.editRules(ADMIN, draft.id, { name: "bad", rules });
    expect(() => I.publish(ADMIN, "rules", draft.id)).toThrow("Unsupported answer");
  });
  it("restricted catalog reference prevents publication", () => {
    const draft = I.draftRules(ADMIN, R.id, Q.id),
      rules = structuredClone(draft.rules),
      r = rules[0];
    if (!r) throw new Error("Missing rule");
    r.catalogId = "roadmap_custom_bridge";
    I.editRules(ADMIN, draft.id, { name: "bad", rules });
    expect(() => I.publish(ADMIN, "rules", draft.id)).toThrow("Restricted");
  });
  it("retirement leaves pinned session definition unchanged", () => {
    const h = P.begin();
    I.retire(ADMIN, "rules", R.id);
    expect(P.get(h).rules.status).toBe("published");
    expect(() => P.begin()).toThrow("No published");
  });
  it("duplicate question IDs and forward visibility dependencies are invalid", () => {
    const q = structuredClone(Q),
      first = q.questions[0];
    if (!first) throw new Error("Question missing");
    q.questions.push(first);
    expect(validateDefinition(q)).toContain("Question IDs must be unique");
    first.visibleWhen = { questionId: "industry", operator: "equals", value: "Retail" };
    expect(validateDefinition(q)).toContain("Visibility must reference an earlier question");
  });
});
describe("Phase 5 consultation and simulated lead", () => {
  it("explicit contact consent is required", async () => {
    const h = ready();
    await expect(P.consult(h, { ...contact, contactConsent: false })).rejects.toThrow();
  });
  it("marketing consent remains optional", async () => {
    const { id } = await submitted();
    expect(I.contact(MGR, id).contact.marketingConsent).toBe(false);
  });
  it("contact fields and unexpected organization claims are validated", async () => {
    const h = ready();
    await expect(P.consult(h, { ...contact, email: "invalid" })).rejects.toThrow();
    await expect(P.consult(h, { ...contact, organizationId: "org_other" })).rejects.toThrow();
  });
  it("phone preference needs a phone number", async () => {
    const h = ready();
    await expect(P.consult(h, { ...contact, preferredContact: "phone" })).rejects.toThrow();
  });
  it("repeated and concurrent submissions create one immutable snapshot, request and lead", async () => {
    const h = ready();
    const spy = vi.spyOn(businessFitLead, "createOrAssociate");
    const values = await Promise.all([
      P.consult(h, contact),
      P.consult(h, contact),
      P.consult(h, contact),
    ]);
    expect(new Set(values.map((v) => v.reference)).size).toBe(1);
    await P.consult(h, contact);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(store.table("fitSnapshots")).toHaveLength(1);
    expect(store.table("fitConsultations")).toHaveLength(1);
    expect(I.list(MGR)).toHaveLength(1);
  });
  it("adapter failure leaves no partial intake and retry creates exactly one request", async () => {
    const h = ready();
    businessFitLeadConfig.failNext = true;
    await expect(P.consult(h, contact)).rejects.toThrow("unavailable");
    expect(store.table("fitSnapshots")).toHaveLength(0);
    expect(store.table("fitConsultations")).toHaveLength(0);
    await P.consult(h, contact);
    expect(I.list(MGR)).toHaveLength(1);
  });
  it("snapshot is self-contained and contacts are not duplicated into it", async () => {
    const { id } = await submitted();
    const { snapshot } = I.get(MGR, id);
    expect(snapshot.schema).toBe("aurumi.cia.business-fit-submission/2");
    expect(snapshot.questionnaire.questions.length).toBeGreaterThan(0);
    expect(snapshot.rules.rules.length).toBeGreaterThan(0);
    expect(JSON.stringify(snapshot)).not.toContain(contact.email);
    expect(snapshot.report.catalog.length).toBeGreaterThan(0);
  });
  it("clearing an anonymous session during adapter await prevents submission", async () => {
    const h = ready();
    let release:
      ((value: { ok: true; data: { reference: string; status: "simulated" } }) => void) | undefined;
    vi.spyOn(businessFitLead, "createOrAssociate").mockImplementation(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    const result = P.consult(h, contact);
    P.clear(h);
    release?.({ ok: true, data: { reference: "stable", status: "simulated" } });
    await expect(result).rejects.toThrow("unavailable");
    expect(I.list(MGR)).toHaveLength(0);
  });
  it("restart after consultation does not delete submitted immutable records", async () => {
    const { h, id } = await submitted();
    const before = I.get(MGR, id).snapshot;
    P.clear(h);
    expect(I.get(MGR, id).snapshot).toEqual(before);
  });
});
describe("Phase 5 service authorization", () => {
  it("public user cannot enumerate submissions", () => {
    expect(() => I.list(PUBLIC)).toThrow("Access denied");
  });
  it("public user cannot read contacts or intake", async () => {
    const { id } = await submitted();
    expect(() => I.get(PUBLIC, id)).toThrow("Access denied");
    expect(() => I.contact(PUBLIC, id)).toThrow("Access denied");
  });
  it("unassigned professional cannot read restricted contacts", async () => {
    const { id } = await submitted();
    expect(() => I.contact(PRO, id)).toThrow("Access denied");
  });
  it("authorized assignment gives independent professional scoped access", async () => {
    const { id } = await submitted();
    I.assign(MGR, id, PRO.user.id);
    expect(I.get(PRO, id).intake.ownerId).toBe(PRO.user.id);
    expect(I.contact(PRO, id).contact.email).toBe(contact.email);
  });
  it("partner professionals remain assignment restricted", async () => {
    const { id } = await submitted();
    expect(() => I.get(PARTNER, id)).toThrow();
    I.assign(MGR, id, PARTNER.user.id);
    expect(I.get(PARTNER, id).intake.ownerId).toBe(PARTNER.user.id);
    expect(I.list(PRO)).toHaveLength(0);
  });
  it("reviewer cannot access contact information", async () => {
    const { id } = await submitted();
    expect(() => I.contact(REVIEWER, id)).toThrow();
  });
  it("unauthorized professional cannot assign submissions", async () => {
    const { id } = await submitted();
    I.assign(MGR, id, PRO.user.id);
    expect(() => I.assign(PRO, id, PARTNER.user.id)).toThrow("Access denied");
  });
  it("assignment rejects users outside the organization", async () => {
    const { id } = await submitted();
    expect(() => I.assign(MGR, id, "outside-user")).toThrow("eligible");
  });
  it("public user cannot invoke conversion", async () => {
    const { id } = await submitted();
    await expect(
      Promise.resolve().then(() =>
        I.convert(PUBLIC, id, {
          type: "tenant",
          confirm: true,
          organizationId: MGR.user.organizationId,
        }),
      ),
    ).rejects.toThrow("Access denied");
  });
  it("spoofed permissions or organization claims do not authorize a caller", async () => {
    const { id } = await submitted();
    const forged = { user: { ...PRO.user, roles: ["cia_admin"] as typeof PRO.user.roles } };
    expect(() => I.contact(forged, id)).toThrow("Access denied");
    expect(() => I.list({ user: { ...MGR.user, organizationId: "org_other" } })).toThrow(
      "Access denied",
    );
  });
  for (const ctx of [PUBLIC, PRO, PARTNER, MGR])
    it(`${ctx.user.id} cannot publish either definition type`, () => {
      expect(() => I.publish(ctx, "questionnaire", Q.id)).toThrow("Access denied");
      expect(() => I.publish(ctx, "rules", R.id)).toThrow("Access denied");
    });
  it("managers can create drafts but public visitors cannot", () => {
    expect(I.draftQuestionnaire(MGR, Q.id).status).toBe("draft");
    expect(() => I.draftQuestionnaire(PUBLIC, Q.id)).toThrow();
  });
  it("internal notes never modify public snapshot or report", async () => {
    const { id } = await submitted(),
      before = I.get(MGR, id).snapshot;
    I.note(MGR, id, "Internal professional note");
    expect(I.get(MGR, id).snapshot).toEqual(before);
    expect(I.get(MGR, id).intake.notes[0]?.body).toBe("Internal professional note");
  });
  it("direct generic intake status cannot claim assessment creation", async () => {
    const { id } = await submitted();
    expect(() => I.status(MGR, id, "assessment_created")).toThrow();
  });
});
describe("Phase 5 explicit assessment conversion", () => {
  it("review and carry-forward confirmation are required", async () => {
    const { id } = await submitted();
    expect(() =>
      I.convert(MGR, id, {
        type: "tenant",
        confirm: true,
        organizationId: MGR.user.organizationId,
      }),
    ).toThrow("Review");
    I.status(MGR, id, "under_review");
    expect(() =>
      I.convert(MGR, id, {
        type: "tenant",
        confirm: false,
        organizationId: MGR.user.organizationId,
      }),
    ).toThrow();
  });
  it("organization context cannot be supplied from outside authorized scope", async () => {
    const { id } = await submitted();
    I.status(MGR, id, "under_review");
    expect(() =>
      I.convert(MGR, id, { type: "tenant", confirm: true, organizationId: "other-org" }),
    ).toThrow("organization context");
  });
  it("authorized conversion creates an unapproved normal Assessment Studio record", async () => {
    const { id } = await submitted();
    I.status(MGR, id, "under_review");
    const assessmentId = await I.convert(MGR, id, {
      type: "tenant",
      confirm: true,
      organizationId: MGR.user.organizationId,
    });
    const view = await A.get(MGR, assessmentId);
    expect(view.assessment.type).toBe("tenant");
    expect(view.assessment.status).toBe("in_progress");
    expect(view.snapshots).toEqual([]);
    expect(view.workspace.overview.scope).toContain(I.get(MGR, id).snapshot.id);
    expect(
      view.workspace.systems.every(
        (s) => s.compatibility.status === "unknown" && s.apiAvailability === "unknown",
      ),
    ).toBe(true);
    expect(view.workspace.requirements.every((r) => r.basis === "assumption")).toBe(true);
    expect(view.workspace.evidence[0]?.verification.state).toBe("unverified");
    expect(view.workspace.evidence[0]?.status).toBe("research_finding");
  });
  it("repeated or competing requests create exactly one assessment", async () => {
    const { id } = await submitted();
    I.status(MGR, id, "qualified");
    const before = store.table("assessments").length;
    const input = { type: "tenant", confirm: true, organizationId: MGR.user.organizationId };
    const results = await Promise.all([
      I.convert(MGR, id, input),
      I.convert(MGR, id, input),
      I.convert(MGR, id, input),
    ]);
    expect(new Set(results).size).toBe(1);
    expect(store.table("assessments").length).toBe(before + 1);
    expect(await I.convert(MGR, id, input)).toBe(results[0]);
  });
  it("conversion source remains immutable", async () => {
    const { id } = await submitted(),
      before = I.get(MGR, id).snapshot;
    I.status(MGR, id, "under_review");
    await I.convert(MGR, id, {
      type: "partner",
      confirm: true,
      organizationId: MGR.user.organizationId,
    });
    expect(I.get(MGR, id).snapshot).toEqual(before);
  });
  it("failed import retries use the existing assessment and durable import progress", async () => {
    const { id } = await submitted();
    I.status(MGR, id, "under_review");
    const original = A.saveProfile;
    vi.spyOn(A, "saveProfile").mockRejectedValueOnce(new Error("Simulated import interruption"));
    const before = store.table("assessments").length,
      input = { type: "tenant", confirm: true, organizationId: MGR.user.organizationId };
    await expect(I.convert(MGR, id, input)).rejects.toThrow("interruption");
    vi.spyOn(A, "saveProfile").mockImplementation(original);
    await I.convert(MGR, id, input);
    expect(store.table("assessments").length).toBe(before + 1);
    expect(store.table("fitConversions")[0]?.state).toBe("complete");
  });
  it("another assessment type requires a separate operation rather than changing conversion", async () => {
    const { id } = await submitted();
    I.status(MGR, id, "qualified");
    await I.convert(MGR, id, {
      type: "tenant",
      confirm: true,
      organizationId: MGR.user.organizationId,
    });
    expect(() =>
      I.convert(MGR, id, {
        type: "partner",
        confirm: true,
        organizationId: MGR.user.organizationId,
      }),
    ).toThrow("original assessment type");
  });
});
describe("Phase 5 saved work and recovery", () => {
  it("mismatched contact and snapshot relationships fail closed", async () => {
    const { id } = await submitted();
    const rows = store.table("fitConsultations");
    const row = rows[0];
    if (!row) throw new Error("Contact fixture missing");
    row.snapshotId = "different-snapshot";
    store.replace("fitConsultations", rows);
    expect(() => I.contact(MGR, id)).toThrow("relationships");
    expect(() => I.get(MGR, id)).toThrow("relationships");
  });
  it("cross-organization linked contacts fail closed", async () => {
    const { id } = await submitted();
    const rows = store.table("fitConsultations");
    const row = rows[0];
    if (!row) throw new Error("Contact fixture missing");
    // Inject a reconstructed corrupt row at the simulated persistence boundary;
    // never mutate the domain record's immutable organization identity.
    store.replace(
      "fitConsultations",
      rows.map((contact) =>
        contact.id === row.id ? { ...contact, organizationId: "other-org" } : contact,
      ),
    );
    expect(() => I.contact(MGR, id)).toThrow("relationships");
  });
  it("conversion refuses an inconsistent pinned source", async () => {
    const { id } = await submitted();
    I.status(MGR, id, "qualified");
    await I.convert(MGR, id, {
      type: "tenant",
      confirm: true,
      organizationId: MGR.user.organizationId,
    });
    const rows = store.table("fitConversions");
    const row = rows[0];
    if (!row) throw new Error("Conversion fixture missing");
    row.snapshotId = "different-snapshot";
    store.replace("fitConversions", rows);
    expect(() =>
      I.convert(MGR, id, {
        type: "tenant",
        confirm: true,
        organizationId: MGR.user.organizationId,
      }),
    ).toThrow("source needs recovery");
  });
  it("valid snapshot and report restore unchanged", async () => {
    const backend = memoryBackend();
    store.attach(backend);
    const { id } = await submitted(),
      before = I.get(MGR, id).snapshot;
    const raw = backend.read(STORAGE_KEY);
    store.attach(backend);
    expect(I.get(MGR, id).snapshot).toEqual(before);
    expect(store.persistence().quarantined).toBe(0);
    expect(backend.read(STORAGE_KEY)).toBe(raw);
  });
  it("invalid snapshot is quarantined and valid sibling survives", async () => {
    await submitted();
    const valid = store.table("fitSnapshots")[0];
    if (!valid) throw new Error("Snapshot missing");
    const backend = memoryBackend();
    backend.write(
      STORAGE_KEY,
      JSON.stringify({
        tables: { fitSnapshots: [valid, { ...valid, id: "bad", schema: "unknown/1" }] },
      }),
    );
    store.attach(backend);
    expect(store.table("fitSnapshots")).toEqual([valid]);
    expect(store.persistence().quarantined).toBe(1);
    expect(backend.read(QUARANTINE_KEY)).toContain("unknown/1");
  });
  it("tampered report explanations are quarantined", async () => {
    await submitted();
    const saved = structuredClone(store.table("fitSnapshots"));
    const first = saved[0],
      dimension = first?.report.dimensions[0];
    if (!dimension) throw new Error("Dimension missing");
    dimension.explanation = "Tampered";
    const backend = memoryBackend();
    backend.write(STORAGE_KEY, JSON.stringify({ tables: { fitSnapshots: saved } }));
    store.attach(backend);
    expect(store.table("fitSnapshots")).toEqual([]);
    expect(store.persistence().quarantined).toBe(1);
  });
  it("invalid sessions preserve valid siblings", () => {
    const a = P.begin(),
      b = P.begin(),
      rows = store.table("fitSessions"),
      invalid = rows.find((s) => s.id === b.id);
    if (!invalid) throw new Error("Session missing");
    invalid.token = "short";
    const backend = memoryBackend();
    backend.write(STORAGE_KEY, JSON.stringify({ tables: { fitSessions: rows } }));
    store.attach(backend);
    expect(P.get(a).id).toBe(a.id);
    expect(() => P.get(b)).toThrow("unavailable");
    expect(store.persistence().quarantined).toBe(1);
  });
  it("failed quarantine backup leaves original payload untouched and blocks writes", () => {
    const raw = JSON.stringify({ tables: { fitSessions: [{ invalid: true }] } });
    let writes = 0;
    store.attach({
      kind: "memory",
      read: (key) => (key === STORAGE_KEY ? raw : null),
      write: () => {
        writes++;
        throw new Error("full");
      },
    });
    expect(store.persistence().protected).toBe(true);
    expect(() => P.begin()).toThrow("protected");
    expect(store.persistence().backupSaved).toBe(false);
    expect(writes).toBe(1);
  });
  it("invalid consent records are quarantined", async () => {
    await submitted();
    const c = store.table("fitConsultations")[0];
    if (!c) throw new Error("Missing consent");
    const backend = memoryBackend();
    backend.write(
      STORAGE_KEY,
      JSON.stringify({
        tables: { fitConsultations: [{ ...c, contact: { ...c.contact, contactConsent: false } }] },
      }),
    );
    store.attach(backend);
    expect(store.table("fitConsultations")).toEqual([]);
    expect(store.persistence().quarantined).toBe(1);
  });
});
