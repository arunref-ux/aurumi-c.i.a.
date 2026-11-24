/** Public-only interface. Bearer handles isolate sessions in this browser prototype, not production security. */
import {
  ContactSchema,
  evaluate,
  FIT_SCHEMA,
  FIT_HASH_CONTRACT,
  FIT_EVALUATION,
  effectiveResponses,
  validateDefinition,
  type BusinessFitOperation,
  identifiedSystems,
  SessionSchema,
  SnapshotSchema,
  validateResponses,
  type SessionHandle,
  type BusinessFitSession,
  type FitContact,
} from "@/domain/business-fit";
import {
  sessionValue,
  sessionProblems,
  snapshotValue,
  snapshotProblems,
  intakeRelationshipProblems,
} from "@/domain/business-fit-integrity";
import { evaluateHistorical } from "@/domain/business-fit-historical";
import { deepFreeze } from "@/domain/assessment";
import { businessFitLead, publicFitCatalog } from "@/integrations/adapters/business-fit";
import { newId, store } from "./store";
import { ORG } from "./seed";
const now = () => new Date().toISOString();
const stamp = (id: string, organizationId = "org_public", by = "anonymous") => {
  const at = now();
  return { id, organizationId, createdAt: at, createdBy: by, updatedAt: at, updatedBy: by };
};
const locked = new Map<
  string,
  Promise<{ reference: string; leadReference: string; simulated: true }>
