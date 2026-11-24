import { beforeEach, describe, expect, it, vi } from "vitest";
import { businessFitPublic as P } from "@/data/business-fit-public";
import { businessFitInternal as I } from "@/data/business-fit-internal";
import { assessmentStudio as A, studioConfig } from "@/data/assessment-studio";
import {
  store,
  memoryBackend,
  STORAGE_KEY,
  QUARANTINE_KEY,
  type Tables,
  type PersistenceBackend,
} from "@/data/store";
import { FIT_QUESTIONNAIRE as Q, FIT_RULES as R, FIT_SCENARIOS } from "@/data/business-fit-seed";
import { seedUsers } from "@/data/seed";
import { businessFitLead as lead, publicFitCatalog } from "@/integrations/adapters/business-fit";
import {
  evaluate,
  effectiveResponses,
  validateDefinition,
  visibleQuestions,
  FIT_SCHEMA,
  FIT_HASH_CONTRACT,
  type FitRule,
  type BusinessFitSubmissionSnapshot,
  type BusinessFitResponse,
} from "@/domain/business-fit";
import {
  snapshotProblems,
  snapshotValue,
  snapshotAssurance,
} from "@/domain/business-fit-integrity";
import reportHistory from "./fixtures/phase5-ebe4033-report.json";
import consultationHistory from "./fixtures/phase5-ebe4033-consultation.json";
import convertedHistory from "./fixtures/phase5-ebe4033-converted.json";
const ctx = (id: string) => {
  const user = seedUsers.find((u) => u.id === id);
  if (!user) throw Error("Missing identity");
  return { user };
};
const M = ctx("u_manager"),
  PRO = ctx("u_pro"),
  ADMIN = ctx("u_admin");
