import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { directory, repos, ValidationError } from "@/data/repositories";
import { seedUsers } from "@/data/seed";
import { store } from "@/data/store";
import { AccessDeniedError, can } from "@/domain/permissions";
import { validateFinding } from "@/domain/research";
import { computeMetrics } from "@/domain/metrics";
import type { ResearchFinding } from "@/domain/types";
import { adapterRegistry } from "@/integrations/adapters/mock";
import { SessionProvider, useSession } from "@/lib/session";
import { Access, AdapterCard } from "@/routes/settings";

const u = (id: string) => ({ user: seedUsers.find((x) => x.id === id)! });
const raw = (id: string) => structuredClone(store.table("proposals").find((p) => p.id === id)!);

beforeEach(() => store.reset());
afterEach(cleanup);

describe("H1 protected status transitions", () => {
  it("accepted → undefined → draft fails and leaves the proposal unchanged", () => {
    const before = raw("prp_e");
    expect(() =>
      repos.proposals.update(u("u_pro"), "prp_e", { status: undefined } as never),
    ).toThrow(ValidationError);
    expect(raw("prp_e")).toEqual(before);
    expect(() => repos.proposals.update(u("u_pro"), "prp_e", { status: "draft" })).toThrow(
      ValidationError,
    );
    expect(raw("prp_e")).toEqual(before);
  });
  it("rejects null and invalid status values without merging them", () => {
    expect(() =>
      repos.proposals.update(u("u_manager"), "prp_b", { status: null } as never),
    ).toThrow(ValidationError);
    expect(() =>
      repos.proposals.update(u("u_manager"), "prp_b", { status: "bogus" } as never),
    ).toThrow(ValidationError);
    expect(() =>
      repos.assessments.update(u("u_pro"), "asm_a", { status: undefined } as never),
    ).toThrow(ValidationError);
    expect(raw("prp_b").status).toBe("draft");
  });
  it("keeps the stored status when status is omitted", () => {
    const r = repos.proposals.update(u("u_pro"), "prp_e", { title: "Renamed" });
    expect(r.status).toBe("accepted");
  });
  it("still lets permitted users move a draft to in_review", () => {
    expect(repos.proposals.update(u("u_manager"), "prp_b", { status: "in_review" }).status).toBe(
      "in_review",
    );
  });
  it("still enforces ownership on status changes", () => {
    expect(() =>
      repos.proposals.update(u("u_partner_pro"), "prp_b", { status: "in_review" }),
    ).toThrow(AccessDeniedError);
  });
});

describe("H2 creation defaults", () => {
  it("assessment defaults to draft", () => {
    const a = repos.assessments.create(u("u_pro"), {
      type: "tenant",
      title: "T",
      subjectName: "S",
      channel: "direct",
    });
    expect(a.status).toBe("draft");
  });
  it("proposal defaults to draft without pricing", () => {
    const p = repos.proposals.create(u("u_pro"), {
      assessmentId: "asm_a",
      title: "P",
      track: "tenant_solution",
    });
    expect(p.status).toBe("draft");
    expect(p.includesPricing).toBe(false);
  });
  it("engagement defaults to planned", () => {
    const e = repos.engagements.create(u("u_manager"), { proposalId: "prp_b", title: "E" });
    expect(e.status).toBe("planned");
  });
  it("rejects missing required fields from untyped callers", () => {
    expect(() =>
      repos.assessments.create(u("u_pro"), { type: "tenant", channel: "direct" } as never),
    ).toThrow(ValidationError);
    expect(() =>
      repos.proposals.create(u("u_pro"), { assessmentId: "asm_a", title: "P" } as never),
    ).toThrow(ValidationError);
  });
  it("dashboard metrics still compute after defaulted creates", () => {
    repos.proposals.create(u("u_pro"), {
      assessmentId: "asm_a",
      title: "P",
      track: "tenant_solution",
    });
    const ctx = u("u_pro");
    expect(() =>
      computeMetrics(
        repos.assessments.list(ctx),
        repos.proposals.list(ctx),
        repos.engagements.list(ctx),
        { type: "all", ownerId: "all", channel: "all", sinceDays: null, now: new Date() },
      ),
    ).not.toThrow();
  });
});

