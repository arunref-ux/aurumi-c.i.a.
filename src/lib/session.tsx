import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type Context,
  type ReactNode,
} from "react";
import { seedUsers } from "@/data/seed";
import { browserBackend, store } from "@/data/store";
import type { User } from "@/domain/types";

type SessionValue = { user: User; setUserId: (id: string) => void };
// Keep one context instance across live reloads so provider and consumers always match.
const g = globalThis as { __ciaSessionCtx?: Context<SessionValue | null> };
const SessionCtx = (g.__ciaSessionCtx ??= createContext<SessionValue | null>(null));

const DEFAULT_USER_ID = "u_manager";
/**
 * Fail closed: without a provider the caller gets an anonymous identity with
 * no roles, so no permission check can pass. This only avoids a blank screen
 * during a live reload; it never grants access.
 */
export const NO_SESSION_USER: User = {
  id: "u_no_session",
  organizationId: "org_none",
  name: "Signed out",
  email: "",
  teamId: "team_none",
  roles: [],
  affiliation: "partner",
};
const FALLBACK: SessionValue = { user: NO_SESSION_USER, setUserId: () => {} };

/** Prototype identity: switch between seeded users to exercise permissions. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState(DEFAULT_USER_ID);
  // Load saved drafts after hydration (SSR renders sample data; the browser then restores saved work).
  useEffect(() => {
    store.attach(browserBackend());
  }, []);
  const user = seedUsers.find((u) => u.id === userId) ?? seedUsers[0]!;
  return <SessionCtx.Provider value={{ user, setUserId }}>{children}</SessionCtx.Provider>;
}
export function useSession() {
  const c = useContext(SessionCtx);
  // During a live reload a consumer can briefly render without its provider;
  // fall back to a permissionless identity instead of blanking the screen.
  return c ?? FALLBACK;
}
/** Re-render on any store change. */
export function useStoreVersion() {
  return useSyncExternalStore(store.subscribe, store.version, store.version);
}

/**
 * Re-render only when assessment/work data changes. Audit events (e.g. a
 * logged denied read) do not move this, so they cannot trigger refetch loops.
 */
export function useDataVersion() {
  return useSyncExternalStore(store.subscribe, store.dataVersion, store.dataVersion);
}

/** Explicit recovery action for the saved-work protection state. */
export function retryStorageRecovery() {
  return store.retryRecovery();
}

/** Simulated persistence status for the "saved" indicator. */
export function usePersistenceStatus() {
  useStoreVersion();
  return store.persistence();
}
