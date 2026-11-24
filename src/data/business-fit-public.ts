/** Public-only interface. Bearer handles isolate sessions in this browser prototype, not production security. */
import {
  ContactSchema,
  evaluate,
  FIT_SCHEMA,
  identifiedSystems,
  SessionSchema,
  SnapshotSchema,
  validateResponses,
  type SessionHandle,
  type BusinessFitSession,
  type FitContact,
} from "@/domain/business-fit";
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
  return SessionSchema.parse(s);
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
          .some((r) => r.status === "published" && r.questionnaireVersionId === q.id),
      );
    if (!q) throw new Error("No published Business Fit questionnaire is available.");
    const rules = store
      .table("fitRules")
      .filter((r) => r.status === "published" && r.questionnaireVersionId === q.id)
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
      step: 0,
    });
    store.replace("fitSessions", [...store.table("fitSessions"), s]);
    return { id: s.id, token };
  },
  get(handle: SessionHandle) {
    return deepFreeze(session(handle));
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
    const report = evaluate(
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
      if (!existing) throw new Error("Consultation reference needs recovery.");
      return Promise.resolve({
        reference: existing.reference,
        leadReference: existing.leadReference,
        simulated: true as const,
      });
    }
    const pending = locked.get(s.id);
    if (pending) return pending;
    const operation = (async () => {
      const fingerprint = JSON.stringify(s);
      const result = await businessFitLead.createOrAssociate(s.id, contact);
      if (!result.ok) throw new Error(result.error);
      const current = session(handle);
      if (JSON.stringify(current) !== fingerprint)
        throw new Error("The session changed while submitting. Please retry.");
      if (!current.report) throw new Error("Report unavailable.");
      const snapshotId = newId("fit-snapshot"),
        consultationId = newId("fit-consult"),
        submissionId = newId("fit-submission"),
        reference = `BF-${submissionId.slice(-8).toUpperCase()}`;
      const snapshot = SnapshotSchema.parse({
        ...stamp(snapshotId, ORG),
        schema: FIT_SCHEMA,
        submissionId,
        questionnaire: s.questionnaire,
        rules: s.rules,
        responses: s.responses,
        systems: identifiedSystems(s.responses),
        report: current.report,
        provenance: "self-reported-unverified",
      });
      const consultation = {
        ...stamp(consultationId, ORG),
        snapshotId,
        reference,
        contact,
        consentAt: now(),
        leadReference: result.data.reference,
        integrationStatus: "simulated" as const,
      };
      // Intake organization/initial queue are configured by the prototype, never supplied by respondents.
      const intake = {
        ...stamp(newId("fit-intake"), ORG),
        ownerId: "queue_business_fit",
        teamId: "team_advisory",
        assignedUserIds: [],
        snapshotId,
        consultationId,
        reference,
        status: "new" as const,
        notes: [],
      };
      store.batch({
        fitSnapshots: [...store.table("fitSnapshots"), snapshot],
        fitConsultations: [...store.table("fitConsultations"), consultation],
        fitIntakes: [...store.table("fitIntakes"), intake],
        fitSessions: store
          .table("fitSessions")
          .map((x) => (x.id === s.id ? { ...current, consultationId, updatedAt: now() } : x)),
      });
      return { reference, leadReference: result.data.reference, simulated: true as const };
    })();
    locked.set(s.id, operation);
    void operation.finally(() => locked.delete(s.id)).catch(() => {});
    return operation;
  },
};
