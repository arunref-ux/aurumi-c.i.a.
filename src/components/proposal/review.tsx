/** Proposal Studio H–J: review & approval, issue/share/responses, version history. */
import { useState } from "react";
import { Panel, StatusPill, type Tone } from "@/components/app/ui-bits";
import {
  btnGhost,
  btnPrimary,
  ErrorNote,
  SelectField,
  TextField,
} from "@/components/assessment/fields";
import type { ProposalView } from "@/data/proposal-studio";
import {
  DELIVERABLE_CLASSES,
  RESPONSES,
  versionState,
  type ShareResponse,
  type VersionState,
} from "@/domain/proposal";
import { useProposalMutation } from "@/lib/proposal-queries";
import { ProposalPreview } from "./preview";
import { ReadinessList } from "./sections";

const VS_TONE: Record<VersionState, Tone> = {
  submitted: "warning",
  approved: "success",
  changes_requested: "danger",
  issued: "gold",
  superseded: "neutral",
};
const VS_LABEL: Record<VersionState, string> = {
  submitted: "Submitted — awaiting review",
  approved: "Approved (not issued)",
  changes_requested: "Changes requested",
  issued: "Issued",
  superseded: "Superseded",
};

// ---------- H. Review ----------
export function ReviewSection({ view }: { view: ProposalView }) {
  const p = view.proposal;
  const cur = view.versions.find((v) => v.id === p.currentVersionId);
  const submit = useProposalMutation((s) => s.submitForReview);
  const approve = useProposalMutation((s) => s.approve);
  const changes = useProposalMutation((s) => s.requestChanges);
  const comment = useProposalMutation((s) => s.addComment);
  const [note, setNote] = useState("");
  const [ack, setAck] = useState<string[]>([]);
  const quals = cur
    ? [
        ...cur.document.deliverables
          .filter((d) => d.info.needsQualification)
          .map((d) => ({
            id: d.id,
            text: `${d.description} — ${DELIVERABLE_CLASSES[d.info.classification]}: ${d.qualification || "no qualification"}`,
          })),
        ...cur.document.risks
          .filter((r) => r.resolution === "accepted")
          .map((r) => ({ id: r.id, text: `Accepted risk: ${r.description} (${r.qualification})` })),
      ]
    : [];
  return (
    <div className="flex flex-col gap-6">
      <ReadinessList view={view} />
      {view.permissions.canSubmit && (
        <Panel title="Submit for internal review">
          <p className="mb-2 text-xs text-muted-foreground">
            Submitting freezes this exact draft as a new version. The reviewer approves that
            version, not the proposal in general.
          </p>
          <button
            className={btnPrimary}
            disabled={view.readinessPercent < 100 || submit.isPending}
            onClick={() => submit.mutate([p.id])}
          >
            Submit version {(view.versions[0]?.versionNumber ?? 0) + 1}
          </button>
          <ErrorNote error={submit.error} />
        </Panel>
      )}
      {cur && p.status === "in_review" && (
        <Panel title={`Version ${cur.versionNumber} under review`}>
          <p className="mb-2 text-xs text-muted-foreground">Content hash {cur.contentHash}</p>
          {view.permissions.canApprove ? (
            <div className="flex flex-col gap-3">
              {quals.length > 0 && (
                <fieldset className="flex flex-col gap-1">
                  <legend className="mb-1 text-xs font-medium">
                    Acknowledge each qualification
                  </legend>
                  {quals.map((q) => (
                    <label key={q.id} className="flex items-start gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={ack.includes(q.id)}
                        onChange={(e) =>
                          setAck((a) =>
                            e.target.checked ? [...a, q.id] : a.filter((x) => x !== q.id),
                          )
                        }
                      />
                      {q.text}
                    </label>
                  ))}
                </fieldset>
              )}
              <TextField label="Review comment" multiline value={note} onChange={setNote} />
              <div className="flex flex-wrap gap-2">
                <button
                  className={btnPrimary}
                  disabled={approve.isPending}
                  onClick={() =>
                    approve.mutate([p.id, cur.id, { comment: note, acknowledged: ack }])
                  }
                >
                  Approve version {cur.versionNumber}
                </button>
                <button
                  className={btnGhost}
                  disabled={changes.isPending}
                  onClick={() => changes.mutate([p.id, cur.id, note])}
                >
                  Request changes
                </button>
              </div>
              <ErrorNote error={approve.error ?? changes.error} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Waiting for a reviewer who is not the author or an assignee.
            </p>
          )}
        </Panel>
      )}
      <Panel title="Review comments">
        <ul className="mb-3 flex flex-col gap-2 text-sm">
          {view.workspace.comments.length === 0 && (
            <li className="text-muted-foreground">No comments yet.</li>
          )}
          {view.workspace.comments.map((c) => (
            <li key={c.id}>
              <span className="text-xs text-muted-foreground">
                {view.names[c.createdBy] ?? c.createdBy} · {c.kind.replace("_", " ")} ·{" "}
                {c.createdAt.slice(0, 16).replace("T", " ")}
              </span>
              <p>{c.body}</p>
            </li>
          ))}
        </ul>
        <CommentBox onSend={(b) => comment.mutateAsync([p.id, b])} />
        <ErrorNote error={comment.error} />
      </Panel>
      <RebasePanel view={view} />
    </div>
  );
}
function CommentBox({ onSend }: { onSend: (b: string) => Promise<unknown> }) {
  const [b, setB] = useState("");
  return (
    <div className="flex gap-2">
      <input
        aria-label="Comment"
        className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
        value={b}
        onChange={(e) => setB(e.target.value)}
      />
      <button
        className={btnGhost}
        disabled={!b.trim()}
        onClick={() => void onSend(b).then(() => setB(""))}
      >
        Comment
      </button>
    </div>
  );
}
function RebasePanel({ view }: { view: ProposalView }) {
  const preview = useProposalMutation((s) => s.previewRebase);
  const rebase = useProposalMutation((s) => s.rebase);
  const [reason, setReason] = useState("");
  if (!view.newerSource) return null;
  const d = preview.data;
  return (
    <Panel title={`Newer approved solution (v${view.newerSource.version})`}>
      <p className="mb-2 text-xs text-muted-foreground">
        This proposal stays on v{view.proposal.source.solutionSnapshotVersion} until you rebase. The
        current working revision is preserved.
      </p>
      <button
        className={btnGhost}
        onClick={() => preview.mutate([view.proposal.id, view.newerSource!.id])}
      >
        Show what changed
      </button>
      {d && (
        <ul className="mt-2 list-disc pl-5 text-xs">
          {d.added.map((x) => (
            <li key={x.id}>Added: {x.title}</li>
          ))}
          {d.removed.map((x) => (
            <li key={x.id}>Removed: {x.title}</li>
          ))}
          {d.changed.map((x) => (
            <li key={x.id}>
              {x.title}: {x.changes.join("; ")}
            </li>
          ))}
          {d.integrationChanges.map((x) => (
            <li key={x}>{x}</li>
          ))}
          {d.newRisks.map((x) => (
            <li key={x}>New risk: {x}</li>
          ))}
          {d.affectedDeliverables.length > 0 && (
            <li>{d.affectedDeliverables.length} deliverable(s) affected</li>
          )}
        </ul>
      )}
      {view.permissions.canRebase && (
        <div className="mt-3 flex flex-col gap-2">
          <TextField label="Reason for rebasing" value={reason} onChange={setReason} />
          <button
            className={btnPrimary}
            disabled={!reason.trim()}
            onClick={() => rebase.mutate([view.proposal.id, view.newerSource!.id, reason])}
          >
            Rebase to v{view.newerSource.version}
          </button>
        </div>
      )}
      <ErrorNote error={preview.error ?? rebase.error} />
    </Panel>
  );
}

