import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "./icons";
import { useState, type ReactNode } from "react";
import { seedUsers } from "@/data/seed";
import { ROLE_LABELS } from "@/domain/permissions";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { NAV } from "./nav";

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-0.5 px-3">
      {NAV.map((item) => {
        const active = item.to === "/" ? path === "/" : path.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60",
            )}
          >
            <item.icon className={cn("size-4", active ? "text-sidebar-primary" : "opacity-70")} />
            <span className="flex-1">{item.label}</span>
            {item.phase > 5 && (
              <span className="text-[10px] uppercase tracking-wider opacity-50">P{item.phase}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-6 py-6">
      <div className="grid size-8 place-items-center rounded-md bg-sidebar-primary font-display text-lg text-sidebar-primary-foreground">
        A
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-sidebar-accent-foreground">C.I.A. Workspace</p>
        <p className="text-[11px] text-sidebar-foreground/70">
          Aurumi · Chief Information Assistant
        </p>
      </div>
    </div>
  );
}

function IdentitySwitcher() {
  const { user, setUserId } = useSession();
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="hidden sm:inline">Viewing as</span>
      <select
        value={user.id}
        onChange={(e) => setUserId(e.target.value)}
        aria-label="Prototype identity"
        className="rounded-md border bg-card px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {seedUsers.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} — {u.roles.map((r) => ROLE_LABELS[r]).join(", ")}
            {u.affiliation === "partner" ? " (partner)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar lg:flex">
        <Brand />
        <NavList />
        <div className="mt-auto border-t border-sidebar-border px-6 py-4 text-[11px] text-sidebar-foreground/60">
          v1.0 prototype · simulated backend
        </div>
      </aside>
      {open && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <button
            className="absolute inset-0 bg-foreground/40"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
          <aside className="relative h-full w-72 bg-sidebar">
            <button
              className="absolute right-3 top-3 rounded-md p-1.5 text-sidebar-foreground hover:bg-sidebar-accent"
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </button>
            <Brand />
            <NavList onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur md:px-8">
          <button
            className="rounded-md p-1.5 hover:bg-muted lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </button>
          <span className="rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-medium">
            Mock integrations
          </span>
          <div className="ml-auto">
            <IdentitySwitcher />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}