>();
function session(handle: SessionHandle): BusinessFitSession {
  const s = store.table("fitSessions").find((s) => s.id === handle.id && s.token === handle.token);
  if (!s) throw new Error("This Business Fit session is unavailable. Start a new check.");
  const parsed = SessionSchema.parse(s);
  const problems = sessionProblems(parsed);
  if (problems.length) throw new Error(problems.join("; "));
  return parsed;
}
function save(s: BusinessFitSession) {
  store.replace(
    "fitSessions",
    store.table("fitSessions").map((x) => (x.id === s.id ? s : x)),
  );
}
export const businessFitPublic = {
  begin(): SessionHandle {
    const q = store
      .table("fitQuestionnaires")
      .filter((q) => q.status === "published")
      .sort((a, b) => b.version - a.version)
      .find((q) =>
        store
          .table("fitRules")
          .some(
            (r) =>
              r.status === "published" &&
              r.questionnaireVersionId === q.id &&
              !validateDefinition(q, r, publicFitCatalog()).length,
          ),
      );
    if (!q) throw new Error("No published Business Fit questionnaire is available.");
    const rules = store
      .table("fitRules")
      .filter(
        (r) =>
          r.status === "published" &&
          r.questionnaireVersionId === q.id &&
          !validateDefinition(q, r, publicFitCatalog()).length,
      )
      .sort((a, b) => b.version - a.version)[0];
    if (!rules) throw new Error("No published recommendation rules are available.");
    const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
    const s = SessionSchema.parse({
      ...stamp(newId("fit-session")),
      token,
      questionnaire: q,
      rules,
      catalog: publicFitCatalog(),
      responses: {},
      evaluationContract: FIT_EVALUATION,
      step: 0,
    });
    store.replace("fitSessions", [...store.table("fitSessions"), s]);
    return { id: s.id, token };
  },
  get(handle: SessionHandle) {
    const s = session(handle);
    if (s.consultationId) {
      const row = store.table("fitIntakes").find((r) => r.consultationId === s.consultationId);
      if (!row) throw new Error("Consultation relationships need recovery.");
      const problems = intakeRelationshipProblems(row, {
        fitSnapshots: store.table("fitSnapshots"),
        fitConsultations: store.table("fitConsultations"),
        fitOperations: store.table("fitOperations"),
      } as import("./store").Tables);
      if (problems.length) throw new Error(problems.join("; "));
    }
    return deepFreeze(s);
  },
  save(handle: SessionHandle, responses: unknown, step: number) {
    const s = session(handle);
    if (s.report || s.consultationId)
      throw new Error("This report is frozen. Start a new Business Fit check to change responses.");
    save(
      SessionSchema.parse({
        ...s,
        responses: validateResponses(s.questionnaire, responses),
        step,
        updatedAt: now(),
      }),
    );
  },
  move(handle: SessionHandle, direction: "next" | "previous") {
    const s = session(handle);
    if (s.report) throw new Error("Report already generated.");
    if (direction === "next") validateResponses(s.questionnaire, s.responses, s.step);
    const step = Math.max(0, Math.min(4, s.step + (direction === "next" ? 1 : -1)));
    save({ ...s, step });
    return step;
  },
  generate(handle: SessionHandle) {
    const s = session(handle);
    if (s.report) return deepFreeze(s.report);
    for (let i = 0; i < 4; i++) validateResponses(s.questionnaire, s.responses, i);
    const report = (s.evaluationContract === FIT_EVALUATION ? evaluate : evaluateHistorical)(
      s.responses,
      s.questionnaire,
      s.rules,
      s.catalog,
      stamp(newId("fit-report")),
    );
    save({ ...s, report, step: 4, updatedAt: now() });
    return deepFreeze(report);
  },
  clear(handle: SessionHandle) {
    session(handle);
    store.replace(
      "fitSessions",
      store.table("fitSessions").filter((s) => s.id !== handle.id),
    );
  },
  async consult(handle: SessionHandle, input: unknown) {
    const contact: FitContact = ContactSchema.parse(input);
    const s = session(handle);
    if (!s.report) throw new Error("Generate your report before requesting a consultation.");
    if (s.consultationId) {
      const existing = store.table("fitConsultations").find((c) => c.id === s.consultationId);
      const row = store.table("fitIntakes").find((r) => r.consultationId === s.consultationId);
      if (!existing || !row) throw new Error("Consultation reference needs recovery.");
      const problems = intakeRelationshipProblems(row, {
        fitSnapshots: store.table("fitSnapshots"),
        fitConsultations: store.table("fitConsultations"),
        fitOperations: store.table("fitOperations"),
      } as import("./store").Tables);
      if (problems.length) throw new Error(problems.join("; "));
      return Promise.resolve({
        reference: existing.reference,
        leadReference: existing.leadReference,
        simulated: true as const,
      });
    }
    const pending = locked.get(s.id);
    if (pending) return pending;
    const operation = (async () => {
      if (s.evaluationContract !== FIT_EVALUATION)
        throw new Error(
          "This historical report is preserved. Start a new check before a new consultation.",
        );
      const sourceValue = sessionValue(s);
      const opId = `fit-consult:${ORG}:${s.id}`;
      let intent: BusinessFitOperation | undefined = store
        .table("fitOperations")
        .find((o) => o.id === opId);
      if (
        intent &&
        (intent.sourceValue !== sourceValue ||
          JSON.stringify(intent.contact) !== JSON.stringify(contact))
      )
        throw new Error(
          "The pending request is pinned to its original report and consent. Retry with the original details.",
        );
      if (!intent) {
        const submissionId = newId("fit-submission");
        intent = {
          ...stamp(opId, ORG),
          kind: "consultation",
          sessionId: s.id,
          sourceValue,
          snapshotId: newId("fit-snapshot"),
          consultationId: newId("fit-consult"),
          intakeId: newId("fit-intake"),
          submissionId,
          reference: `BF-${submissionId.slice(-8).toUpperCase()}`,
          contact,
          state: "pending",
        };
        const initial = intent;
        // No adapter invocation until this intent is acknowledged by storage.
        store.durable(() =>
          store.batch({ fitOperations: [...store.table("fitOperations"), initial] }),
        );
      }
      let leadReference = intent.leadReference;
      if (!leadReference) {
        const result = await businessFitLead.createOrAssociate(intent.id, intent.contact);
        if (!result.ok) throw new Error(result.error);
        leadReference = result.data.reference;
        intent = { ...intent, leadReference, state: "lead_created" };
        const leadIntent = intent;
        store.durable(() =>
          store.batch({
            fitOperations: store
              .table("fitOperations")
              .map((o) => (o.id === leadIntent.id ? leadIntent : o)),
          }),
        );
      }
      const current = session(handle);
      if (sessionValue(current) !== sourceValue || !current.report)
        throw new Error("The session changed while submitting. Please retry.");
      const effective = effectiveResponses(s.questionnaire, s.responses);
      const draft = SnapshotSchema.parse({
        ...stamp(intent.snapshotId, ORG),
        schema: FIT_SCHEMA,
        integrityContract: FIT_HASH_CONTRACT,
        submissionId: intent.submissionId,
        operationId: intent.id,
        sessionId: s.id,
        questionnaire: s.questionnaire,
        rules: s.rules,
        responses: s.responses,
        effectiveResponses: effective,
        businessContext: effective,
        systems: identifiedSystems(effective),
        report: current.report,
        provenance: "self-reported-unverified",
      });
      const snapshot = SnapshotSchema.parse({ ...draft, integrityValue: snapshotValue(draft) });
      const problems = snapshotProblems(snapshot);
      if (problems.length) throw new Error(problems.join("; "));
      const consultation = {
        ...stamp(intent.consultationId, ORG),
        snapshotId: snapshot.id,
        operationId: intent.id,
        reference: intent.reference,
        contact: intent.contact,
        consentAt: intent.createdAt,
        leadReference,
        integrationStatus: "simulated" as const,
      };
      const intake = {
        ...stamp(intent.intakeId, ORG),
        ownerId: "queue_business_fit",
        teamId: "team_advisory",
        assignedUserIds: [],
        snapshotId: snapshot.id,
        consultationId: consultation.id,
        operationId: intent.id,
        reference: intent.reference,
        status: "new" as const,
        notes: [],
        revision: 0,
      };
      const completed = { ...intent, state: "complete" as const, leadReference };
      store.durable(() =>
        store.batch({
          fitSnapshots: [...store.table("fitSnapshots"), snapshot],
          fitConsultations: [...store.table("fitConsultations"), consultation],
          fitIntakes: [...store.table("fitIntakes"), intake],
          fitOperations: store
            .table("fitOperations")
            .map((o) => (o.id === completed.id ? completed : o)),
          fitSessions: store
            .table("fitSessions")
            .map((x) =>
              x.id === s.id ? { ...current, consultationId: consultation.id, updatedAt: now() } : x,
            ),
        }),
      );
      return { reference: intent.reference, leadReference, simulated: true as const };
    })();
    locked.set(s.id, operation);
    void operation.finally(() => locked.delete(s.id)).catch(() => {});
    return operation;
  },
};