// ---------- I. Issue, share & responses ----------
export function ShareSection({ view }: { view: ProposalView }) {
  const p = view.proposal;
  const cur = view.versions.find((v) => v.id === p.currentVersionId);
  const issue = useProposalMutation((s) => s.issue);
  const share = useProposalMutation((s) => s.share);
  const respond = useProposalMutation((s) => s.recordResponse);
  const revoke = useProposalMutation((s) => s.revokeShare);
  const revise = useProposalMutation((s) => s.revise);
  const [r, setR] = useState({ name: "", email: "", organization: "" });
  const [reason, setReason] = useState("");
  const issued = view.versions.filter((v) => v.issue);
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-muted-foreground">
        Sharing is simulated: nothing is emailed or published. Recording an acceptance is not a
        signed contract, e-signature or billing event.
      </p>
      {view.permissions.canIssue && cur && (
        <Panel title={`Issue version ${cur.versionNumber}`}>
          <button
            className={btnPrimary}
            disabled={issue.isPending}
            onClick={() => issue.mutate([p.id, cur.id])}
          >
            Issue approved version {cur.versionNumber}
          </button>
          <ErrorNote error={issue.error} />
        </Panel>
      )}
      {view.permissions.canShare && cur?.issue && (
        <Panel title={`Share issued version ${cur.versionNumber} (simulated)`}>
          <div className="grid gap-3 md:grid-cols-3">
            <TextField
              label="Recipient name"
              value={r.name}
              onChange={(x) => setR({ ...r, name: x })}
            />
            <TextField
              label="Recipient email (fictional)"
              value={r.email}
              onChange={(x) => setR({ ...r, email: x })}
            />
            <TextField
              label="Organization"
              value={r.organization}
              onChange={(x) => setR({ ...r, organization: x })}
            />
          </div>
          <button
            className={`${btnPrimary} mt-3`}
            disabled={share.isPending}
            onClick={() => share.mutate([p.id, { versionId: cur.id, recipient: r }])}
          >
            Record simulated share
          </button>
          <ErrorNote error={share.error} />
        </Panel>
      )}
      <Panel title="Shares and responses">
        {view.shares.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {issued.length ? "Not shared yet." : "Nothing issued yet."}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {view.shares.map((s) => (
              <li key={s.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.recipient.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.recipient.email} · v{s.versionNumber} · shared {s.sharedAt.slice(0, 10)} ·
                    expires {s.expiresAt.slice(0, 10)}
                  </span>
                  <StatusPill
                    tone={
                      s.effective === "accepted"
                        ? "success"
                        : s.effective === "declined" || s.effective === "expired"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {RESPONSES[s.effective]}
                  </StatusPill>
                  {s.access === "revoked" && <StatusPill tone="danger">Access revoked</StatusPill>}
                </div>
                {view.permissions.canShare &&
                  s.access === "active" &&
                  !["accepted", "declined", "expired"].includes(s.effective) && (
                    <ResponseControls
                      onRecord={(resp, note) =>
                        respond.mutateAsync([s.id, { response: resp, note }])
                      }
                      onRevoke={() => revoke.mutateAsync([s.id])}
                    />
                  )}
              </li>
            ))}
          </ul>
        )}
        <ErrorNote error={respond.error ?? revoke.error} />
      </Panel>
      {view.permissions.canRevise && (
        <Panel title="Start a revision">
          <p className="mb-2 text-xs text-muted-foreground">
            Issued versions never change. A revision creates a new working draft that needs review
            again.
          </p>
          <TextField label="Reason" value={reason} onChange={setReason} />
          <button
            className={`${btnGhost} mt-2`}
            disabled={!reason.trim()}
            onClick={() => revise.mutate([p.id, reason])}
          >
            Revise proposal
          </button>
          <ErrorNote error={revise.error} />
        </Panel>
      )}
    </div>
  );
}
function ResponseControls({
  onRecord,
  onRevoke,
}: {
  onRecord: (r: Exclude<ShareResponse, "pending">, note: string) => Promise<unknown>;
  onRevoke: () => Promise<unknown>;
}) {
  const [resp, setResp] = useState<Exclude<ShareResponse, "pending">>("viewed");
  const [note, setNote] = useState("");
  const { pending: _p, ...opts } = RESPONSES;
  return (
    <div className="mt-2 grid gap-2 md:grid-cols-[200px_1fr_auto_auto] md:items-end">
      <SelectField
        label="Response"
        value={resp}
        options={opts}
        onChange={(v) => setResp(v as typeof resp)}
      />
      <TextField label="Note" value={note} onChange={setNote} />
      <button className={btnGhost} onClick={() => void onRecord(resp, note)}>
        Record
      </button>
      <button className={btnGhost} onClick={() => void onRevoke()}>
        Revoke access
      </button>
    </div>
  );
}

