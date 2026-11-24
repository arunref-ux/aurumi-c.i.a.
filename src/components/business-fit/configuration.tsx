import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/ui-bits";
import { useSession, useDataVersion } from "@/lib/session";
import { businessFitInternal as S } from "@/data/business-fit-internal";
import { can } from "@/domain/permissions";
import {
  CATEGORIES,
  DIMENSIONS,
  type BusinessFitQuestionnaireVersion,
  type BusinessFitRuleSetVersion,
  type FitQuestion,
  type FitRule,
  type BusinessFitResponse,
} from "@/domain/business-fit";
import { FitQuestions } from "./questionnaire";
import { fitInput, FitError } from "./shared";
import { ManagementTabs } from "./management";
export function Configuration({ kind }: { kind: "questionnaire" | "rules" }) {
  const { user } = useSession();
  return <ConfigurationBody key={`${user.id}:${kind}`} kind={kind} />;
}
function ConfigurationBody({ kind }: { kind: "questionnaire" | "rules" }) {
  useDataVersion();
  const { user } = useSession(),
    ctx = { user },
    [selected, setSelected] = useState(""),
    [error, setError] = useState<unknown>(null),
    [message, setMessage] = useState(""),
    [preview, setPreview] = useState(false),
    [qTarget, setQTarget] = useState("");
  const result = (() => {
    try {
      return { rows: S.configuration({ user }, kind), error: null };
    } catch (error) {
      return { rows: [], error };
    }
  })();
  const selectedRecord = result.rows.find((r) => r.id === selected) ?? result.rows[0];
  const questionnaires = (() => {
    try {
      return S.configuration({ user }, "questionnaire") as BusinessFitQuestionnaireVersion[];
    } catch {
      return [];
    }
  })();
  const run = (fn: () => unknown) => {
    try {
      fn();
      setError(null);
    } catch (e) {
      setError(e);
    }
  };
  const permission =
    kind === "questionnaire" ? "business_fit.publish_questionnaire" : "business_fit.publish_rules";
  return (
    <>
      <PageHeader
        eyebrow="Business Fit configuration"
        title={kind === "questionnaire" ? "Questionnaire" : "Recommendation rules"}
        description="Published definitions are immutable. Sessions and historical reports remain pinned to their original versions."
      />
      <ManagementTabs />
      <FitError error={result.error || error} />
      {selectedRecord && (
        <>
          <div className="mb-6 flex flex-wrap items-end gap-3">
            <label className="min-w-64 flex-1 text-xs">
              Version
              <select
                className={`${fitInput} mt-1`}
                value={selectedRecord.id}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setMessage("");
                  setPreview(false);
                }}
              >
                {result.rows.map((r) => (
                  <option key={r.id} value={r.id}>
                    {"title" in r ? r.title : r.name} · v{r.version} · {r.status}
                  </option>
                ))}
              </select>
            </label>
            {kind === "rules" && (
              <label className="min-w-56 text-xs">
                Questionnaire for new draft
                <select
                  className={`${fitInput} mt-1`}
                  value={qTarget}
                  onChange={(e) => setQTarget(e.target.value)}
                >
                  <option value="">Use source questionnaire</option>
                  {questionnaires.map((q) => (
                    <option key={q.id} value={q.id}>
                      v{q.version} · {q.status}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button
              variant="outline"
              onClick={() =>
                run(() => {
                  const draft =
                    kind === "questionnaire"
                      ? S.draftQuestionnaire(ctx, selectedRecord.id)
                      : S.draftRules(
                          ctx,
                          selectedRecord.id,
                          qTarget ||
                            ("questionnaireVersionId" in selectedRecord
                              ? selectedRecord.questionnaireVersionId
                              : ""),
                        );
                  setSelected(draft.id);
                  setMessage("Draft created.");
                })
              }
            >
              Create draft
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                run(() => {
                  const errors = S.validate(ctx, kind, selectedRecord.id);
                  setMessage(errors.length ? errors.join("; ") : "Definition is valid.");
                })
              }
            >
              Validate
            </Button>
            <Button variant="outline" onClick={() => setPreview(!preview)}>
              Preview
            </Button>
            {selectedRecord.status === "draft" && can(user, permission) && (
              <Button
                onClick={() =>
                  run(() => {
                    S.publish(ctx, kind, selectedRecord.id);
                    setMessage("New version published. Existing sessions are unchanged.");
                  })
                }
              >
                Publish version
              </Button>
            )}
            {selectedRecord.status === "published" && can(user, permission) && (
              <Button
                variant="outline"
                onClick={() =>
                  run(() => {
                    S.retire(ctx, kind, selectedRecord.id);
                    setMessage("Version retired. Historical copies are unchanged.");
                  })
                }
              >
                Retire version
              </Button>
            )}
          </div>
          {message && (
            <p role="status" className="mb-5 rounded-md border bg-muted p-3 text-sm">
              {message}
            </p>
          )}
          {kind === "questionnaire" && "questions" in selectedRecord ? (
            <QuestionnaireEditor
              key={`${selectedRecord.id}:${selectedRecord.updatedAt}`}
              record={selectedRecord}
              preview={preview}
              onSave={(input) =>
                run(() => {
                  S.editQuestionnaire(ctx, selectedRecord.id, input);
                  setMessage("Questionnaire draft saved.");
                })
              }
            />
          ) : kind === "rules" && "rules" in selectedRecord ? (
            <RulesEditor
              key={`${selectedRecord.id}:${selectedRecord.updatedAt}`}
              record={selectedRecord}
              questionnaire={questionnaires.find(
                (q) => q.id === selectedRecord.questionnaireVersionId,
              )}
              preview={preview}
              onSave={(input) =>
                run(() => {
                  S.editRules(ctx, selectedRecord.id, input);
                  setMessage("Rule draft saved.");
                })
              }
            />
          ) : null}
        </>
      )}
    </>
  );
}
function Field({
  label,
  value,
  onChange,
  multiline = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block text-xs">
      {label}
      {multiline ? (
        <textarea
          className={`${fitInput} mt-1`}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      ) : (
        <input
          className={`${fitInput} mt-1`}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
function QuestionnaireEditor({
  record,
  preview,
  onSave,
}: {
  record: BusinessFitQuestionnaireVersion;
  preview: boolean;
  onSave: (input: { title: string; description: string; questions: FitQuestion[] }) => void;
}) {
  const [title, setTitle] = useState(record.title),
    [description, setDescription] = useState(record.description),
    [questions, setQuestions] = useState(record.questions),
    [id, setId] = useState(record.questions[0]?.id ?? ""),
    [responses, setResponses] = useState<BusinessFitResponse>({}),
    [step, setStep] = useState(0);
  const q = questions.find((q) => q.id === id),
    disabled = record.status !== "draft";
  const patch = (change: Partial<FitQuestion>) =>
    setQuestions(questions.map((q) => (q.id === id ? { ...q, ...change } : q)));
  return (
    <>
      <p className="mb-4 font-mono text-xs text-muted-foreground">
        {record.questionnaireId} · {record.id} · v{record.version}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" value={title} onChange={setTitle} disabled={disabled} />
        <Field
          label="Description"
          value={description}
          onChange={setDescription}
          disabled={disabled}
        />
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-[260px_1fr]">
        <div>
          <label className="text-xs">
            Question
            <select
              className={`${fitInput} mt-1`}
              value={id}
              onChange={(e) => setId(e.target.value)}
            >
              {questions.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.order + 1}. {q.prompt}
                </option>
              ))}
            </select>
          </label>
          {!disabled && (
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const next: FitQuestion = {
                    id: `question-${crypto.randomUUID().slice(0, 8)}`,
                    prompt: "New optional question",
                    section: 0,
                    type: "text",
                    options: [],
                    required: false,
                    order: Math.max(...questions.map((q) => q.order)) + 1,
                  };
                  setQuestions([...questions, next]);
                  setId(next.id);
                }}
              >
                Add question
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={questions.length === 1}
                onClick={() => {
                  const next = questions.filter((q) => q.id !== id);
                  setQuestions(next);
                  setId(next[0]?.id ?? "");
                }}
              >
                Remove
              </Button>
            </div>
          )}
        </div>
        {q && (
          <div className="grid gap-4 sm:grid-cols-2">
            <p className="text-xs text-muted-foreground sm:col-span-2">Question ID: {q.id}</p>
            <Field
              label="Question prompt"
              value={q.prompt}
              onChange={(prompt) => patch({ prompt })}
              disabled={disabled}
            />
            <label className="text-xs">
              Answer type
              <select
                className={`${fitInput} mt-1`}
                value={q.type}
                disabled={disabled}
                onChange={(e) => patch({ type: e.target.value as FitQuestion["type"] })}
              >
                {["text", "single", "multi", "systems"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              Section
              <select
                className={`${fitInput} mt-1`}
                value={q.section}
                disabled={disabled}
                onChange={(e) => patch({ section: Number(e.target.value) })}
              >
                {record.sections.map((label, i) => (
                  <option key={i} value={i}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Display order"
              value={String(q.order)}
              disabled={disabled}
              onChange={(v) => patch({ order: Number(v) })}
            />
            <Field
              label="Answer options (one per line)"
              multiline
              value={q.options.join("\n")}
              disabled={disabled}
              onChange={(v) => patch({ options: v.split("\n").filter(Boolean) })}
            />
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={q.required}
                disabled={disabled}
                onChange={(e) => patch({ required: e.target.checked })}
              />
              Required
            </label>
            <label className="text-xs">
              Show only when answered
              <select
                className={`${fitInput} mt-1`}
                value={q.visibleWhen?.questionId ?? ""}
                disabled={disabled}
                onChange={(e) => {
                  if (!e.target.value) {
                    const { visibleWhen: _removed, ...rest } = q;
                    setQuestions(questions.map((x) => (x.id === id ? rest : x)));
                  } else
                    patch({
                      visibleWhen: {
                        questionId: e.target.value,
                        operator: "equals",
                        value: questions.find((x) => x.id === e.target.value)?.options[0] ?? "",
                      },
                    });
                }}
              >
                <option value="">Always visible</option>
                {questions
                  .filter((x) => x.id !== q.id && x.order < q.order && x.type === "single")
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.prompt}
                    </option>
                  ))}
              </select>
            </label>
            {q.visibleWhen && (
              <label className="text-xs">
                Answer equals
                <select
                  className={`${fitInput} mt-1`}
                  disabled={disabled}
                  value={q.visibleWhen.value}
                  onChange={(e) => {
                    if (q.visibleWhen)
                      patch({ visibleWhen: { ...q.visibleWhen, value: e.target.value } });
                  }}
                >
                  {questions
                    .find((x) => x.id === q.visibleWhen?.questionId)
                    ?.options.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                </select>
              </label>
            )}
          </div>
        )}
      </div>
      {!disabled && (
        <Button className="mt-5" onClick={() => onSave({ title, description, questions })}>
          Save questionnaire draft
        </Button>
      )}
      {preview && (
        <section className="mt-8 border-t pt-6">
          <h2 className="mb-4 text-2xl">Questionnaire preview</h2>
          <select
            aria-label="Preview step"
            className={`${fitInput} mb-5 max-w-sm`}
            value={step}
            onChange={(e) => setStep(Number(e.target.value))}
          >
            {record.sections.map((s, i) => (
              <option key={s} value={i}>
                {s}
              </option>
            ))}
          </select>
          <FitQuestions
            questionnaire={{ ...record, title, description, questions }}
            step={step}
            responses={responses}
            onChange={(key, value) => setResponses({ ...responses, [key]: value })}
          />
        </section>
      )}
    </>
  );
}
function RulesEditor({
  record,
  questionnaire,
  preview,
  onSave,
}: {
  record: BusinessFitRuleSetVersion;
  questionnaire: BusinessFitQuestionnaireVersion | undefined;
  preview: boolean;
  onSave: (input: { name: string; rules: FitRule[] }) => void;
}) {
  const [name, setName] = useState(record.name),
    [rules, setRules] = useState(record.rules),
    [id, setId] = useState(record.rules[0]?.id ?? "");
  const rule = rules.find((r) => r.id === id),
    disabled = record.status !== "draft";
  const patch = (change: Partial<FitRule>) =>
    setRules(rules.map((r) => (r.id === id ? { ...r, ...change } : r)));
  return (
    <>
      <p className="mb-4 font-mono text-xs text-muted-foreground">
        {record.ruleSetId} · v{record.version} · Questionnaire {record.questionnaireVersionId}
      </p>
      <Field label="Rule-set name" value={name} onChange={setName} disabled={disabled} />
      <div className="mt-6 grid gap-6 md:grid-cols-[260px_1fr]">
        <div>
          <label className="text-xs">
            Rule
            <select
              className={`${fitInput} mt-1`}
              value={id}
              onChange={(e) => setId(e.target.value)}
            >
              {rules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          {!disabled && (
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const question = questionnaire?.questions.find((q) => q.type === "single");
                  if (!question) return;
                  const next: FitRule = {
                    id: `rule-${crypto.randomUUID().slice(0, 8)}`,
                    name: "New improvement rule",
                    description: "Describe the reason for this recommendation.",
                    dimension: DIMENSIONS[0],
                    category: CATEGORIES[0],
                    conditions: [
                      {
                        questionId: question.id,
                        operator: "equals",
                        value: question.options[0] ?? "",
                      },
                    ],
                    recommendation: "Review one process",
                    nextStep: "Validate the reported information.",
                    priority: 20,
                    evidenceRequirements: [question.id],
                    industries: [],
                    employeeBands: [],
                  };
                  setRules([...rules, next]);
                  setId(next.id);
                }}
              >
                Add rule
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={rules.length === 1}
                onClick={() => {
                  const next = rules.filter((r) => r.id !== id);
                  setRules(next);
                  setId(next[0]?.id ?? "");
                }}
              >
                Remove
              </Button>
            </div>
          )}
        </div>
        {rule && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Rule name"
              value={rule.name}
              disabled={disabled}
              onChange={(name) => patch({ name })}
            />
            <Field
              label="Priority (1 first)"
              value={String(rule.priority)}
              disabled={disabled}
              onChange={(v) => patch({ priority: Number(v) })}
            />
            <label className="text-xs">
              Dimension
              <select
                className={`${fitInput} mt-1`}
                disabled={disabled}
                value={rule.dimension}
                onChange={(e) => patch({ dimension: e.target.value as FitRule["dimension"] })}
              >
                {DIMENSIONS.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              Category
              <select
                className={`${fitInput} mt-1`}
                disabled={disabled}
                value={rule.category}
                onChange={(e) => patch({ category: e.target.value as FitRule["category"] })}
              >
                {CATEGORIES.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <Field
              label="Recommendation"
              value={rule.recommendation}
              disabled={disabled}
              onChange={(recommendation) => patch({ recommendation })}
            />
            <Field
              label="Suggested next step"
              value={rule.nextStep}
              disabled={disabled}
              onChange={(nextStep) => patch({ nextStep })}
            />
            <Field
              label="Explanation"
              multiline
              value={rule.description}
              disabled={disabled}
              onChange={(description) => patch({ description })}
            />
            <Field
              label="Evidence question IDs (one per line)"
              multiline
              value={rule.evidenceRequirements.join("\n")}
              disabled={disabled}
              onChange={(v) => patch({ evidenceRequirements: v.split("\n").filter(Boolean) })}
            />
            <Field
              label="Industry filters (one per line, blank = all)"
              multiline
              value={rule.industries.join("\n")}
              disabled={disabled}
              onChange={(v) => patch({ industries: v.split("\n").filter(Boolean) })}
            />
            <Field
              label="Employee bands (one per line, blank = all)"
              multiline
              value={rule.employeeBands.join("\n")}
              disabled={disabled}
              onChange={(v) => patch({ employeeBands: v.split("\n").filter(Boolean) })}
            />
            <label className="text-xs">
              Qualitative maturity level
              <select
                className={`${fitInput} mt-1`}
                disabled={disabled}
                value={rule.level ?? ""}
                onChange={(e) => {
                  if (e.target.value) patch({ level: e.target.value as FitRule["level"] });
                  else {
                    const { level: _removed, ...rest } = rule;
                    setRules(rules.map((x) => (x.id === id ? rest : x)));
                  }
                }}
              >
                <option value="">No maturity rating</option>
                {["Foundational", "Developing", "Established", "Advanced"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              Public-safe capability
              <select
                className={`${fitInput} mt-1`}
                disabled={disabled}
                value={rule.catalogId ?? ""}
                onChange={(e) => {
                  if (e.target.value) patch({ catalogId: e.target.value });
                  else {
                    const { catalogId: _removed, ...rest } = rule;
                    setRules(rules.map((x) => (x.id === id ? rest : x)));
                  }
                }}
              >
                <option value="">None</option>
                {[
                  "app_ops_reports",
                  "app_crm_followups",
                  "ai_summaries",
                  "conn_tally",
                  "conn_pms_generic",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <div className="space-y-3 sm:col-span-2">
              <p className="text-sm font-medium">Conditions (all must match)</p>
              {rule.conditions.map((c, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-3">
                  <select
                    aria-label={`Condition ${i + 1} question`}
                    className={fitInput}
                    disabled={disabled}
                    value={c.questionId}
                    onChange={(e) =>
                      patch({
                        conditions: rule.conditions.map((x, j) =>
                          j === i ? { ...x, questionId: e.target.value } : x,
                        ),
                      })
                    }
                  >
                    {questionnaire?.questions.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.prompt}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`Condition ${i + 1} operator`}
                    className={fitInput}
                    disabled={disabled}
                    value={c.operator}
                    onChange={(e) =>
                      patch({
                        conditions: rule.conditions.map((x, j) =>
                          j === i ? { ...x, operator: e.target.value as typeof c.operator } : x,
                        ),
                      })
                    }
                  >
                    {["equals", "includes", "answered"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                  <select
                    aria-label={`Condition ${i + 1} answer`}
                    className={fitInput}
                    disabled={disabled || c.operator === "answered"}
                    value={c.value ?? ""}
                    onChange={(e) =>
                      patch({
                        conditions: rule.conditions.map((x, j) =>
                          j === i ? { ...x, value: e.target.value } : x,
                        ),
                      })
                    }
                  >
                    <option value="">Choose answer</option>
                    {questionnaire?.questions
                      .find((q) => q.id === c.questionId)
                      ?.options.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                  </select>
                </div>
              ))}
              {!disabled && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const q = questionnaire?.questions[0];
                      if (q)
                        patch({
                          conditions: [
                            ...rule.conditions,
                            { questionId: q.id, operator: "answered" },
                          ],
                        });
                    }}
                  >
                    Add condition
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={rule.conditions.length === 1}
                    onClick={() => patch({ conditions: rule.conditions.slice(0, -1) })}
                  >
                    Remove last condition
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {!disabled && (
        <Button className="mt-5" onClick={() => onSave({ name, rules })}>
          Save rule draft
        </Button>
      )}
      {preview && (
        <div className="mt-8 border-t pt-5">
          <h2 className="text-2xl">Rule preview</h2>
          {rules.map((r) => (
            <div key={r.id} className="border-b py-4">
              <h3 className="font-semibold">{r.recommendation}</h3>
              <p className="mt-1 text-sm">{r.description}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.conditions
                  .map((c) => `${c.questionId} ${c.operator} ${c.value ?? ""}`)
                  .join(" AND ")}{" "}
                · Evidence: {r.evidenceRequirements.join(", ")}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
