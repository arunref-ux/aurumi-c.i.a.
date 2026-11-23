/** Overview, profile, partner, findings and question sections of the assessment workspace. */
import { useState } from "react";
import { Panel, StatusPill } from "@/components/app/ui-bits";
import type { WorkspaceView } from "@/data/assessment-studio";
import { BUSINESS_CATEGORIES, QUESTION_BANK } from "@/data/question-bank";
import {
  FINDING_FIELDS,
  PARTNER_FIELDS,
  PROFILE_FIELDS,
  questionsFor,
  type AnswerState,
  type SectionKey,
} from "@/domain/assessment";
import { useStudioMutation } from "@/lib/assessment-queries";
import { CollectionEditor } from "./collection-editor";
import { btnGhost, btnPrimary, ErrorNote, MultiField, SelectField, TextField } from "./fields";
import { FormSection } from "./form-section";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const TYPE_LABEL = { tenant: "Tenant / Business", partner: "Partner / Opportunity" } as const;

export function OverviewSection({ view }: { view: WorkspaceView }) {
  const { assessment: a, workspace: ws, permissions, names } = view;
  const save = useStudioMutation((s) => s.saveOverview);
  const oq = useStudioMutation((s) => s.upsertChild);
  const rm = useStudioMutation((s) => s.removeChild);
  return (
    <div className="flex flex-col gap-6">
      <Panel title="Assessment">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            [
              "Assessment ID",
              <code key="id" className="font-mono text-xs">
                {a.id}
              </code>,
            ],
            ["Type", TYPE_LABEL[a.type]],
            ["Organization / business", a.subjectName],
            [
              "Assigned professional",
              [a.ownerId, ...a.assignedUserIds].map((u) => names[u] ?? "Colleague").join(", "),
            ],
            ["Status", a.status.replace("_", " ")],
            ["CRM reference", a.crmReferenceId ?? "Not linked"],
            ["Created", fmt(a.createdAt)],
            ["Last updated", fmt(a.updatedAt)],
            ["Completeness", `${view.completeness}%`],
          ].map(([k, v]) => (
            <div key={String(k)}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="mt-0.5">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      <AssignmentPanel view={view} />
      <Panel title="Purpose, scope & summary">
        <FormSection
          key={`${a.id}-${ws.updatedAt}`}
          columns={1}
          canEdit={permissions.canEdit}
          fields={[
            ["primaryContact", "Primary contact or stakeholder"],
            ["purpose", "Purpose"],
            ["scope", "Scope"],
            ["summary", "Assessment summary"],
          ]}
          initial={ws.overview}
          onSave={(v) => save.mutateAsync([a.id, v])}
        />
      </Panel>
      <Panel title="Outstanding questions">
        <CollectionEditor
          items={ws.openQuestions}
          canEdit={permissions.canEdit}
          emptyTitle="No outstanding questions"
          emptyBody="Note anything you still need to ask the business."
          addLabel="Add question"
          itemLabel={(q) => q.text}
          fields={[
            { key: "text", label: "Question", kind: "text", required: true, wide: true },
            { key: "resolved", label: "Resolved", kind: "bool" },
          ]}
          blank={() => ({ text: "", resolved: false })}
          summary={(q) => (
            <p className="text-sm">
              {q.resolved ? (
                <StatusPill tone="success">Resolved</StatusPill>
              ) : (
                <StatusPill tone="warning">Open</StatusPill>
              )}{" "}
              {q.text}
            </p>
          )}
          onSave={(d) => oq.mutateAsync([a.id, "openQuestions", d as never])}
          onRemove={(id) => rm.mutateAsync([a.id, "openQuestions", id])}
        />
      </Panel>
    </div>
  );
}

function AssignmentPanel({ view }: { view: WorkspaceView }) {
  const { assessment: a, permissions } = view;
  const assign = useStudioMutation((s) => s.assign);
  const candidates = useStudioMutation((s) => s.assigneeCandidates);
  const link = useStudioMutation((s) => s.linkCrm);
  const [people, setPeople] = useState<Record<string, string> | null>(null);
  const [assignees, setAssignees] = useState(a.assignedUserIds);
  const [crmId, setCrmId] = useState(a.crmReferenceId ?? "crm_org_1");
  if (!permissions.canAssign && !permissions.canEdit) return null;
  return (
    <Panel title="Assignment & CRM link">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          {permissions.canAssign ? (
            people ? (
              <>
                <MultiField
                  label="Assigned professionals"
                  value={assignees}
                  options={people}
                  onChange={setAssignees}
                />
                <div>
                  <button
                    className={btnPrimary}
                    disabled={assign.isPending}
                    onClick={() => assign.mutate([a.id, { assignedUserIds: assignees }])}
                  >
                    Save assignment
                  </button>
                </div>
                <ErrorNote error={assign.error} />
              </>
            ) : (
              <div>
                <button
                  className={btnGhost}
                  onClick={async () => {
                    const list = await candidates.mutateAsync([a.id]);
                    setPeople(Object.fromEntries(list.map((p) => [p.id, p.name])));
                  }}
                >
                  Change assigned professionals
                </button>
                <ErrorNote error={candidates.error} />
              </div>
            )
          ) : (
            <p className="text-xs text-muted-foreground">
              You can edit this assessment but not reassign it.
            </p>
          )}
        </div>
        {permissions.canEdit && (
          <div className="flex flex-col gap-2">
            <TextField
              label="ShopTalk CRM record (mock)"
              value={crmId}
              onChange={setCrmId}
              help="Links to an existing lead, contact or deal. Contact details stay in the CRM."
            />
            <div>
              <button
                className={btnGhost}
                disabled={link.isPending}
                onClick={() => link.mutate([a.id, crmId])}
              >
                {link.isPending ? "Linking…" : "Link CRM record"}
              </button>
            </div>
            <ErrorNote error={link.error} />
          </div>
        )}
      </div>
    </Panel>
  );
}

export function ProfileSection({ view }: { view: WorkspaceView }) {
  const { assessment: a, workspace: ws, permissions } = view;
  const save = useStudioMutation((s) => s.saveProfile);
  const { unknown, ...values } = ws.profile;
  return (
    <Panel title="Business profile">
      <p className="mb-4 text-xs text-muted-foreground">
        Leave a field blank if it hasn't been assessed yet, or mark it Unknown. Never fill gaps with
        guesses.
      </p>
      <FormSection
        key={`${a.id}-${ws.updatedAt}`}
        fields={PROFILE_FIELDS}
        initial={values}
        initialUnknown={unknown}
        unknownable
        canEdit={permissions.canEdit}
        onSave={(v, u) => save.mutateAsync([a.id, { ...v, unknown: u }])}
      />
    </Panel>
  );
}

export function PartnerSection({ view }: { view: WorkspaceView }) {
  const { assessment: a, workspace: ws, permissions } = view;
  const save = useStudioMutation((s) => s.savePartner);
  if (a.type !== "partner" || !ws.partner) return null;
  const { relationshipStatus: _r, ...values } = ws.partner;
  return (
    <Panel title="Partner / opportunity details">
      <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-xs">
        Prospective partner. No partnership, connector or commercial agreement exists unless
        verified separately. Commercial terms are managed in Pricing Studio, not here.
      </p>
      <FormSection
        key={`${a.id}-${ws.updatedAt}`}
        fields={PARTNER_FIELDS}
        initial={values}
        canEdit={permissions.canEdit}
        onSave={(v) => save.mutateAsync([a.id, v])}
      />
    </Panel>
  );
}

export function FindingsSection({ view }: { view: WorkspaceView }) {
  const { assessment: a, workspace: ws, permissions } = view;
  const save = useStudioMutation((s) => s.saveFindings);
  return (
    <Panel title="Findings & assessment summary">
      <p className="mb-4 text-xs text-muted-foreground">
        Professional summary of what you found. Solution design and commercial proposals come in
        later studios.
      </p>
      <FormSection
        key={`${a.id}-${ws.updatedAt}`}
        columns={1}
        fields={FINDING_FIELDS}
        initial={ws.findings}
        canEdit={permissions.canEdit}
        onSave={(v) => save.mutateAsync([a.id, v])}
      />
    </Panel>
  );
}

const SECTION_LABEL: Partial<Record<SectionKey, string>> = {
  overview: "Overview",
  profile: "Business profile",
  partner: "Partner details",
  systems: "Software & systems",
  processes: "Processes",
  requirements: "Requirements",
  evidence: "Evidence",
  findings: "Findings",
};

export function QuestionsSection({ view }: { view: WorkspaceView }) {
  const { assessment: a, workspace: ws, permissions, names } = view;
  const saveOverview = useStudioMutation((s) => s.saveOverview);
  const addQ = useStudioMutation((s) => s.upsertChild);
  const rm = useStudioMutation((s) => s.removeChild);
  const qs = questionsFor(ws, a.type, QUESTION_BANK);
  return (
    <div className="flex flex-col gap-6">
      <Panel title="Question template">
        <div className="max-w-xs">
          <SelectField
            label="Business category"
            value={ws.category}
            options={BUSINESS_CATEGORIES}
            disabled={!permissions.canEdit}
            help="Adds category-specific questions to the general set."
            onChange={(category) => saveOverview.mutate([a.id, { category }])}
          />
        </div>
        <ErrorNote error={saveOverview.error} />
      </Panel>
      <Panel title={`Questions (${qs.length})`}>
        <ul className="flex flex-col gap-3">
          {qs.map((q) => (
            <QuestionRow
              key={q.id}
              assessmentId={a.id}
              question={q}
              answer={ws.answers.find((x) => x.questionId === q.id)}
              canEdit={permissions.canEdit}
              names={names}
              isCustom={"createdAt" in q}
            />
          ))}
        </ul>
      </Panel>
      <Panel title="Custom questions">
        <CollectionEditor
          items={ws.customQuestions}
          canEdit={permissions.canEdit}
          emptyTitle="No custom questions"
          addLabel="Add custom question"
          itemLabel={(q) => q.prompt}
          fields={[
            { key: "prompt", label: "Question", kind: "text", required: true, wide: true },
            {
              key: "section",
              label: "Linked section",
              kind: "select",
              options: SECTION_LABEL as Record<string, string>,
            },
            { key: "required", label: "Required before approval", kind: "bool" },
          ]}
          blank={() => ({ prompt: "", section: "overview", required: false })}
          toInput={(v) => ({ ...v, category: ws.category })}
          summary={(q) => (
            <p className="text-sm">
              {q.prompt}{" "}
              <span className="text-xs text-muted-foreground">· {SECTION_LABEL[q.section]}</span>
            </p>
          )}
          onSave={(d) => addQ.mutateAsync([a.id, "customQuestions", d as never])}
          onRemove={(id) => rm.mutateAsync([a.id, "customQuestions", id])}
        />
      </Panel>
    </div>
  );
}

function QuestionRow({
  assessmentId,
  question,
  answer,
  canEdit,
  names,
  isCustom,
}: {
  assessmentId: string;
  question: { id: string; prompt: string; section: SectionKey; required: boolean };
  answer: WorkspaceView["workspace"]["answers"][number] | undefined;
  canEdit: boolean;
  names: Record<string, string>;
  isCustom: boolean;
}) {
  const save = useStudioMutation((s) => s.saveAnswer);
  const verify = useStudioMutation((s) => s.verifyAnswer);
  const [state, setState] = useState<AnswerState>(answer?.state ?? "unanswered");
  const [value, setValue] = useState(answer?.value ?? "");
  const dirty = state !== (answer?.state ?? "unanswered") || value !== (answer?.value ?? "");
  return (
    <li className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm font-medium">
          {question.prompt}
          {question.required && <span className="text-destructive"> *</span>}
        </p>
        <span className="text-[11px] text-muted-foreground">
          {SECTION_LABEL[question.section]}
          {isCustom ? " · custom" : ""}
        </span>
      </div>
      <div
        className="mt-2 flex flex-wrap gap-3 text-xs"
        role="radiogroup"
        aria-label="Answer state"
      >
        {(["unanswered", "answered", "not_applicable"] as const).map((s) => (
          <label key={s} className="flex items-center gap-1">
            <input
              type="radio"
              name={`st-${question.id}`}
              checked={state === s}
              disabled={!canEdit}
              onChange={() => setState(s)}
            />
            {s === "not_applicable" ? "Not applicable" : s[0]!.toUpperCase() + s.slice(1)}
          </label>
        ))}
      </div>
      {state === "answered" && (
        <textarea
          aria-label={`Answer: ${question.prompt}`}
          className="mt-2 w-full rounded-md border bg-card px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          rows={2}
          value={value}
          disabled={!canEdit}
          onChange={(e) => setValue(e.target.value)}
        />
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {canEdit && (
          <button
            className={btnGhost}
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate([assessmentId, { questionId: question.id, state, value }])}
          >
            Save answer
          </button>
        )}
        {answer?.answeredBy && <span>Answered by {names[answer.answeredBy] ?? "Colleague"}</span>}
        {answer?.verifiedBy ? (
          <StatusPill tone="success">
            Verified by {names[answer.verifiedBy] ?? "Colleague"}
          </StatusPill>
        ) : (
          answer?.state === "answered" &&
          canEdit && (
            <button className={btnGhost} onClick={() => verify.mutate([assessmentId, question.id])}>
              Mark verified
            </button>
          )
        )}
      </div>
      <ErrorNote error={save.error ?? verify.error} />
    </li>
  );
}
