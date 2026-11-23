import { describe, expect, it } from "vitest";
import { repos } from "@/data/repositories";
import { seedUsers } from "@/data/seed";
import { store } from "@/data/store";
import { AccessDeniedError, can } from "@/domain/permissions";

const u = (id: string) => seedUsers.find((x) => x.id === id)!;

describe("authorization", () => {
  it("denies a partner-affiliated professional an unassigned proposal (Workflow 8)", () => {
    store.reset();
    expect(() => repos.proposals.get({ user: u("u_partner_pro") }, "prp_c")).toThrow(AccessDeniedError);
    expect(store.audit()[0]?.outcome).toBe("denied");
  });
  it("caps partner-affiliated users at Self scope", () => {
    const p = store.table("proposals").find((x) => x.id === "prp_c")!;
    expect(can(u("u_partner_pro"), "proposal.read", p)).toBe(false);
  });
  it("lets a professional see only own or assigned assessments", () => {
    store.reset();
    const ids = repos.assessments.list({ user: u("u_pro") }).map((a) => a.id).sort();
    expect(ids).toEqual(["asm_a", "asm_b", "asm_e"]);
  });
  it("lets a manager see the whole team but not other teams", () => {
    const ids = repos.assessments.list({ user: u("u_manager") }).map((a) => a.id);
    expect(ids).not.toContain("asm_c");
    expect(ids).toHaveLength(4);
  });
  it("lets a reviewer approve but not create proposals", () => {
    expect(can(u("u_reviewer"), "proposal.approve")).toBe(true);
    expect(can(u("u_reviewer"), "proposal.create")).toBe(false);
  });
});
