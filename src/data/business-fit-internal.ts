/** Internal Business Fit service. Canonical prototype identities, feature permissions and row scope on every call. */
import { z } from "zod";
import { can, AccessDeniedError, type FitAction } from "@/domain/permissions";
import {
  QuestionnaireSchema,
  RuleSetSchema,
  QuestionSchema,
  RuleSchema,
  validateDefinition,
  answerText,
  type BusinessFitIntakeRecord,
  type BusinessFitQuestionnaireVersion,
  type BusinessFitRuleSetVersion,
  type BusinessFitAssessmentConversion,
  type FitQuestion,
  type FitRule,
} from "@/domain/business-fit";
import { deepFreeze } from "@/domain/assessment";
import { publicFitCatalog } from "@/integrations/adapters/business-fit";
import type { Ctx } from "./repositories";
import { assessmentStudio } from "./assessment-studio";
import { newId, store } from "./store";
const now = () => new Date().toISOString();
function identity(ctx: Ctx): Ctx {
  const user = store.table("users").find((u) => u.id === ctx.user.id);
  if (!user || JSON.stringify(user) !== JSON.stringify(ctx.user))
    throw new AccessDeniedError("business_fit.read");
  return { user };
}
function authorize(ctx: Ctx, action: FitAction, row?: BusinessFitIntakeRecord) {
  const current = identity(ctx);
  if (!can(current.user, `business_fit.${action}`, row)) {
    store.log({
      actorId: current.user.id,
      organizationId: current.user.organizationId,
      teamId: current.user.teamId,
      ownerId: current.user.id,
      action: `business_fit.${action}`,
      resourceType: "system",
      summary: "Denied Business Fit action",
      outcome: "denied",
    });
    throw new AccessDeniedError(`business_fit.${action}`);
  }
  return current;
}
function intake(ctx: Ctx, id: string, action: FitAction) {
  const row = store.table("fitIntakes").find((x) => x.id === id);
  authorize(ctx, action, row);
  if (!row) throw new Error("Submission unavailable.");
  return row;
}
function linkedSnapshot(row: BusinessFitIntakeRecord) {
  const snapshot = store.table("fitSnapshots").find((s) => s.id === row.snapshotId);
  const contact = store.table("fitConsultations").find((c) => c.id === row.consultationId);
  if (
    !snapshot ||
    !contact ||
    snapshot.organizationId !== row.organizationId ||
    contact.organizationId !== row.organizationId ||
    contact.snapshotId !== snapshot.id ||
    contact.reference !== row.reference
  )
    throw new Error("Submission relationships need recovery.");
  return snapshot;
}
function audit(ctx: Ctx, row: BusinessFitIntakeRecord, action: string, summary: string) {
  store.log({
    actorId: ctx.user.id,
    organizationId: row.organizationId,
    teamId: row.teamId,
    ownerId: row.ownerId,
    action: `business_fit.${action}`,
    resourceType: "system",
    resourceId: row.id,
    summary,
    outcome: "allowed",
  });
}
function persist(ctx: Ctx, row: BusinessFitIntakeRecord, action: string) {
  store.replace(
    "fitIntakes",
    store
      .table("fitIntakes")
      .map((x) => (x.id === row.id ? { ...row, updatedAt: now(), updatedBy: ctx.user.id } : x)),
  );
  audit(ctx, row, action, `Business Fit ${action}`);
}
const conversions = new Map<string, Promise<string>>();
export const businessFitInternal = {
  list(ctx: Ctx) {
    authorize(ctx, "read");
    return store
      .table("fitIntakes")
      .filter((row) => can(ctx.user, "business_fit.read", row))
      .map((row) => {
        const snapshot = linkedSnapshot(row);
        return {
          intake: row,
          businessName: answerText(snapshot.responses["businessName"]),
          industry: answerText(snapshot.responses["industry"]),
          employeeBand: answerText(snapshot.responses["employeeBand"]),
          priorities: answerText(snapshot.responses["priorities"]),
        };
      });
  },
  get(ctx: Ctx, id: string) {
    const row = intake(ctx, id, "read");
    const snapshot = linkedSnapshot(row);
    return {
      intake: row,
      snapshot: deepFreeze(snapshot),
      audit: store
        .audit()
        .filter((a) => a.resourceId === id && a.organizationId === ctx.user.organizationId),
    };
  },
  contact(ctx: Ctx, id: string) {
    const row = intake(ctx, id, "contact");
    linkedSnapshot(row);
    const record = store.table("fitConsultations").find((c) => c.id === row.consultationId);
    if (!record) throw new Error("Contact record needs recovery.");
    return deepFreeze(record);
  },
  note(ctx: Ctx, id: string, body: unknown) {
    const row = intake(ctx, id, "manage");
    const value = z.string().trim().min(1).max(4000).parse(body);
    persist(
      ctx,
      {
        ...row,
        notes: [...row.notes, { id: newId("fit-note"), body: value, by: ctx.user.id, at: now() }],
      },
      "note",
    );
  },
  status(ctx: Ctx, id: string, status: unknown) {
    const row = intake(ctx, id, "manage");
    const value = z.enum(["new", "under_review", "qualified", "closed", "withdrawn"]).parse(status);
    if (row.assessmentId)
      throw new Error("Converted submissions keep their assessment-created status.");
    persist(ctx, { ...row, status: value }, "status");
  },
  people(ctx: Ctx, id: string) {
    const row = intake(ctx, id, "assign");
    return store
      .table("users")
      .filter((u) => u.organizationId === row.organizationId && can(u, "business_fit.read"))
      .map((u) => ({ id: u.id, name: u.name }));
  },
  assign(ctx: Ctx, id: string, userId: string) {
    const row = intake(ctx, id, "assign");
    const target = store
      .table("users")
      .find(
        (u) =>
          u.id === userId && u.organizationId === row.organizationId && can(u, "business_fit.read"),
      );
    if (!target) throw new Error("Choose an eligible professional in this organization.");
    if (ctx.user.affiliation === "partner") throw new AccessDeniedError("business_fit.assign");
    persist(
      ctx,
      { ...row, ownerId: target.id, teamId: target.teamId, assignedUserIds: [target.id] },
      "assign",
    );
  },
  convert(ctx: Ctx, id: string, input: unknown): Promise<string> {
    const d = z
      .strictObject({
        type: z.enum(["tenant", "partner"]),
        confirm: z.literal(true),
        organizationId: z.string(),
      })
      .parse(input);
    const row = intake(ctx, id, "convert");
    if (
      d.organizationId !== ctx.user.organizationId ||
      row.organizationId !== ctx.user.organizationId
    )
      throw new Error("Conversion requires your authorized organization context.");
    if (!["under_review", "qualified", "assessment_created"].includes(row.status))
      throw new Error("Review the submission before creating an assessment.");
    if (!can(ctx.user, "assessment.create") || !can(ctx.user, "assessment.update"))
      throw new AccessDeniedError("assessment.create");
    const prior = store.table("fitConversions").find((c) => c.intakeId === id);
    if (
      prior &&
      (prior.snapshotId !== row.snapshotId || prior.organizationId !== row.organizationId)
    )
      throw new Error("Conversion source needs recovery.");
    if (prior && prior.type !== d.type)
      throw new Error("This conversion is pinned to its original assessment type.");
    if (prior?.state === "complete" && prior.assessmentId)
      return Promise.resolve(prior.assessmentId);
    const pending = conversions.get(id);
    if (pending) return pending;
    const operation = (async () => {
      const original = this.get(ctx, id).snapshot;
      let conversion: BusinessFitAssessmentConversion = prior ?? {
        id: newId("fit-conversion"),
        organizationId: row.organizationId,
        createdAt: now(),
        createdBy: ctx.user.id,
        updatedAt: now(),
        updatedBy: ctx.user.id,
        intakeId: id,
        snapshotId: row.snapshotId,
        type: d.type,
        state: "pending",
        imported: 0,
      };
      const save = () =>
        store.replace("fitConversions", [
          ...store.table("fitConversions").filter((c) => c.id !== conversion.id),
          conversion,
        ]);
      save();
      if (!conversion.assessmentId) {
        intake(ctx, id, "convert");
        const a = await assessmentStudio.create(ctx, {
          type: d.type,
          title: `Business Fit — ${answerText(original.responses["businessName"])}`,
          subjectName: answerText(original.responses["businessName"]),
          channel: "website_self",
          category: "general",
        });
        conversion = { ...conversion, assessmentId: a.id, state: "importing" };
        save();
      }
      const assessmentId = conversion.assessmentId;
      if (!assessmentId) throw new Error("Assessment creation is incomplete.");
      const source = `Business Fit ${row.reference}; snapshot ${original.id}; all imported customer responses are self-reported and unverified.`;
      const tasks: (() => Promise<unknown>)[] = [
        () =>
          assessmentStudio.saveOverview(ctx, assessmentId, {
            purpose: "Professional validation of preliminary Business Fit findings",
            scope: source,
            summary: source,
          }),
        () =>
          assessmentStudio.saveProfile(ctx, assessmentId, {
            businessName: answerText(original.responses["businessName"]),
            industry: answerText(original.responses["industry"]),
            employees: answerText(original.responses["employeeBand"]),
            geography: `${answerText(original.responses["country"])}; locations: ${answerText(original.responses["locations"])}`,
            businessModel: answerText(original.responses["operatingModel"]),
            digitalMaturity: "Self-reported; professional validation required",
          }),
        ...original.systems.map(
          (s) => () =>
            assessmentStudio.upsertChild(ctx, assessmentId, "systems", {
              name: s.name || s.kind,
              category: s.function,
              classification:
                s.kind === "commercial" ||
                s.kind === "custom" ||
                s.kind === "spreadsheet" ||
                s.kind === "manual"
                  ? s.kind
                  : "unknown",
              notes: source,
              apiAvailability: "unknown",
              compatibility: { status: "unknown", evidenceIds: [], note: source },
            }),
        ),
        ...original.report.opportunities.map(
          (o) => () =>
            assessmentStudio.upsertChild(ctx, assessmentId, "requirements", {
              category: "objective",
              statement: `Self-reported desired improvement: ${o.title}. ${source}`,
              basis: "assumption",
              priority: "medium",
            }),
        ),
        ...original.report.dimensions
          .flatMap((dimension) => dimension.gaps)
          .filter((v, i, a) => a.indexOf(v) === i)
          .map(
            (g) => () =>
              assessmentStudio.upsertChild(ctx, assessmentId, "openQuestions", {
                text: `Unverified / information gap: ${g}`,
                resolved: false,
              }),
          ),
        () =>
          assessmentStudio.upsertChild(ctx, assessmentId, "evidence", {
            attribute: "Business Fit customer responses",
            statement: JSON.stringify(original.responses).slice(0, 3500),
            status: "research_finding",
            sources: [{ title: source, sourceType: "interview", retrievedAt: original.createdAt }],
            researchedAt: original.createdAt,
            confidence: {
              level: "unknown",
              reason: "Self-reported and not independently verified",
            },
            verification: { state: "unverified" },
            notes: source,
          }),
      ];
      for (let i = conversion.imported; i < tasks.length; i++) {
        intake(ctx, id, "convert");
        const task = tasks[i];
        if (task) await task();
        conversion = { ...conversion, imported: i + 1, updatedAt: now() };
        save();
      }
      const latest = intake(ctx, id, "convert");
      conversion = { ...conversion, state: "complete" };
      store.batch({
        fitConversions: [
          ...store.table("fitConversions").filter((c) => c.id !== conversion.id),
          conversion,
        ],
        fitIntakes: store.table("fitIntakes").map((r) =>
          r.id === id
            ? {
                ...latest,
                assessmentId,
                status: "assessment_created",
                updatedAt: now(),
                updatedBy: ctx.user.id,
              }
            : r,
        ),
      });
      audit(
        ctx,
        latest,
        "convert",
        `Created unapproved assessment ${assessmentId} from ${original.id}`,
      );
      return assessmentId;
    })();
    conversions.set(id, operation);
    void operation.finally(() => conversions.delete(id)).catch(() => {});
    return operation;
  },
  configuration(ctx: Ctx, kind: "questionnaire" | "rules") {
    authorize(ctx, kind);
    return kind === "questionnaire"
      ? store
          .table("fitQuestionnaires")
          .filter(
            (x) =>
              x.organizationId === "org_public" || x.organizationId === ctx.user.organizationId,
          )
      : store
          .table("fitRules")
          .filter(
            (x) =>
              x.organizationId === "org_public" || x.organizationId === ctx.user.organizationId,
          );
  },
  draftQuestionnaire(ctx: Ctx, sourceId: string) {
    authorize(ctx, "questionnaire");
    const source = store
      .table("fitQuestionnaires")
      .find(
        (x) =>
          x.id === sourceId &&
          (x.organizationId === "org_public" || x.organizationId === ctx.user.organizationId),
      );
    if (!source) throw new Error("Questionnaire unavailable.");
    const at = now();
    const draft: BusinessFitQuestionnaireVersion = {
      ...source,
      id: newId("fit-questionnaire"),
      organizationId: ctx.user.organizationId,
      createdAt: at,
      createdBy: ctx.user.id,
      updatedAt: at,
      updatedBy: ctx.user.id,
      status: "draft",
      version: Math.max(...store.table("fitQuestionnaires").map((q) => q.version)) + 1,
    };
    store.replace("fitQuestionnaires", [...store.table("fitQuestionnaires"), draft]);
    return draft;
  },
  editQuestionnaire(
    ctx: Ctx,
    id: string,
    input: { title: string; description: string; questions: FitQuestion[] },
  ) {
    authorize(ctx, "questionnaire");
    const q = store
      .table("fitQuestionnaires")
      .find((q) => q.id === id && q.organizationId === ctx.user.organizationId);
    if (!q || q.status !== "draft")
      throw new Error("Only your organization’s drafts may be edited.");
    const d = z
      .strictObject({
        title: z.string().min(1).max(4000),
        description: z.string().max(4000),
        questions: z.array(QuestionSchema).min(1).max(100),
      })
      .parse(input);
    const next = QuestionnaireSchema.parse({
      ...q,
      ...d,
      updatedAt: now(),
      updatedBy: ctx.user.id,
    });
    store.replace(
      "fitQuestionnaires",
      store.table("fitQuestionnaires").map((x) => (x.id === id ? next : x)),
    );
  },
  draftRules(ctx: Ctx, sourceId: string, questionnaireVersionId: string) {
    authorize(ctx, "rules");
    const source = store
      .table("fitRules")
      .find(
        (x) =>
          x.id === sourceId &&
          (x.organizationId === "org_public" || x.organizationId === ctx.user.organizationId),
      );
    const q = store
      .table("fitQuestionnaires")
      .find(
        (q) =>
          q.id === questionnaireVersionId &&
          (q.organizationId === "org_public" || q.organizationId === ctx.user.organizationId),
      );
    if (!source || !q) throw new Error("Rule set or questionnaire unavailable.");
    const at = now();
    const draft: BusinessFitRuleSetVersion = {
      ...source,
      id: newId("fit-rules"),
      questionnaireVersionId,
      organizationId: ctx.user.organizationId,
      createdAt: at,
      createdBy: ctx.user.id,
      updatedAt: at,
      updatedBy: ctx.user.id,
      status: "draft",
      version: Math.max(...store.table("fitRules").map((r) => r.version)) + 1,
    };
    store.replace("fitRules", [...store.table("fitRules"), draft]);
    return draft;
  },
  editRules(ctx: Ctx, id: string, input: { name: string; rules: FitRule[] }) {
    authorize(ctx, "rules");
    const r = store
      .table("fitRules")
      .find((r) => r.id === id && r.organizationId === ctx.user.organizationId);
    if (!r || r.status !== "draft")
      throw new Error("Only your organization’s rule drafts may be edited.");
    const d = z
      .strictObject({
        name: z.string().min(1).max(4000),
        rules: z.array(RuleSchema).min(1).max(200),
      })
      .parse(input);
    const next = RuleSetSchema.parse({ ...r, ...d, updatedAt: now(), updatedBy: ctx.user.id });
    store.replace(
      "fitRules",
      store.table("fitRules").map((x) => (x.id === id ? next : x)),
    );
  },
  validate(ctx: Ctx, kind: "questionnaire" | "rules", id: string) {
    authorize(ctx, kind);
    if (kind === "questionnaire") {
      const q = store
        .table("fitQuestionnaires")
        .find(
          (q) =>
            q.id === id &&
            (q.organizationId === "org_public" || q.organizationId === ctx.user.organizationId),
        );
      if (!q) throw new Error("Questionnaire unavailable.");
      return validateDefinition(q);
    }
    const r = store
      .table("fitRules")
      .find(
        (r) =>
          r.id === id &&
          (r.organizationId === "org_public" || r.organizationId === ctx.user.organizationId),
      );
    if (!r) throw new Error("Rule set unavailable.");
    const q = store
      .table("fitQuestionnaires")
      .find(
        (q) =>
          q.id === r.questionnaireVersionId &&
          (q.organizationId === "org_public" || q.organizationId === ctx.user.organizationId),
      );
    if (!q) throw new Error("Referenced questionnaire unavailable.");
    return validateDefinition(q, r, publicFitCatalog());
  },
  publish(ctx: Ctx, kind: "questionnaire" | "rules", id: string) {
    authorize(ctx, kind === "questionnaire" ? "publish_questionnaire" : "publish_rules");
    const problems = this.validate(ctx, kind, id);
    if (problems.length) throw new Error(problems.join("; "));
    if (kind === "questionnaire") {
      const q = store
        .table("fitQuestionnaires")
        .find((x) => x.id === id && x.organizationId === ctx.user.organizationId);
      if (!q || q.status !== "draft") throw new Error("Only a draft can be published.");
      store.replace(
        "fitQuestionnaires",
        store
          .table("fitQuestionnaires")
          .map((x) => (x.id === id ? { ...x, status: "published" } : x)),
      );
    } else {
      const r = store
        .table("fitRules")
        .find((x) => x.id === id && x.organizationId === ctx.user.organizationId);
      if (!r || r.status !== "draft") throw new Error("Only a draft can be published.");
      if (
        !store
          .table("fitQuestionnaires")
          .some((q) => q.id === r.questionnaireVersionId && q.status === "published")
      )
        throw new Error("Publish the referenced questionnaire first.");
      store.replace(
        "fitRules",
        store.table("fitRules").map((x) => (x.id === id ? { ...x, status: "published" } : x)),
      );
    }
  },
  retire(ctx: Ctx, kind: "questionnaire" | "rules", id: string) {
    authorize(ctx, kind === "questionnaire" ? "publish_questionnaire" : "publish_rules");
    if (kind === "questionnaire") {
      const q = store.table("fitQuestionnaires").find((x) => x.id === id);
      if (
        !q ||
        q.status !== "published" ||
        !(q.organizationId === "org_public" || q.organizationId === ctx.user.organizationId)
      )
        throw new Error("Published questionnaire unavailable.");
      store.replace(
        "fitQuestionnaires",
        store
          .table("fitQuestionnaires")
          .map((x) => (x.id === id ? { ...x, status: "retired" } : x)),
      );
    } else {
      const r = store.table("fitRules").find((x) => x.id === id);
      if (
        !r ||
        r.status !== "published" ||
        !(r.organizationId === "org_public" || r.organizationId === ctx.user.organizationId)
      )
        throw new Error("Published rule set unavailable.");
      store.replace(
        "fitRules",
        store.table("fitRules").map((x) => (x.id === id ? { ...x, status: "retired" } : x)),
      );
    }
  },
};
