/** Review & readiness: completeness, unverified claims, reviewer, comments, lifecycle actions, hand-off snapshots. */
import { useState } from "react";
import { Panel, StatusPill } from "@/components/app/ui-bits";
import type { WorkspaceView } from "@/data/assessment-studio";
import { unverifiedCriticalClaims } from "@/domain/assessment";
import { useStudioMutation } from "@/lib/assessment-queries";
import { btnGhost, btnPrimary, btnDanger, ErrorNote, inputCls, SelectField } from "./fields";
import { displayInstant } from "@/lib/display-format";

const READINESS = {
  incomplete: ["Incomplete", "warning"],
  ready_for_review: ["Ready for review", "info"],
  in_review: ["In review", "warning"],
  returned: ["Returned for revision", "danger"],
  approved: ["Approved — ready for Solution Studio", "success"],
} as const;

export function ReviewSection({ view }: { view: WorkspaceView }) {
  const { assessment: a, workspace: ws, permissions, names, sections } = view;
  const submit = useStudioMutation((s) => s.submitForReview);
  const approve = useStudioMutation((s) => s.approve);
  const ret = useStudioMutation((s) => s.returnForRevision);
  const reopen = useStudioMutation((s) => s.reopen);
  const comment = useStudioMutation((s) => s.addComment);
  const reviewers = useStudioMutation((s) => s.reviewerCandidates);
  const setReviewer = useStudioMutation((s) => s.assignReviewer);
  const [text, setText] = useState("");
  const [options, setOptions] = useState<Record<string, string> | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const claims = unverifiedCriticalClaims(ws);
  const unresolved = ws.openQuestions.filter((q) => !q.resolved);
  const [label, tone] = READINESS[view.readiness];
  const err =
    submit.error ??
    approve.error ??
    ret.error ??
    reopen.error ??
    comment.error ??
    setReviewer.error ??
    reviewers.error;

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Readiness" action={<StatusPill tone={tone}>{label}</StatusPill>}>
        <ul className="grid gap-2 sm:grid-cols-2">
          {sections.map((s) => (
            <li key={s.key} className="rounded-md border p-2.5 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <span aria-hidden className={s.complete ? "text-success" : "text-warning"}>
                  {s.complete ? "●" : "○"}
                </span>
                {s.label}
                <span className="sr-only">{s.complete ? "complete" : "incomplete"}</span>
              </p>
              {s.missing.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Missing: {s.missing.join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Panel>
      <div className="grid gap-6 md:grid-cols-2">
        <Panel title={`Unverified critical claims (${claims.length})`}>
          {claims.length ? (
            <ul className="flex flex-col gap-1.5 text-sm">
              {claims.map((c) => (
                <li key={c.id}>• {c.statement}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">None.</p>
          )}
        </Panel>
        <Panel title={`Unresolved questions (${unresolved.length})`}>
          {unresolved.length ? (
            <ul className="flex flex-col gap-1.5 text-sm">
              {unresolved.map((q) => (
                <li key={q.id}>• {q.text}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">None.</p>
          )}
        </Panel>
      </div>
      <Panel title="Reviewer & actions">
        <p className="mb-3 text-sm">
          Assigned reviewer:{" "}
          <strong>{ws.reviewerId ? (names[ws.reviewerId] ?? "Colleague") : "Not assigned"}</strong>
        </p>
        {permissions.canAssign && (
          <div className="mb-4 flex flex-wrap items-end gap-2">
            {options ? (
              <div className="w-64">
                <SelectField
                  label="Reviewer"
                  value={ws.reviewerId ?? ""}
                  options={{ "": "Choose…", ...options }}
                  onChange={(v) => v && setReviewer.mutate([a.id, v])}
                />
              </div>
            ) : (
              <button
                className={btnGhost}
                onClick={async () =>
                  setOptions(
                    Object.fromEntries(
                      (await reviewers.mutateAsync([a.id])).map((r) => [r.id, r.name]),
                    ),
                  )
                }
              >
                Choose reviewer
              </button>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {permissions.canSubmit && (
            <button
              className={btnPrimary}
              disabled={submit.isPending}
              onClick={() => submit.mutate([a.id, undefined])}
            >
              Submit for review
            </button>
          )}
          {permissions.canApprove && (
            <>
              <button
                className={btnPrimary}
                disabled={approve.isPending}
                onClick={() => approve.mutate([a.id, text])}
              >
                Approve for Solution Studio
              </button>
              <button
                className={btnDanger}
                disabled={ret.isPending}
                onClick={() => ret.mutate([a.id, text])}
              >
                Return for revision
              </button>
            </>
          )}
          {a.status === "approved" && view.permissions.canReopen && (
            <button
              className={btnGhost}
              disabled={reopen.isPending}
              onClick={() => reopen.mutate([a.id, text || "Reopened for revision"])}
            >
              Reopen for revision
            </button>
          )}
        </div>
        {a.status === "under_review" && !permissions.canApprove && (
          <p className="mt-2 text-xs text-muted-foreground">
            Only an authorized reviewer who doesn't own or work on this assessment can approve or
            return it.
          </p>
        )}
        <label
          className="mt-4 block text-xs font-medium text-muted-foreground"
          htmlFor="review-comment"
        >
          Comment (used as the approval/return note)
        </label>
        <textarea
          id="review-comment"
          className={inputCls + " mt-1"}
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-2">
          <button
            className={btnGhost}
            disabled={!text.trim() || comment.isPending}
            onClick={async () => {
              await comment.mutateAsync([a.id, text]);
              setText("");
            }}
          >
            Add comment
          </button>
        </div>
        <div className="mt-3">
          <ErrorNote error={err} />
        </div>
      </Panel>
      <Panel title="Review history">
        {ws.reviewComments.length ? (
          <ol className="flex flex-col gap-2 text-sm">
            {[...ws.reviewComments].reverse().map((c) => (
              <li key={c.id} className="border-l-2 pl-3">
                <p className="text-xs text-muted-foreground">
                  {names[c.createdBy] ?? "Colleague"} · {c.kind} · {displayInstant(c.createdAt)}
                </p>
                <p>{c.body}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">No review activity yet.</p>
        )}
      </Panel>
      <Panel title={`Approved hand-off snapshots (${view.snapshots.length})`}>
        {view.snapshots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Created automatically when an assessment is approved. Snapshots never change afterwards.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {view.snapshots.map((s) => (
              <li key={s.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>Version {s.version}</strong>
                  <span className="text-xs text-muted-foreground">
                    approved by {names[s.approval.approvedBy] ?? "Colleague"} ·{" "}
                    {displayInstant(s.approval.approvedAt)}
                  </span>
                  <button
                    className={btnGhost + " ml-auto"}
                    onClick={() => setOpen(open === s.id ? null : s.id)}
                  >
                    {open === s.id ? "Hide" : "View data"}
                  </button>
                </div>
                {open === s.id && (
                  <pre className="mt-2 max-h-80 overflow-auto rounded bg-muted p-2 font-mono text-[11px]">
                    {JSON.stringify(s, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
