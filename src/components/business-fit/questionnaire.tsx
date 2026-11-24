import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "@/components/app/icons";
import {
  FUNCTIONS,
  SOFTWARE,
  visibleQuestions,
  type BusinessFitQuestionnaireVersion,
  type BusinessFitResponse,
  type FitSystem,
} from "@/domain/business-fit";
import { fitInput } from "./shared";
const kinds: Record<FitSystem["kind"], string> = {
  commercial: "Commercial software",
  aurumi: "Aurumi native application",
  custom: "Custom-built software",
  spreadsheet: "Spreadsheets",
  manual: "Paper / manual process",
  none: "No current system",
  unknown: "Not sure",
};
export function FitQuestions({
  questionnaire,
  responses,
  step,
  onChange,
}: {
  questionnaire: BusinessFitQuestionnaireVersion;
  responses: BusinessFitResponse;
  step: number;
  onChange: (key: string, value: BusinessFitResponse[string]) => void;
}) {
  return (
    <div className="space-y-6">
      {visibleQuestions(questionnaire, responses, step).map((q) => {
        const value = responses[q.id];
        return (
          <div key={q.id}>
            <label htmlFor={`fit-${q.id}`} className="mb-2 block text-sm font-medium">
              {q.prompt}
              {q.required && <span className="text-destructive"> *</span>}
            </label>
            {q.type === "systems" ? (
              <Systems
                value={
                  Array.isArray(value)
                    ? value.filter((v): v is FitSystem => typeof v !== "string")
                    : []
                }
                onChange={(v) => onChange(q.id, v)}
              />
            ) : q.type === "multi" ? (
              <fieldset id={`fit-${q.id}`} className="grid gap-2 sm:grid-cols-2">
                <legend className="sr-only">{q.prompt}</legend>
                {q.options.map((option) => {
                  const choices = Array.isArray(value)
                    ? value.filter((v): v is string => typeof v === "string")
                    : [];
                  const selected = choices.includes(option);
                  return (
                    <label
                      key={option}
                      className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 text-sm ${selected ? "border-accent bg-gold-soft" : "bg-card"}`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-accent"
                        checked={selected}
                        onChange={(e) => {
                          const old = Array.isArray(value)
                            ? value.filter((v): v is string => typeof v === "string")
                            : [];
                          onChange(
                            q.id,
                            e.target.checked ? [...old, option] : old.filter((v) => v !== option),
                          );
                        }}
                      />
                      <span>
                        {option}
                        {selected && q.id === "priorities" && (
                          <span className="ml-2 font-mono text-xs">
                            #{choices.indexOf(option) + 1}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            ) : q.type === "single" ? (
              <select
                id={`fit-${q.id}`}
                className={fitInput}
                value={typeof value === "string" ? value : ""}
                onChange={(e) => onChange(q.id, e.target.value)}
              >
                <option value="">
                  {q.required ? "Choose an answer" : "Optional — choose an answer"}
                </option>
                {q.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input
                id={`fit-${q.id}`}
                className={fitInput}
                value={typeof value === "string" ? value : ""}
                onChange={(e) => onChange(q.id, e.target.value)}
                maxLength={4000}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
function Systems({ value, onChange }: { value: FitSystem[]; onChange: (v: FitSystem[]) => void }) {
  const [functionName, setFunction] = useState(FUNCTIONS[0] ?? ""),
    [kind, setKind] = useState<FitSystem["kind"]>("commercial"),
    [name, setName] = useState("");
  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Include only relevant functions. Multiple systems are welcome; no credentials or sensitive
        records.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">
          Business function
          <select
            aria-label="Business function"
            className={`${fitInput} mt-1`}
            value={functionName}
            onChange={(e) => setFunction(e.target.value)}
          >
            {FUNCTIONS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          System type
          <select
            aria-label="System type"
            className={`${fitInput} mt-1`}
            value={kind}
            onChange={(e) => setKind(e.target.value as FitSystem["kind"])}
          >
            {Object.entries(kinds).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs sm:col-span-2">
          Product or system name (optional)
          <input
            className={`${fitInput} mt-1`}
            list="fit-software"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Known software or your own description"
            maxLength={200}
          />
          <datalist id="fit-software">
            {SOFTWARE.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
      </div>
      <Button
        variant="outline"
        className="mt-3"
        onClick={() => {
          onChange([...value, { function: functionName, kind, name: name.trim() }]);
          setName("");
        }}
      >
        Add system
      </Button>
      <ul className="mt-5 divide-y border-y">
        {value.map((s, i) => (
          <li key={i} className="flex items-center gap-3 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="break-words font-medium">{s.name || kinds[s.kind]}</p>
              <p className="text-xs text-muted-foreground">
                {s.function} · {kinds[s.kind]}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${s.name || kinds[s.kind]}`}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              <X />
            </Button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        A product appearing here does not imply an available Aurumi connector or commercial
        partnership.
      </p>
    </div>
  );
}