describe("H3 directory scopes", () => {
  it("partner professional sees only their own profile", () => {
    const ctx = u("u_partner_pro");
    expect(directory.professionals(ctx).map((p) => p.userId)).toEqual(["u_partner_pro"]);
    expect(directory.affiliations(ctx).map((a) => a.id)).toEqual(["aff_northledger"]);
    expect(directory.teams(ctx).map((t) => t.id)).toEqual(["team_partners"]);
    expect(directory.displayName(ctx, "u_manager")).toBe("Colleague");
  });
  it("Aurumi managers keep organization-wide directory access", () => {
    const ctx = u("u_manager");
    expect(directory.professionals(ctx).length).toBe(store.table("professionals").length);
    expect(directory.displayName(ctx, "u_partner_pro")).toBe("Liam Tremblay");
  });
});

function Switch({ to }: { to: string }) {
  const { setUserId } = useSession();
  return <button onClick={() => setUserId(to)}>switch</button>;
}

describe("H4 Settings clears results on identity change", () => {
  it("access demo result disappears after switching to a partner", () => {
    render(
      <SessionProvider>
        <Switch to="u_partner_pro" />
        <Access />
      </SessionProvider>,
    );
    fireEvent.click(screen.getByText(/^prp_b/));
    expect(screen.getByText(/Allowed: "Guest operations/)).toBeTruthy();
    fireEvent.click(screen.getByText("switch"));
    expect(screen.queryByText(/Guest operations/)).toBeNull();
  });
  it("diagnostic output disappears after switching away from an admin", async () => {
    const a = adapterRegistry[0]!;
    function AsAdmin() {
      const { setUserId, user } = useSession();
      return (
        <>
          <button onClick={() => setUserId("u_admin")}>admin</button>
          <span>{user.id}</span>
        </>
      );
    }
    render(
      <SessionProvider>
        <AsAdmin />
        <Switch to="u_partner_pro" />
        <AdapterCard a={a} />
      </SessionProvider>,
    );
    fireEvent.click(screen.getByText("admin"));
    await act(async () => {
      fireEvent.click(screen.getAllByText("Run")[0]!);
      await new Promise((r) => setTimeout(r, 700));
    });
    expect(document.querySelector("pre, .text-destructive")).toBeTruthy();
    fireEvent.click(screen.getByText("switch"));
    expect(document.querySelector("pre")).toBeNull();
  });
});

describe("H5 research validation", () => {
  const at = "2026-01-01T00:00:00.000Z";
  const base: ResearchFinding = {
    attribute: "vendor",
    statement: "Made by Acme",
    status: "research_finding",
    researchedAt: at,
    sources: [{ sourceType: "vendor_site", title: "Acme site", retrievedAt: at } as never],
    confidence: { level: "unknown", reason: "single source" },
    verification: { state: "unverified" },
  };
  it.each([NaN, Infinity, -0.1, 1.5])("rejects confidence score %s", (score) => {
    expect(validateFinding({ ...base, confidence: { level: "high", score } })).not.toEqual([]);
  });
  it("keeps unknown confidence valid with a reason", () =>
    expect(validateFinding(base)).toEqual([]));
  it("rejects a confirmed fact with incomplete verification", () => {
    const bad = {
      ...base,
      status: "confirmed_fact",
      verification: { state: "verified", verifiedBy: "", verifiedAt: "not-a-date", method: " " },
    } as ResearchFinding;
    expect(validateFinding(bad).length).toBeGreaterThanOrEqual(3);
  });
  it("rejects empty statement and invalid timestamp", () => {
    expect(validateFinding({ ...base, statement: " ", researchedAt: "yesterday" }).length).toBe(2);
  });
});

describe("H6 fail-closed session", () => {
  it("without a provider no permission is granted", () => {
    const { result } = renderHook(() => useSession());
    expect(result.current.user.roles).toEqual([]);
    expect(can(result.current.user, "proposal.read")).toBe(false);
    expect(can(result.current.user, "settings.manage")).toBe(false);
  });
});
