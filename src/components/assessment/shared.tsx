import { useEffect, useState } from "react";
import type { Tone } from "@/components/app/ui-bits";
import type { AssessmentStatus } from "@/domain/types";
import { usePersistenceStatus } from "@/lib/session";

export const STATUS_TONE: Record<AssessmentStatus, Tone> = {
  draft: "neutral",
  in_progress: "info",
  under_review: "warning",
  returned: "danger",
  approved: "success",
  completed: "success",
  archived: "neutral",
};
export function PersistenceNote() {
  const p = usePersistenceStatus();
  // Server render has no browser storage; show storage status only after mount to keep hydration stable.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <p className="mb-4 text-xs text-muted-foreground" aria-live="polite">
      {mounted && p.mode === "browser"
        ? `Simulated storage in this browser only${p.lastSavedAt ? ` · last saved ${new Date(p.lastSavedAt).toLocaleTimeString()}` : ""}. Not production storage — use fictional data only.`
        : "Loading saved work…"}
      {p.error && <span className="text-destructive"> {p.error}</span>}
    </p>
  );
}
