/** Browser handle storage is separate from shared fictional work records; read only after hydration. */
import { useEffect, useState } from "react";
import { businessFitPublic } from "@/data/business-fit-public";
import type { SessionHandle, BusinessFitSession } from "@/domain/business-fit";
import { useDataVersion } from "./session";
const KEY = "aurumi.business-fit.current-session/1";
export function useBusinessFitSession() {
  const version = useDataVersion();
  const [handle, setHandle] = useState<SessionHandle | null>(null),
    [session, setSession] = useState<BusinessFitSession | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) {
        const h = JSON.parse(raw) as SessionHandle;
        setSession(businessFitPublic.get(h));
        setHandle(h);
      } else {
        setSession(null);
        setHandle(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Session unavailable");
    } finally {
      setReady(true);
    }
  }, [version]);
  const refresh = (h = handle) => {
    if (h) setSession(businessFitPublic.get(h));
  };
  const begin = () => {
    const h = businessFitPublic.begin();
    sessionStorage.setItem(KEY, JSON.stringify(h));
    setHandle(h);
    setSession(businessFitPublic.get(h));
    setError("");
    return h;
  };
  const clear = () => {
    if (handle) businessFitPublic.clear(handle);
    sessionStorage.removeItem(KEY);
    setHandle(null);
    setSession(null);
    setError("");
  };
  return { handle, session, ready, error, setError, begin, clear, refresh };
}