// ---------- J. Version history & preview ----------
export function VersionsSection({ view }: { view: ProposalView }) {
  const [sel, setSel] = useState<string>("draft");
  const v = view.versions.find((x) => x.id === sel);
  return (
    <div className="flex flex-col gap-6">
      <Panel title="Versions">
        <ul className="flex flex-col gap-2 text-sm">
          <li>
            <button
              className={sel === "draft" ? "font-semibold underline" : "hover:underline"}
              onClick={() => setSel("draft")}
            >
              Working draft (revision {view.proposal.revision})
            </button>
          </li>
          {view.versions.map((x) => {
            const st = versionState(x);
            return (
              <li key={x.id} className="flex flex-wrap items-center gap-2">
                <button
                  className={sel === x.id ? "font-semibold underline" : "hover:underline"}
                  onClick={() => setSel(x.id)}
                >
                  Version {x.versionNumber}
                </button>
                <StatusPill tone={VS_TONE[st]}>{VS_LABEL[st]}</StatusPill>
                <span className="text-xs text-muted-foreground">
                  {x.createdAt.slice(0, 10)} · solution v{x.document.source.solutionSnapshotVersion}{" "}
                  · {x.document.commercials.priceBookVersion}
                  {x.review
                    ? ` · ${x.review.decision.replace("_", " ")} by ${view.names[x.review.by] ?? x.review.by}`
                    : ""}
                </span>
              </li>
            );
          })}
        </ul>
      </Panel>
      {v ? (
        <ProposalPreview
          doc={v.document}
          label={`Frozen version ${v.versionNumber} — ${VS_LABEL[versionState(v)]}`}
          issuedAt={v.issue?.issuedAt}
          expiresAt={v.issue?.expiresAt}
        />
      ) : view.preview ? (
        <ProposalPreview doc={view.preview} label="Preview of the working draft — not issued" />
      ) : (
        <p className="text-sm text-muted-foreground">
          Preview unavailable: the source solution snapshot is missing.
        </p>
      )}
    </div>
  );
}
