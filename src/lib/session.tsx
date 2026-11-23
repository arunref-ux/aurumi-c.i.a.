import { createContext, useContext, useState, useSyncExternalStore, type Context, type ReactNode } from "react";
import { seedUsers } from "@/data/seed";
import { store } from "@/data/store";
import type { User } from "@/domain/types";

type SessionValue = { user: User; setUserId: (id: string) => void };
// Keep one context instance across live reloads so provider and consumers always match.
const g = globalThis as { __ciaSessionCtx?: Context<SessionValue | null> };
const SessionCtx = (g.__ciaSessionCtx ??= createContext<SessionValue | null>(null));

/** Prototype identity: switch between seeded users to exercise permissions. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState("u_manager");
  const user = seedUsers.find((u) => u.id === userId) ?? seedUsers[0]!;
  return <SessionCtx.Provider value={{ user, setUserId }}>{children}</SessionCtx.Provider>;
}
export function useSession() {
  const c = useContext(SessionCtx);
  if (!c) throw new Error("useSession outside SessionProvider");
  return c;
}
/** Re-render on any store change. */
export function useStoreVersion() {
  return useSyncExternalStore(store.subscribe, store.version, store.version);
}
