import { describe, expect, it } from "vitest";
import { accessForPage } from "./shell";
import type { SessionValue } from "./shell";
import { canOpen, navigableRoutes, routeFor, routes } from "./routes";
import type { Role } from "./policy";

const session = (over: Partial<SessionValue> = {}): SessionValue => ({
  user: { id: "u1" } as SessionValue["user"],
  roles: ["employee"],
  accountStatus: "active",
  profileComplete: true,
  loading: false,
  error: null,
  reload: async () => {},
  ...over,
});

describe("why a route opens or does not", () => {
  it("never gates a public route, even with no session at all", () => {
    for (const route of routes.filter(r => !r.authenticated)) {
      expect(accessForPage(route.page, session({ user: null, loading: true })))
        .toBe("ready");
    }
  });

  it("reports the reason, not just a refusal", () => {
    expect(accessForPage("workspace", session({ user: null }))).toBe("anonymous");
    expect(accessForPage("workspace", session({ accountStatus: "suspended" })))
      .toBe("suspended");
    expect(accessForPage("workspace", session({ profileComplete: false })))
      .toBe("incomplete_profile");
    expect(accessForPage("dashboard", session({ roles: ["employee"] })))
      .toBe("forbidden");
    expect(accessForPage("workspace", session({ roles: ["employee"] })))
      .toBe("ready");
  });

  it("waits rather than refusing while the session is still resolving", () => {
    expect(accessForPage("dashboard", session({ loading: true }))).toBe("loading");
  });

  // A failed read of roles or suspension must never read as permission, and
  // must never be reported as a permission problem either.
  it("keeps the gate closed when the session could not be read", () => {
    const broken = session({
      error: { kind: "offline", message: { ar: "…", en: "…" } },
      roles: [],
    });
    expect(accessForPage("dashboard", broken)).toBe("error");
    expect(accessForPage("workspace", broken)).toBe("error");
  });

  it("checks suspension before roles, so an Owner is suspended too", () => {
    expect(accessForPage("dashboard", session({ roles: ["owner"], accountStatus: "suspended" })))
      .toBe("suspended");
  });
});

describe("who may reach the company dashboard", () => {
  const opens = (role: Role) =>
    accessForPage("dashboard", session({ roles: [role] })) === "ready";

  it("admits the four administrating roles", () => {
    expect(["owner", "super_admin", "admin", "hr"].every(r => opens(r as Role))).toBe(true);
  });

  it("refuses everyone else", () => {
    expect(["sales", "employee", "project_member", "research_member", "guest"]
      .some(r => opens(r as Role))).toBe(false);
  });

  it("admits a person holding several roles if any one qualifies", () => {
    expect(accessForPage("dashboard", session({ roles: ["employee", "hr"] })))
      .toBe("ready");
  });
});

describe("a guest approved but not yet onboarded", () => {
  const guest = session({ roles: ["guest"], profileComplete: false });

  it("is sent to the profile to finish onboarding", () => {
    expect(accessForPage("profile", session({ roles: ["guest"] }))).toBe("ready");
    expect(accessForPage("profile", guest)).toBe("incomplete_profile");
  });

  it("cannot reach the workspace", () => {
    expect(accessForPage("workspace", session({ roles: ["guest"] }))).toBe("forbidden");
  });
});

describe("navigation derived from the manifest", () => {
  it("offers a signed-out visitor only public destinations", () => {
    const nav = navigableRoutes([], false);
    expect(nav.every(route => !route.authenticated)).toBe(true);
    expect(nav.map(r => r.page)).toContain("home");
  });

  it("hides the dashboard from an employee and shows it to HR", () => {
    expect(navigableRoutes(["employee"], true).map(r => r.page)).not.toContain("dashboard");
    expect(navigableRoutes(["hr"], true).map(r => r.page)).toContain("dashboard");
  });

  it("offers nothing the gate would then refuse", () => {
    for (const roles of [["employee"], ["hr"], ["owner"], ["guest"], []] as Role[][]) {
      for (const route of navigableRoutes(roles, true)) {
        expect(canOpen(route, roles)).toBe(true);
        expect(accessForPage(route.page, session({ roles }))).toBe("ready");
      }
    }
  });
});

describe("the manifest declares access for every guarded route", () => {
  it("gives each authenticated route an explicit allow list", () => {
    for (const route of routes.filter(r => r.authenticated)) {
      expect(route.allow, `${route.path} must declare who may open it`).toBeTruthy();
      expect(route.allow!.length).toBeGreaterThan(0);
    }
  });

  it("leaves public routes ungated", () => {
    for (const route of routes.filter(r => !r.authenticated)) {
      expect(route.allow, `${route.path} is public and must not declare roles`).toBeUndefined();
    }
  });

  it("resolves a route for every page it declares", () => {
    for (const route of routes) expect(routeFor(route.page)).toBe(route);
  });
});
