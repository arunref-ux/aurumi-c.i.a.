/** Regression tests for the Phase 2 targeted corrections (P1-01..P1-04, P2-01, P2-02). */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evidenceToForm, formToEvidenceInput } from "@/components/assessment/evidence-form";
import { assessmentStudio as S, studioConfig } from "@/data/assessment-studio";
import { ValidationError } from "@/data/repositories";
import { seedUsers } from "@/data/seed";
import {
  memoryBackend,
  QUARANTINE_KEY,
  STORAGE_KEY,
  store,
  type PersistenceBackend,
} from "@/data/store";
import type { EvidenceRecord } from "@/domain/assessment";
import { useAssessmentWorkspace } from "@/lib/assessment-queries";
import { SessionProvider } from "@/lib/session";

const u = (id: string) => ({ user: seedUsers.find((x) => x.id === id)! });
const PRO = u("u_pro");
const MGR = u("u_manager");

beforeEach(() => {
  studioConfig.latencyMs = 0;
  store.attach(null);
  store.reset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SOURCES = [
  {
    title: "Vendor docs",
    publisher: "Vendor Ltd (fictional)",
    url: "https://example.com/docs",
    sourceType: "vendor_documentation" as const,
    retrievedAt: "2026-11-01T09:15:42.123Z",
    observedAt: "2026-10-30T00:00:00Z",
  },
  {
    title: "Partner interview",
    sourceType: "interview" as const,
    retrievedAt: "2026-11-02T14:05:00+05:30",
  },
  {
    title: "Catalog entry",
    sourceType: "curated_catalog" as const,
    retrievedAt: "2026-11-03T08:00:00Z",
  },
];
const ev = (over: Record<string, unknown> = {}) => ({
  attribute: "api",
  statement: "Vendor documents a REST API",
  status: "research_finding" as const,
  sources: structuredClone(SOURCES),
  researchedAt: "2026-11-01T10:20:30.456Z",
  confidence: { level: "high" as const, score: 0.82, rationale: "Official docs" },
  verification: { state: "verified" as const, method: "Called vendor" },
  links: [],
  ...over,
});
async function newAssessment() {
  return S.create(PRO, {
    type: "tenant",
    title: "T",
    subjectName: "Biz (fictional)",
    channel: "direct",
  });
}
const getEv = async (aid: string, id: string) =>
  (await S.get(PRO, aid)).workspace.evidence.find((e) => e.id === id)!;

describe("P1-01 verification invalidated by material change", () => {
  it("a different authorized professional editing the claim clears the original verification", async () => {
    const a = await newAssessment();
    const id = await S.upsertChild(PRO, a.id, "evidence", ev());
    expect((await getEv(a.id, id)).verification).toMatchObject({
      state: "verified",
      verifiedBy: "u_pro",
    });
    // Manager edits the claim and echoes back the same verification method.
    await S.upsertChild(MGR, a.id, "evidence", {
      ...ev({ statement: "Vendor has a GraphQL API" }),
      id,
    });
    const e = await getEv(a.id, id);
    expect(e.verification.state).toBe("unverified");
  });
  it("changing a source clears verification and a confirmed fact falls back to reported information", async () => {
    const a = await newAssessment();
    const id = await S.upsertChild(PRO, a.id, "evidence", ev({ status: "confirmed_fact" }));
    const sources = structuredClone(SOURCES);
    sources[1]!.title = "Different interview";
    await S.upsertChild(MGR, a.id, "evidence", {
      ...ev({ status: "confirmed_fact", sources }),
      id,
    });
    const e = await getEv(a.id, id);
    expect(e.verification.state).toBe("unverified");
    expect(e.status).toBe("research_finding");
  });
  it("re-verification is explicit and records the actual verifier and time", async () => {
    const a = await newAssessment();
    const id = await S.upsertChild(PRO, a.id, "evidence", ev());
    await S.upsertChild(MGR, a.id, "evidence", { ...ev({ statement: "Changed" }), id });
    await expect(S.verifyEvidence(MGR, a.id, id, " ")).rejects.toThrow(ValidationError);
    const before = Date.now();
    await S.verifyEvidence(MGR, a.id, id, "Checked vendor portal");
    const e = await getEv(a.id, id);
    expect(e.verification).toMatchObject({
      state: "verified",
      verifiedBy: "u_manager",
      method: "Checked vendor portal",
    });
    expect(
      Date.parse((e.verification as { verifiedAt: string }).verifiedAt),
    ).toBeGreaterThanOrEqual(before - 5);
  });
  it("a notes-only edit by another professional keeps the original verification exactly", async () => {
    const a = await newAssessment();
    const id = await S.upsertChild(PRO, a.id, "evidence", ev());
    const original = (await getEv(a.id, id)).verification;
    await S.upsertChild(MGR, a.id, "evidence", { ...ev({ notes: "Follow up next week" }), id });
    expect((await getEv(a.id, id)).verification).toEqual(original);
  });
  it("dependent connector claims fall back when supporting evidence materially changes", async () => {
    const a = await newAssessment();
    const sys = await S.upsertChild(PRO, a.id, "systems", {
      name: "PMS",
      classification: "commercial",
    });
    const eid = await S.upsertChild(
      PRO,
      a.id,
      "evidence",
      ev({ applicability: "connector_supported", links: [{ kind: "system", id: sys }] }),
    );
    await S.upsertChild(PRO, a.id, "systems", {
      id: sys,
      name: "PMS",
      classification: "commercial",
      compatibility: { status: "supported", evidenceIds: [eid] },
    });
    await S.upsertChild(MGR, a.id, "evidence", {
      ...ev({
        statement: "Edited",
        applicability: "connector_supported",
        links: [{ kind: "system", id: sys }],
      }),
      id: eid,
    });
    const v = await S.get(PRO, a.id);
    expect(v.workspace.systems.find((s) => s.id === sys)!.compatibility.status).toBe("unknown");
  });
});

describe("P1-02 lossless evidence editor", () => {
  it("a notes-only form edit preserves every source, timestamp, score and verification across save/reload cycles", async () => {
    const backend = memoryBackend();
    store.attach(backend);
    const a = await newAssessment();
    const id = await S.upsertChild(PRO, a.id, "evidence", ev());
    const original = await getEv(a.id, id);
    for (let i = 1; i <= 3; i++) {
      const current = await getEv(a.id, id);
      const form = { ...evidenceToForm(current), notes: `note ${i}` };
      await S.upsertChild(MGR, a.id, "evidence", {
        ...formToEvidenceInput(form, current),
        id,
      } as never);
      store.attach(backend); // simulated reload
      const e = await getEv(a.id, id);
      expect(e.notes).toBe(`note ${i}`);
      expect(e.sources).toEqual(SOURCES);
      expect(e.researchedAt).toBe(original.researchedAt);
      expect(e.confidence).toEqual({ level: "high", score: 0.82, rationale: "Official docs" });
      expect(e.verification).toEqual(original.verification);
    }
  });
  it("editing the first source in the form keeps the other sources and its hidden fields", () => {
    const rec = {
      ...ev(),
      id: "ev_x",
      verification: { state: "unverified" },
    } as unknown as EvidenceRecord;
    const out = formToEvidenceInput(
      { ...evidenceToForm(rec), sourceTitle: "Vendor docs v2" },
      rec,
    ) as {
      sources: typeof SOURCES;
    };
    expect(out.sources).toHaveLength(3);
    expect(out.sources[0]).toMatchObject({
      title: "Vendor docs v2",
      publisher: "Vendor Ltd (fictional)",
      observedAt: "2026-10-30T00:00:00Z",
      retrievedAt: "2026-11-01T09:15:42.123Z",
    });
    expect(out.sources.slice(1)).toEqual(SOURCES.slice(1));
  });
});

describe("P1-03 self-contained snapshots", () => {
  it("keeps custom and template question definitions even after the working question is changed or deleted", async () => {
    const a = await newAssessment();
    await S.saveOverview(PRO, a.id, { purpose: "p", scope: "s", primaryContact: "c" });
    await S.saveProfile(PRO, a.id, {
      industry: "Retail",
      geography: "Pune",
      employees: "20",
      businessModel: "B2C",
    });
    await S.upsertChild(PRO, a.id, "systems", { name: "Ledger", classification: "manual" });
    const proc = await S.upsertChild(PRO, a.id, "processes", { name: "Billing" });
    await S.upsertChild(PRO, a.id, "painPoints", { processId: proc, description: "Slow" });
    await S.upsertChild(PRO, a.id, "requirements", {
      category: "workflow",
      statement: "Faster",
      basis: "confirmed",
    });
    await S.upsertChild(PRO, a.id, "evidence", ev());
    await S.saveFindings(PRO, a.id, {
      environment: "e",
      problems: "p",
      opportunities: "o",
      nextSteps: "n",
    });
    for (const q of ["q_goal", "q_pain", "q_systems", "q_decision"])
      await S.saveAnswer(PRO, a.id, { questionId: q, state: "answered", value: "yes" });
    const cq = await S.upsertChild(PRO, a.id, "customQuestions", {
      prompt: "How many franchises?",
      section: "profile",
      required: true,
    });
    await S.saveAnswer(PRO, a.id, { questionId: cq, state: "answered", value: "Three" });
    await S.submitForReview(PRO, a.id);
    const snap = await S.approve(MGR, a.id, "ok");

    expect(snap.questionBank).toEqual({ id: "aurumi.cia.question-bank", version: "1.0.0" });
    const custom = snap.questions.find((q) => q.id === cq)!;
    expect(custom).toMatchObject({
      origin: "custom",
      prompt: "How many franchises?",
      section: "profile",
      category: "general",
      required: true,
      answerType: "free_text",
    });
    expect(custom.answerSchema.states).toEqual(["unanswered", "answered", "not_applicable"]);
    expect(snap.questions.find((q) => q.id === "q_goal")!.template).toEqual({
      bankId: "aurumi.cia.question-bank",
      bankVersion: "1.0.0",
      templateId: "q_goal",
    });
    // Every answer has its definition inside the snapshot.
    for (const ans of snap.answers)
      expect(snap.questions.some((q) => q.id === ans.questionId)).toBe(true);

    await S.reopen(PRO, a.id, "More info");
    await S.upsertChild(PRO, a.id, "customQuestions", {
      id: cq,
      prompt: "Renamed",
      section: "overview",
      required: false,
    });
    await S.removeChild(PRO, a.id, "customQuestions", cq);
    const later = (await S.get(PRO, a.id)).snapshots[0]!;
    expect(later.questions.find((q) => q.id === cq)!.prompt).toBe("How many franchises?");
    expect(later.answers.find((x) => x.questionId === cq)!.value).toBe("Three");
    expect(later.approval.approvedBy).toBe("u_manager");
    expect(later.version).toBe(1);
    expect(Object.isFrozen(later.questions)).toBe(true);
  });
});

describe("P1-04 denied reads settle", () => {
  it("a denied detail query settles without repeated requests or audit events", async () => {
    const spy = vi.spyOn(S, "get");
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>
        <SessionProvider>{children}</SessionProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useAssessmentWorkspace("asm_does_not_exist"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    const calls = spy.mock.calls.length;
    const audits = store.audit().length;
    await new Promise((r) => setTimeout(r, 300));
    expect(spy.mock.calls.length).toBe(calls);
    expect(store.audit().length).toBe(audits);
    expect(result.current.isError).toBe(true);
    expect(calls).toBeLessThanOrEqual(2); // initial fetch plus at most one after storage attach
  });
  it("authorized writes still change the data version", async () => {
    const before = store.dataVersion();
    const a = await newAssessment();
    await S.saveOverview(PRO, a.id, { purpose: "x" });
    expect(store.dataVersion()).toBeGreaterThan(before);
    const mid = store.dataVersion();
    await expect(S.get(u("u_partner_pro"), a.id)).rejects.toThrow();
    expect(store.dataVersion()).toBe(mid);
  });
});

describe("P2-01 connector evidence applicability", () => {
  it("verified evidence about an external API (or unlinked) cannot support a connector claim", async () => {
    const a = await newAssessment();
    const sys = await S.upsertChild(PRO, a.id, "systems", {
      name: "PMS",
      classification: "commercial",
    });
    const other = await S.upsertChild(PRO, a.id, "systems", {
      name: "Other",
      classification: "commercial",
    });
    const api = await S.upsertChild(
      PRO,
      a.id,
      "evidence",
      ev({ applicability: "external_api", links: [{ kind: "system", id: sys }] }),
    );
    const planned = await S.upsertChild(
      PRO,
      a.id,
      "evidence",
      ev({ applicability: "connector_planned", links: [{ kind: "system", id: sys }] }),
    );
    const elsewhere = await S.upsertChild(
      PRO,
      a.id,
      "evidence",
      ev({ applicability: "connector_supported", links: [{ kind: "system", id: other }] }),
    );
    const set = (status: string, ids: string[]) =>
      S.upsertChild(PRO, a.id, "systems", {
        id: sys,
        name: "PMS",
        classification: "commercial",
        compatibility: { status: status as "supported", evidenceIds: ids },
      });
    await expect(set("supported", [api])).rejects.toThrow(ValidationError);
    await expect(set("supported", [planned])).rejects.toThrow(ValidationError); // no promotion
    await expect(set("supported", [elsewhere])).rejects.toThrow(ValidationError); // other system
    await expect(set("planned", [planned])).resolves.toBe(sys);
  });
});

describe("P2-02 restored data hardening", () => {
  it("quarantines malformed rows and child records while keeping valid saved work", async () => {
    const backend = memoryBackend();
    store.attach(backend);
    const a = await newAssessment();
    await S.upsertChild(PRO, a.id, "systems", { name: "Good system", classification: "manual" });
    const saved = JSON.parse(backend.read(STORAGE_KEY)!);
    const ws = saved.tables.workspaces.find(
      (w: { assessmentId: string }) => w.assessmentId === a.id,
    );
    ws.systems.push({ id: "sys_bad", name: 42 });
    ws.evidence = "not a list";
    saved.tables.assessments.push({ id: "broken" });
    saved.tables.snapshots = { nope: true };
    backend.write(STORAGE_KEY, JSON.stringify(saved));

    store.attach(backend);
    const p = store.persistence();
    expect(p.quarantined).toBe(4);
    expect(p.recovery).toMatch(/set aside/);
    const v = await S.get(PRO, a.id);
    expect(v.workspace.systems.map((s) => s.name)).toEqual(["Good system"]);
    expect(v.workspace.evidence).toEqual([]);
    expect(JSON.parse(backend.read(QUARANTINE_KEY)!)).toHaveLength(4);
    expect((await S.list(PRO)).some((x) => x.assessment.id === a.id)).toBe(true);
  });
  it("handles a storage read failure without crashing or overwriting saved work", async () => {
    const writes: string[] = [];
    const failing: PersistenceBackend = {
      kind: "browser",
      read: () => {
        throw new Error("SecurityError");
      },
      write: (k) => void writes.push(k),
    };
    store.attach(failing);
    expect(store.persistence().recovery).toMatch(/could not be read/);
    const a = await newAssessment();
    expect((await S.get(PRO, a.id)).assessment.id).toBe(a.id);
    expect(writes).toEqual([]);
  });
  it("sets aside unreadable saved data instead of crashing", () => {
    const backend = memoryBackend();
    backend.write(STORAGE_KEY, "{not json");
    store.attach(backend);
    expect(store.persistence().recovery).toMatch(/damaged/);
    expect(JSON.parse(backend.read(QUARANTINE_KEY)!)[0].value).toBe("{not json");
  });
});