const contact = {
  name: "Fictional Owner",
  businessName: "Demo Co",
  email: "owner@demo.example",
  phone: "",
  country: "India",
  preferredContact: "email",
  comments: "",
  contactConsent: true,
  marketingConsent: false,
};
const input = { type: "tenant", confirm: true, organizationId: M.user.organizationId };
const record = {
  id: "report-test",
  organizationId: "org_public",
  createdAt: "2026-11-24T00:00:00.000Z",
  createdBy: "anonymous",
  updatedAt: "2026-11-24T00:00:00.000Z",
  updatedBy: "anonymous",
};
function scenario() {
  const s = FIT_SCENARIOS[0];
  if (!s) throw Error("Missing scenario");
  return structuredClone(s.responses);
}
function ready() {
  const h = P.begin();
  P.save(h, scenario(), 4);
  P.generate(h);
  return h;
}
async function submit() {
  const h = ready();
  await P.consult(h, contact);
  const row = I.list(M)[0];
  if (!row) throw Error("No intake");
  return { h, id: row.intake.id };
}
function one<T>(rows: T[]): T {
  const r = rows[0];
  if (!r) throw Error("Missing fixture row");
  return r;
}
function gate() {
  let release: () => void = () => {};
  const wait = new Promise<void>((r) => {
    release = r;
  });
  return { wait, release: () => release() };
}
function faultBackend() {
  const b = memoryBackend();
  let fail: (t: Tables) => boolean = () => false;
  const backend: PersistenceBackend = {
    kind: "memory",
    read: (k) => b.read(k),
    write: (k, v) => {
      if (k === STORAGE_KEY && fail((JSON.parse(v) as { tables: Tables }).tables))
        throw Error("Injected storage full");
      b.write(k, v);
    },
  };
  return {
    backend,
    fail: (f: (t: Tables) => boolean) => {
      fail = f;
    },
    healthy: () => {
      fail = () => false;
    },
  };
}
function historical(fixture: unknown) {
  const b = memoryBackend();
  b.write(STORAGE_KEY, JSON.stringify(fixture));
  store.attach(b);
  return b;
}
function firstSnapshot() {
  return one(store.table("fitSnapshots"));
}
beforeEach(() => {
  vi.restoreAllMocks();
  store.attach(memoryBackend());
  studioConfig.latencyMs = 0;
});
describe("F01 acknowledged durable operations", () => {
  it("missing persistence never authorizes external side effects or successful completion", async () => {
    store.attach(null);
    const h = ready(),
      spy = vi.spyOn(lead, "createOrAssociate");
    await expect(P.consult(h, contact)).rejects.toThrow("persistent storage is unavailable");
    expect(spy).not.toHaveBeenCalled();
    expect(store.table("fitConsultations")).toHaveLength(0);
  });
  it("failure before durable intent creates no lead or completion and reload retry reserves one operation", async () => {
    const f = faultBackend();
    store.attach(f.backend);
    const h = ready(),
      spy = vi.spyOn(lead, "createOrAssociate");
    f.fail((t) => t.fitOperations.length > 0);
    await expect(P.consult(h, contact)).rejects.toThrow("Unable to save");
    expect(spy).not.toHaveBeenCalled();
    expect(store.table("fitOperations")).toHaveLength(0);
    expect(store.table("fitConsultations")).toHaveLength(0);
    store.attach(f.backend);
    f.healthy();
    const result = await P.consult(h, contact);
    expect(result.reference).toBe(one(store.table("fitOperations")).reference);
    expect(store.table("fitConsultations")).toHaveLength(1);
  });
  it.each(["lead_created", "complete"] as const)(
    "failure at %s is recoverable after reload with stable lead and consultation identities",
    async (phase) => {
      const f = faultBackend();
      store.attach(f.backend);
      const h = ready(),
        spy = vi.spyOn(lead, "createOrAssociate");
      f.fail((t) => t.fitOperations.some((o) => o.state === phase));
      await expect(P.consult(h, contact)).rejects.toThrow("Unable to save");
      const intent = one(store.table("fitOperations"));
      expect(intent.state).not.toBe("complete");
      expect(store.table("fitConsultations")).toHaveLength(0);
      expect(P.get(h).consultationId).toBeUndefined();
      const firstKey = spy.mock.calls[0]?.[0];
      store.attach(f.backend);
      expect(one(store.table("fitOperations")).id).toBe(intent.id);
      f.healthy();
      const result = await P.consult(h, contact);
      expect(result.reference).toBe(intent.reference);
      expect(result.leadReference).toBe(`ST-DEMO-${firstKey}`);
      expect(store.table("fitSnapshots")).toHaveLength(1);
      expect(one(store.table("fitConsultations")).id).toBe(intent.consultationId);
      expect(spy.mock.calls.every((call) => call[0] === firstKey)).toBe(true);
      store.attach(f.backend);
      expect(await P.consult(h, contact)).toEqual(result);
      expect(store.persistence().quarantined).toBe(0);
    },
  );
  it("atomic creation/link failure rolls back the assessment and succeeds exactly once on reload retry", async () => {
    const f = faultBackend();
    store.attach(f.backend);
    const { id } = await submit();
    I.status(M, id, "qualified");
    const count = store.table("assessments").length;
    f.fail((t) => t.fitConversions.some((c) => c.state === "importing"));
    await expect(I.convert(M, id, input)).rejects.toThrow("Unable to save");
    expect(store.table("assessments")).toHaveLength(count);
    expect(one(store.table("fitConversions")).state).toBe("pending");
    store.attach(f.backend);
    f.healthy();
    const a = await I.convert(M, id, input);
    expect(store.table("assessments")).toHaveLength(count + 1);
    expect(I.get(M, id).intake.assessmentId).toBe(a);
  });
  it("final conversion failure preserves created assessment/progress and reload retry reuses it", async () => {
    const f = faultBackend();
    store.attach(f.backend);
    const { id } = await submit();
    I.status(M, id, "qualified");
    const count = store.table("assessments").length;
    f.fail((t) => t.fitConversions.some((c) => c.state === "complete"));
    await expect(I.convert(M, id, input)).rejects.toThrow("Unable to save");
    const c = one(store.table("fitConversions"));
    expect(c.state).toBe("importing");
    expect(I.get(M, id).intake.assessmentId).toBeUndefined();
    const ws = one(store.table("workspaces").filter((w) => w.assessmentId === c.assessmentId));
    store.attach(f.backend);
    f.healthy();
    expect(await I.convert(M, id, input)).toBe(c.assessmentId);
    expect(store.table("assessments")).toHaveLength(count + 1);
    expect(one(store.table("workspaces").filter((w) => w.assessmentId === c.assessmentId))).toEqual(
      ws,
    );
    expect(store.persistence().quarantined).toBe(0);
  });
  it("partial import storage failure reloads and resumes with no duplicate children", async () => {
    const f = faultBackend();
    store.attach(f.backend);
    const { id } = await submit();
    I.status(M, id, "qualified");
    f.fail((t) => t.fitConversions.some((c) => c.imported === 4));
    await expect(I.convert(M, id, input)).rejects.toThrow("Unable to save");
    const c = one(store.table("fitConversions"));
    expect(c.imported).toBe(3);
    const ws = one(store.table("workspaces").filter((w) => w.assessmentId === c.assessmentId)),
      ids = ws.systems.map((s) => s.id);
    store.attach(f.backend);
    f.healthy();
    await I.convert(M, id, input);
    const after = await A.get(M, String(c.assessmentId));
    expect(after.workspace.systems.map((s) => s.id).slice(0, ids.length)).toEqual(ids);
    expect(after.workspace.systems).toHaveLength(firstSnapshot().systems.length);
    for (const children of [
      after.workspace.systems,
      after.workspace.requirements,
      after.workspace.openQuestions,
      after.workspace.evidence,
    ])
      expect(new Set(children.map((c) => c.id)).size).toBe(children.length);
  });
  it("unacknowledged successful storage write blocks later writes until explicit recovery reload", () => {
    const b = memoryBackend();
    let denyRead = false;
    store.attach({
      kind: "memory",
      write: (k, v) => {
        b.write(k, v);
        denyRead = true;
      },
      read: (k) => (denyRead && k === STORAGE_KEY ? null : b.read(k)),
    });
    expect(() => store.durable(() => store.batch({ fitOperations: [] }))).toThrow("acknowledge");
    expect(store.persistence().protected).toBe(true);
    expect(() => store.reset()).toThrow("protected");
    denyRead = false;
    expect(store.retryRecovery().ok).toBe(true);
  });
});
describe("F02 guarded commitment races", () => {
  for (const change of ["withdrawal", "reassignment", "authorization removal"] as const)
    it(`${change} before delayed creation commits creates no assessment`, async () => {
      const { id } = await submit();
      I.assign(M, id, PRO.user.id);
      I.status(M, id, "qualified");
      const count = store.table("assessments").length,
        g = gate(),
        create = A.create;
      vi.spyOn(A, "create").mockImplementation(async (...args) => {
        await g.wait;
        return create(...args);
      });
      const p = I.convert(PRO, id, input);
      const rejected = expect(p).rejects.toThrow();
      if (change === "withdrawal") I.status(M, id, "withdrawn");
      else if (change === "reassignment") I.assign(M, id, M.user.id);
      else
        store.replace(
          "users",
          store.table("users").map((u) => (u.id === PRO.user.id ? { ...u, roles: [] } : u)),
        );
      g.release();
      await rejected;
      expect(store.table("assessments")).toHaveLength(count);
      expect(one(store.table("fitConversions")).assessmentId).toBeUndefined();
      expect(one(store.table("fitConversions")).state).toBe("pending");
      if (change === "withdrawal") expect(one(store.table("fitIntakes")).status).toBe("withdrawn");
      store.attach(memoryBackend());
    });
  it("withdrawal after legitimate creation preserves the assessment without completing or overriding withdrawal", async () => {
    const { id } = await submit();
    I.status(M, id, "qualified");
    const g = gate(),
      overview = A.saveOverview;
    let started = () => {};
    const entered = new Promise<void>((r) => {
      started = r;
    });
    vi.spyOn(A, "saveOverview").mockImplementation(async (...args) => {
      started();
      await g.wait;
      return overview(...args);
    });
    const p = I.convert(M, id, input);
    const rejected = expect(p).rejects.toThrow("interrupted");
    await entered;
    const c = one(store.table("fitConversions")),
      count = store.table("assessments").length;
    expect(c.assessmentId).toBeDefined();
    I.status(M, id, "withdrawn");
    g.release();
    await rejected;
    expect(store.table("assessments")).toHaveLength(count);
    expect(one(store.table("fitIntakes")).status).toBe("withdrawn");
    expect(one(store.table("fitConversions")).state).toBe("importing");
    expect(() => I.convert(M, id, input)).toThrow("Review");
  });
  it("reassignment interrupts imports; unauthorized recovery rejects while current authorized recovery resumes the same assessment", async () => {
    const b = memoryBackend();
    store.attach(b);
    const { id } = await submit();
    I.assign(M, id, PRO.user.id);
    I.status(M, id, "qualified");
    const g = gate(),
      profile = A.saveProfile;
    let started = () => {};
    const entered = new Promise<void>((r) => {
      started = r;
    });
    vi.spyOn(A, "saveProfile").mockImplementation(async (...args) => {
      started();
      await g.wait;
      return profile(...args);
    });
    const p = I.convert(PRO, id, input);
    const rejected = expect(p).rejects.toThrow();
    await entered;
    const a = one(store.table("fitConversions")).assessmentId,
      count = store.table("assessments").length;
    I.assign(M, id, M.user.id);
    g.release();
    await rejected;
    vi.restoreAllMocks();
    store.attach(b);
    expect(() => I.convert(PRO, id, input)).toThrow("Access denied");
    expect(await I.convert(M, id, input)).toBe(a);
    expect(store.table("assessments")).toHaveLength(count);
  });
  it("concurrent requests persist exactly one complete assessment and matching relationship", async () => {
    const { id } = await submit();
    I.status(M, id, "qualified");
    const count = store.table("assessments").length;
    const ids = await Promise.all([I.convert(M, id, input), I.convert(M, id, input)]);
    expect(ids[0]).toBe(ids[1]);
    expect(store.table("assessments")).toHaveLength(count + 1);
    expect(one(store.table("fitConversions")).state).toBe("complete");
    expect(one(store.table("fitIntakes")).assessmentId).toBe(ids[0]);
  });
});
describe("F03 canonical effective responses", () => {
  function conditional() {
    const q = structuredClone(Q),
      question = q.questions.find((q) => q.id === "manualReports");
    if (!question) throw Error("no question");
    question.visibleWhen = { questionId: "industry", operator: "equals", value: "Hospitality" };
    return q;
  }
  it("Hospitality-to-Retail hides stale reporting recommendation, maturity, gaps and supporting evidence", () => {
    const q = conditional(),
      rules = structuredClone(R),
      response = { ...scenario(), industry: "Retail", manualReports: "Always" };
    const rule = rules.rules.find((r) => r.id === "reports-Always");
    if (!rule) throw Error("no rule");
    rule.level = "Foundational";
    const report = evaluate(response, q, rules, publicFitCatalog(), record);
    expect(report.responses["manualReports"]).toBeUndefined();
    expect(report.opportunities.map((o) => o.id)).not.toContain("reports-Always");
    const d = report.dimensions.find((d) => d.dimension === "Management visibility");
    expect(d?.ruleRefs).not.toContain("reports-Always");
    expect(d?.responseRefs).not.toContain("manualReports");
    expect(d?.gaps).not.toContain("Are reports manually prepared from multiple sources?");
  });
  it("hidden parents cannot activate dependent children at three levels", () => {
    const q = conditional();
    q.questions.push(
      {
        id: "nested",
        section: 3,
        prompt: "Nested",
        type: "single",
        options: ["Yes"],
        required: true,
        order: 200,
        visibleWhen: { questionId: "manualReports", operator: "equals", value: "Always" },
      },
      {
        id: "third",
        section: 3,
        prompt: "Third",
        type: "text",
        options: [],
        required: true,
        order: 201,
        visibleWhen: { questionId: "nested", operator: "equals", value: "Yes" },
      },
    );
    const raw = {
      ...scenario(),
      industry: "Retail",
      manualReports: "Always",
      nested: "Yes",
      third: "stale",
    };
    expect(effectiveResponses(q, raw)["third"]).toBeUndefined();
    expect(visibleQuestions(q, raw).map((q) => q.id)).not.toContain("nested");
    expect(effectiveResponses(q, raw)["manualReports"]).toBeUndefined();
  });
  it("conversion preserves raw history but imports neither hidden answers nor their opportunities", async () => {
    const q = conditional();
    store.replace("fitQuestionnaires", [q]);
    const h = P.begin();
    P.save(h, { ...scenario(), industry: "Retail", manualReports: "Always" }, 4);
    P.generate(h);
    await P.consult(h, contact);
    const row = one(I.list(M));
    I.status(M, row.intake.id, "qualified");
    const a = await I.convert(M, row.intake.id, input),
      view = await A.get(M, a);
    expect(firstSnapshot().responses["manualReports"]).toBe("Always");
    expect(firstSnapshot().effectiveResponses?.["manualReports"]).toBeUndefined();
    expect(view.workspace.evidence[0]?.statement).not.toContain("manualReports");
    expect(
      view.workspace.requirements.some((r) => r.statement.includes("Review existing reporting")),
    ).toBe(false);
  });
});
describe("F04 semantic definitions and active pairs", () => {
  const changes: [string, (q: typeof Q) => void][] = [
    [
      "zero choice options",
      (q) => {
        one(q.questions.filter((x) => x.id === "industry")).options = [];
      },
    ],
    ["duplicate identifiers", (q) => q.questions.push(structuredClone(one(q.questions)))],
    [
      "duplicate options",
      (q) => {
        one(q.questions.filter((x) => x.id === "industry")).options.push("Retail");
      },
    ],
    [
      "invalid answer configuration",
      (q) => {
        one(q.questions.filter((x) => x.id === "businessName")).options = ["bad"];
      },
    ],
    [
      "impossible selection constraint",
      (q) => {
        one(q.questions.filter((x) => x.id === "priorities")).maxSelections = 100;
      },
    ],
    [
      "unknown question",
      (q) => {
        one(q.questions).visibleWhen = { questionId: "missing", operator: "answered" };
      },
    ],
    [
      "unknown answer option",
      (q) => {
        one(q.questions.filter((x) => x.id === "subcategory")).visibleWhen = {
          questionId: "industry",
          operator: "equals",
          value: "UnknownIndustry",
        };
      },
    ],
    [
      "operator/type mismatch",
      (q) => {
        one(q.questions.filter((x) => x.id === "subcategory")).visibleWhen = {
          questionId: "industry",
          operator: "includes",
          value: "Retail",
        };
      },
    ],
    [
      "self condition",
      (q) => {
        one(q.questions.filter((x) => x.id === "industry")).visibleWhen = {
          questionId: "industry",
          operator: "equals",
          value: "Retail",
        };
      },
    ],
    [
      "circular condition",
      (q) => {
        one(q.questions.filter((x) => x.id === "industry")).visibleWhen = {
          questionId: "subcategory",
          operator: "answered",
        };
      },
    ],
  ];
  it.each(changes)("rejects %s during publication and restoration", (_name, change) => {
    const q = I.draftQuestionnaire(ADMIN, Q.id);
    change(q);
    I.editQuestionnaire(ADMIN, q.id, {
      title: q.title,
      description: q.description,
      questions: q.questions,
    });
    expect(() => I.publish(ADMIN, "questionnaire", q.id)).toThrow();
    const b = memoryBackend();
    b.write(
      STORAGE_KEY,
      JSON.stringify({ tables: { fitQuestionnaires: [Q, { ...q, status: "published" }] } }),
    );
    store.attach(b);
    expect(store.table("fitQuestionnaires")).toEqual([Q]);
    expect(store.persistence().quarantined).toBeGreaterThan(0);
  });
  it("an incompatible pair cannot become active and a staged questionnaire preserves the previous usable pair", () => {
    const q = I.draftQuestionnaire(ADMIN, Q.id);
    I.publish(ADMIN, "questionnaire", q.id);
    expect(P.get(P.begin()).questionnaire.id).toBe(Q.id);
    const r = I.draftRules(ADMIN, R.id, q.id);
    const bad = structuredClone(r);
    bad.questionnaireVersionId = "missing";
    expect(validateDefinition(q, bad, publicFitCatalog()).length).toBeGreaterThan(0);
    I.publish(ADMIN, "rules", r.id);
    expect(P.get(P.begin()).questionnaire.id).toBe(q.id);
  });
  it("invalid restored published rule is quarantined while valid siblings remain active", () => {
    const r = structuredClone(R);
    r.id = "bad";
    one(r.rules).conditions = [{ questionId: "missing", operator: "answered" }];
    historical({ tables: { fitQuestionnaires: [Q], fitRules: [R, r] } });
    expect(store.table("fitRules")).toEqual([R]);
    expect(P.get(P.begin()).rules.id).toBe(R.id);
  });
  it("no valid active pair produces controlled unavailable rather than a broken report", () => {
    historical({
      tables: { fitQuestionnaires: [Q], fitRules: [{ ...R, questionnaireVersionId: "missing" }] },
    });
    expect(() => P.begin()).toThrow("No published");
    expect(store.table("fitRules")).toHaveLength(0);
  });
  it("valid pinned historical sessions can generate after publication and retirement without changing their original rules", () => {
    const h = P.begin(),
      before = P.get(h);
    const draft = I.draftQuestionnaire(ADMIN, Q.id);
    I.publish(ADMIN, "questionnaire", draft.id);
    const r = I.draftRules(ADMIN, R.id, draft.id);
    I.publish(ADMIN, "rules", r.id);
    I.retire(ADMIN, "questionnaire", Q.id);
    I.retire(ADMIN, "rules", R.id);
    P.save(h, scenario(), 4);
    expect(P.generate(h).questionnaireVersionId).toBe(before.questionnaire.id);
    expect(P.get(h).rules).toEqual(before.rules);
  });
});
describe("F05 structured catalog applicability", () => {
  function connector(): FitRule {
    return {
      id: "connector-test",
      name: "Scope",
      description: "Advisory",
      dimension: "Systems interoperability",
      conditions: [{ questionId: "systems", operator: "answered" }],
      category: "Integration opportunities",
      recommendation: "Connector guidance",
      nextStep: "Validate",
      priority: 1,
      evidenceRequirements: ["systems"],
      industries: [],
      employeeBands: [],
      catalogId: "conn_tally",
      applicability: {
        assurance: "supported",
        system: "tally",
        direction: "inbound",
        operations: ["read"],
        responseQuestionId: "systems",
      },
    };
  }
  function rules(rule: FitRule) {
    return { ...R, rules: [rule] };
  }
  it("the exact Salesforce/Tally prose counterexample cannot be published as a confirmed capability", () => {
    const r = connector();
    delete r.applicability;
    r.recommendation = "Confirmed two-way Salesforce writes via the Tally connector.";
    const draft = I.draftRules(ADMIN, R.id, Q.id);
    I.editRules(ADMIN, draft.id, { name: "Bad", rules: [r] });
    expect(() => I.publish(ADMIN, "rules", draft.id)).toThrow("structured applicability");
  });
  const invalid: [string, (r: FitRule) => void][] = [
    [
      "wrong external product",
      (r) => {
        if (r.applicability) r.applicability.system = "salesforce";
      },
    ],
    [
      "unsupported write",
      (r) => {
        if (r.applicability) r.applicability.operations = ["write"];
      },
    ],
    [
      "unsupported direction",
      (r) => {
        if (r.applicability) r.applicability.direction = "bidirectional";
      },
    ],
    [
      "unknown integration",
      (r) => {
        r.catalogId = "unknown";
      },
    ],
    [
      "wrong category",
      (r) => {
        r.category = "Native application opportunities";
      },
    ],
  ];
  it.each(invalid)("rejects %s in publication, evaluation and restoration", (_name, change) => {
    const r = connector();
    change(r);
    expect(validateDefinition(Q, rules(r), publicFitCatalog()).length).toBeGreaterThan(0);
    expect(() => evaluate(scenario(), Q, rules(r), publicFitCatalog(), record)).toThrow();
    historical({
      tables: { fitQuestionnaires: [Q], fitRules: [R, { ...rules(r), id: "bad-rule" }] },
    });
    expect(store.table("fitRules")).toEqual([R]);
  });
  it("unpublished catalog capability cannot confirm availability", () => {
    const c = publicFitCatalog().map((c) =>
      c.id === "conn_tally" ? { ...c, published: false } : c,
    );
    expect(validateDefinition(Q, rules(connector()), c)).toContain(
      "Capability is not published and available",
    );
  });
  it("validated read-only Tally scope uses controlled wording rather than arbitrary technical prose", () => {
    const r = connector();
    r.recommendation = "Confirmed two-way Salesforce writes";
    r.description = "Salesforce writes";
    r.nextStep = "Write Salesforce now";
    const response: BusinessFitResponse = {
      ...scenario(),
      systems: [{ function: "Accounting and finance", kind: "commercial", name: "Tally" }],
    };
    const report = evaluate(response, Q, rules(r), publicFitCatalog(), record);
    expect(report.opportunities[0]?.capability?.claim).toBe("available");
    expect(report.opportunities[0]?.title).toContain("read for tally (inbound)");
    expect(JSON.stringify(report.opportunities)).not.toContain("Salesforce");
  });
  it("unrelated respondent systems cannot turn a supported catalog scope into available customer compatibility", () => {
    const report = evaluate(
      {
        ...scenario(),
        systems: [{ function: "Accounting and finance", kind: "custom", name: "Custom ERP" }],
      },
      Q,
      rules(connector()),
      publicFitCatalog(),
      record,
    );
    expect(report.opportunities[0]?.capability?.claim).toBe("potential");
  });
  it("potential unknown integration stays qualified", () => {
    const r = connector();
    if (r.applicability) {
      r.applicability.assurance = "potential";
      r.applicability.system = "unknown";
      r.applicability.operations = ["write"];
    }
    const report = evaluate(scenario(), Q, rules(r), publicFitCatalog(), record);
    expect(report.opportunities[0]?.capability?.claim).toBe("potential");
    expect(report.opportunities[0]?.validationRequired).toBe(true);
  });
  it("unstructured native advice is never promoted to confirmed availability", () => {
    const report = evaluate(scenario(), Q, R, publicFitCatalog(), record);
    expect(report.opportunities.find((o) => o.id === "reports-Always")?.capability?.claim).toBe(
      "potential",
    );
  });
});
describe("F06 immutable content and relationship integrity", () => {
  const changes: [string, (s: BusinessFitSubmissionSnapshot) => BusinessFitSubmissionSnapshot][] = [
    ["submission identity", (s) => ({ ...s, submissionId: "changed" })],
    ["organization identity", (s) => ({ ...s, organizationId: "other" })],
    [
      "questionnaire version",
      (s) => ({ ...s, questionnaire: { ...s.questionnaire, version: 99 } }),
    ],
    ["rule version", (s) => ({ ...s, rules: { ...s.rules, version: 99 } })],
    [
      "catalog content",
      (s) => ({
        ...s,
        report: { ...s.report, catalog: s.report.catalog.map((c) => ({ ...c, name: "changed" })) },
      }),
    ],
    [
      "raw and report responses together",
      (s) => ({
        ...s,
        responses: { ...s.responses, businessName: "Tampered" },
        report: { ...s.report, responses: { ...s.report.responses, businessName: "Tampered" } },
      }),
    ],
    [
      "effective responses",
      (s) => ({ ...s, effectiveResponses: { ...s.effectiveResponses, businessName: "changed" } }),
    ],
    [
      "recommendation evidence",
      (s) => ({
        ...s,
        report: {
          ...s.report,
          opportunities: s.report.opportunities.map((o) => ({
            ...o,
            responseRefs: ["businessName"],
          })),
        },
      }),
    ],
    ["unknown integrity contract", (s) => ({ ...s, integrityContract: "unknown/1" })],
    [
      "missing current marker",
      (s) => {
        const { integrityContract: _removed, ...rest } = s;
        return rest;
      },
    ],
  ];
  it.each(changes)(
    "rejects changed %s, quarantines corruption and retains valid sibling",
    async (_name, change) => {
      await submit();
      const valid = firstSnapshot(),
        bad = change(structuredClone(valid));
      expect(snapshotProblems(bad).length).toBeGreaterThan(0);
      historical({ tables: { fitSnapshots: [valid, bad] } });
      expect(store.table("fitSnapshots")).toEqual([valid]);
      expect(store.persistence().quarantined).toBe(1);
    },
  );
  it("a freshly recomputed content value cannot rescue broken embedded version identities", async () => {
    await submit();
    const s = firstSnapshot();
    const bad = { ...s, rules: { ...s.rules, questionnaireVersionId: "missing" } };
    const rehashed = { ...bad, integrityValue: snapshotValue(bad) };
    expect(snapshotProblems(rehashed).length).toBeGreaterThan(0);
  });
  for (const kind of ["consent", "intake", "lead", "operation"] as const)
    it(`invalid ${kind} association blocks material downstream use`, async () => {
      const { id } = await submit();
      if (kind === "consent")
        store.replace(
          "fitConsultations",
          store.table("fitConsultations").map((c) => ({ ...c, operationId: "wrong" })),
        );
      if (kind === "intake")
        store.replace(
          "fitIntakes",
          store.table("fitIntakes").map((r) => ({ ...r, consultationId: "missing" })),
        );
      if (kind === "lead")
        store.replace(
          "fitConsultations",
          store.table("fitConsultations").map((c) => ({ ...c, leadReference: "wrong" })),
        );
      if (kind === "operation")
        store.replace(
          "fitOperations",
          store.table("fitOperations").map((o) => ({ ...o, submissionId: "wrong" })),
        );
      expect(() => I.get(M, id)).toThrow("relationships");
    });
  for (const kind of ["nonexistent", "unrelated", "cross-organization"] as const)
    it(`${kind} completed assessment is never returned as successful`, async () => {
      const { id } = await submit();
      I.status(M, id, "qualified");
      const a = await I.convert(M, id, input),
        rows = store.table("fitConversions");
      if (kind === "nonexistent")
        store.replace(
          "fitConversions",
          rows.map((c) => ({ ...c, assessmentId: "missing" })),
        );
      if (kind === "unrelated")
        store.replace(
          "fitConversions",
          rows.map((c) => ({
            ...c,
            assessmentId: one(store.table("assessments").filter((x) => x.id !== a)).id,
          })),
        );
      if (kind === "cross-organization")
        store.replace(
          "assessments",
          store
            .table("assessments")
            .map((x) => (x.id === a ? { ...x, organizationId: "other-org" } : x)),
        );
      expect(() => I.convert(M, id, input)).toThrow("recovery");
      expect(() => I.get(M, id)).toThrow("recovery");
    });
  it("current snapshots declare both contracts and survive repeated reloads unchanged", async () => {
    const b = memoryBackend();
    store.attach(b);
    const { id } = await submit(),
      snapshot = I.get(M, id).snapshot;
    expect(snapshot.schema).toBe(FIT_SCHEMA);
    expect(snapshot.integrityContract).toBe(FIT_HASH_CONTRACT);
    for (let i = 0; i < 3; i++) {
      store.attach(b);
      expect(I.get(M, id).snapshot).toEqual(snapshot);
      expect(store.persistence().quarantined).toBe(0);
    }
  });
  it("failed quarantine backup preserves exact original payload and blocks durable operations", async () => {
    await submit();
    const s = { ...firstSnapshot(), submissionId: "changed" },
      raw = JSON.stringify({ tables: { fitSnapshots: [s] } }),
      b = memoryBackend();
    b.write(STORAGE_KEY, raw);
    store.attach({
      kind: "memory",
      read: (k) => b.read(k),
      write: (k, v) => {
        if (k === QUARANTINE_KEY) throw Error("Backup full");
        b.write(k, v);
      },
    });
    expect(store.persistence().protected).toBe(true);
    expect(() => store.durable(() => store.batch({ fitSnapshots: [] }))).toThrow("protected");
    expect(b.read(STORAGE_KEY)).toBe(raw);
  });
});
describe("Genuine ebe4033 historical compatibility", () => {
  it.each([
    ["report", reportHistory],
    ["consultation", consultationHistory],
    ["converted", convertedHistory],
  ] as const)(
    "%s fixture restores with no quarantine and exact original content",
    (_name, fixture) => {
      const b = historical(fixture),
        raw = b.read(STORAGE_KEY);
      expect(store.persistence().quarantined).toBe(0);
      expect(store.table("fitSessions")).toEqual(fixture.tables.fitSessions);
      expect(store.table("fitSnapshots")).toEqual(fixture.tables.fitSnapshots);
      expect(store.table("fitConversions")).toEqual(fixture.tables.fitConversions);
      for (let i = 0; i < 3; i++) {
        store.attach(b);
        expect(b.read(STORAGE_KEY)).toBe(raw);
        expect(store.persistence().quarantined).toBe(0);
      }
    },
  );
  it("historical anonymous preview and pinned catalog remain unchanged", () => {
    historical(reportHistory);
    const s = one(store.table("fitSessions"));
    expect(P.get({ id: s.id, token: s.token }).report).toEqual(s.report);
    expect(P.generate({ id: s.id, token: s.token })).toEqual(s.report);
  });
  it("already completed historical conversion remains retrievable with its original assessment and no fabricated approval", async () => {
    historical(convertedHistory);
    const r = one(store.table("fitIntakes")),
      count = store.table("assessments").length;
    expect(await I.convert(M, r.id, input)).toBe(r.assessmentId);
    expect(store.table("assessments")).toHaveLength(count);
    expect((await A.get(M, String(r.assessmentId))).assessment.status).toBe("in_progress");
    expect(store.table("snapshots")).toEqual(convertedHistory.tables.snapshots);
  });
  it("historical new conversion requires explicit authorized review, preserves the original snapshot, and then imports unverified data", async () => {
    historical(consultationHistory);
    const r = one(store.table("fitIntakes")),
      source = firstSnapshot();
    I.status(M, r.id, "qualified");
    expect(snapshotAssurance(source)).toBe("historical-consistency");
    expect(() => I.convert(M, r.id, input)).toThrow("explicit authorized review");
    expect(() => I.revalidateHistorical(PRO, r.id, true)).toThrow("Access denied");
    I.revalidateHistorical(M, r.id, true);
    await I.convert(M, r.id, input);
    expect(firstSnapshot()).toEqual(source);
  });
  it("marker-stripped historical-looking data receives only historical assurance, not permission for fresh conversion", async () => {
    await submit();
    const s = firstSnapshot();
    const {
      integrityContract: _contract,
      integrityValue: _hash,
      effectiveResponses: _effective,
      businessContext: _context,
      operationId: _op,
      sessionId: _session,
      ...rest
    } = s;
    // Released historical format is evaluated by its frozen algorithm, not upgraded or assigned a new hash.
    const old = one(consultationHistory.tables.fitSnapshots);
    expect(snapshotAssurance({ ...rest, schema: "aurumi.cia.business-fit-submission/1" })).toBe(
      "historical-consistency",
    );
    expect(snapshotProblems(old as BusinessFitSubmissionSnapshot)).toEqual([]);
  });
  it("historical and strengthened records coexist without rewriting either history", async () => {
    const b = historical(consultationHistory),
      old = firstSnapshot();
    await submit();
    const saved = store.table("fitSnapshots");
    expect(saved).toHaveLength(2);
    store.attach(b);
    expect(store.table("fitSnapshots")).toEqual(saved);
    expect(store.table("fitSnapshots").find((s) => s.id === old.id)).toEqual(old);
    expect(store.persistence().quarantined).toBe(0);
  });
});
