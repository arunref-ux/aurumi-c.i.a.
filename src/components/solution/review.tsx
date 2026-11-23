/** K. Review & readiness, controlled rebase, revisions and immutable hand-off snapshots. */
import { useState } from "react";
import { Panel, StatusPill } from "@/components/app/ui-bits";
import { btnDanger, btnGhost, btnPrimary, ErrorNote, inputCls, SelectField } from "@/components/assessment/fields";
import type { SolutionView } from "@/data/solution-studio";
import { SOLUTION_STATUS_LABEL, type RebaseDiff } from "@/domain/solution";
import { useSolutionMutation } from "@/lib/solution-queries";

export function ReviewSection({ view }: { view: SolutionView }) {
  const { solution: s, workspace: ws, permissions, names, readiness } = view;
  const submit = useSolutionMutation((x) => x.submitForReview);
  const approve = useSolutionMutation((x) => x.approve);
  const ret = useSolutionMutation((x) => x.returnForRevision);
  const reopen = useSolutionMutation((x) => x.reopen);
  const comment = useSolutionMutation((x) => x.addComment);
  const reviewers = useSolutionMutation((x) => x.reviewerCandidates);
  const setReviewer = useSolutionMutation((x) => x.assignReviewer);
  const [text, setText] = useState("");
  const [options, setOptions] = useState<Record<string, string> | null>(null);
  const ready = readiness.every((i) => i.ok);
  const err = submit.error ?? approve.error ?? ret.error ?? reopen.error ?? comment.error ?? setReviewer.error;
  return (
    <div className="flex flex-col gap-6">
      <Panel
        title="Solution readiness"
        action={<StatusPill tone={ready ? "success" : "warning"}>{ready ? "Ready" : `${view.readinessPercent}% ready`}</StatusPill>}
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {readiness.map((i) => (
            <li key={i.key} className="rounded-md border p-2.5 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <span aria-hidden className={i.ok ? "text-success" : "text-warning"}>{i.ok ? "●" : "○"}</span>
                {i.label}
                <span className="sr-only">{i.ok ? "complete" : "incomplete"}</span>
              </p>
              {i.detail.length > 0 && (
                <ul className="mt-1 text-xs text-muted-foreground">
                  {i.detail.slice(0, 4).map((d) => (
                    <li key={d}>• {d}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </Panel>
      <RebasePanel view={view} />
      <Panel title="Review" action={<StatusPill>{SOLUTION_STATUS_LABEL[s.status]}</StatusPill>}>
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            Reviewer: {ws.reviewerId ? (names[ws.reviewerId] ?? ws.reviewerId) : "not assigned"}
            <span className="text-xs text-muted-foreground"> · the owner and assigned professionals can’t approve their own solution.</span>
          </p>
          {permissions.canEdit && (
            <div className="flex flex-wrap items-end gap-2">
              {options ? (
                <SelectField label="Reviewer" value={ws.reviewerId ?? ""} options={{ "": "Choose…", ...options }} onChange={(v) => v && setReviewer.mutate([s.id, v])} />
              ) : (
                <button
                  className={btnGhost}
                  onClick={async () => setOptions(Object.fromEntries((await reviewers.mutateAsync([s.id])).map((r) => [r.id, r.name])))}
                >
                  Choose reviewer
                </button>
              )}
            </div>
          )}
          <textarea aria-label="Comment" className={inputCls} rows={2} value={text} placeholder="Comment, revision request or approval note" onChange={(e) => setText(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {permissions.canSubmit && (
              <button className={btnPrimary} onClick={() => submit.mutate([s.id, text])}>
                Submit for review
              </button>
            )}
            {permissions.canApprove && (
              <>
                <button className={btnPrimary} disabled={!ready} onClick={() => approve.mutate([s.id, text])}>
                  Approve & create hand-off
                </button>
                <button className={btnDanger} onClick={() => ret.mutate([s.id, text])}>
                  Return for revision
                </button>
              </>
            )}
            {permissions.canReopen && (
              <button className={btnGhost} onClick={() => reopen.mutate([s.id, text])}>
                Reopen
              </button>
            )}
            <button className={btnGhost} disabled={!text.trim()} onClick={() => comment.mutate([s.id, text])}>
              Add comment
            </button>
          </div>
          <ErrorNote error={err} />
          {ws.comments.length > 0 && (
            <ul className="mt-2 flex flex-col gap-2 border-t pt-3 text-sm">
              {[...ws.comments].reverse().map((c) => (
                <li key={c.id}>
                  <span className="text-xs text-muted-foreground">
                    {names[c.createdBy] ?? c.createdBy} · {c.kind} · {c.createdAt.slice(0, 16).replace("T", " ")}
                  </span>
                  <p>{c.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>
      <Panel title={`Solution hand-off snapshots (${view.snapshots.length})`}>
        {view.snapshots.length === 0 ? (
          <p className="text-sm text-muted-foreground">Created on approval. Snapshots never change afterwards.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {view.snapshots.map((x) => (
              <li key={x.id} className="rounded-md border p-2.5">
                <p className="font-medium">
                  v{x.version} · revision {x.revision} · <span className="font-mono text-xs">{x.id}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Approved {x.approval.approvedAt.slice(0, 10)} by {names[x.approval.approvedBy] ?? x.approval.approvedBy} · baseline v{x.baseline.snapshotVersion} ·
                  catalog {x.catalog.catalogVersion} · {x.recommendations.length} recommendations
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {ws.revisions.length > 0 && (
        <Panel title={`Earlier revisions (${ws.revisions.length})`}>
          <ul className="flex flex-col gap-1 text-sm">
            {ws.revisions.map((r) => (
              <li key={r.revision}>
                Revision {r.revision} on baseline v{r.baseline.snapshotVersion} — archived {r.archivedAt.slice(0, 10)} by {names[r.archivedBy] ?? r.archivedBy}: {r.reason}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function RebasePanel({ view }: { view: SolutionView }) {
  const { solution: s, newerSnapshot, permissions } = view;
  const preview = useSolutionMutation((x) => x.previewRebase);
  const rebase = useSolutionMutation((x) => x.rebase);
  const [diff, setDiff] = useState<RebaseDiff | null>(null);
  const [reason, setReason] = useState("");
  if (!newerSnapshot) return null;
  return (
    <Panel title="Newer approved assessment available">
      <p className="text-sm">
        Snapshot v{newerSnapshot.version} was approved on {newerSnapshot.approvedAt.slice(0, 10)}. This solution stays on v
        {s.baseline.snapshotVersion} until someone rebases it on purpose.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={btnGhost} onClick={async () => setDiff(await preview.mutateAsync([s.id, newerSnapshot.id]))}>
          Show what changed
        </button>
      </div>
      {diff && (
        <div className="mt-3 flex flex-col gap-2 text-sm">
          <p>
            Added {diff.added.length} · removed {diff.removed.length} · changed {diff.changed.length} · evidence changed {diff.evidenceChanged.length}
          </p>
          <ul className="text-xs text-muted-foreground">
            {diff.changed.map((c) => (
              <li key={c.id}>Changed: “{c.before.slice(0, 50)}” → “{c.after.slice(0, 50)}”</li>
            ))}
            {diff.removed.map((c) => (
              <li key={c.id}>Removed: {c.label.slice(0, 60)}</li>
            ))}
          </ul>
          <p className="text-xs">
            {diff.affectedNeeds.length} need(s) and {diff.affectedRecommendations.length} recommendation(s) will be flagged for review. The current revision is preserved.
          </p>
          {permissions.canRebase && (
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label="Reason for rebasing" className={inputCls} placeholder="Reason for rebasing" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button className={btnPrimary} disabled={!reason.trim()} onClick={() => rebase.mutate([s.id, newerSnapshot.id, reason])}>
                Rebase to v{newerSnapshot.version}
              </button>
            </div>
          )}
        </div>
      )}
      <ErrorNote error={preview.error ?? rebase.error} />
    </Panel>
  );
}
