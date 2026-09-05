// The one source of truth for Reid's routes.
//
// Routing used to live in five places: the `Page` union, a path->page map, a
// page->path map, prefix rules inside resolvePage, and a second hand-written
// list in the Cloudflare Worker. Adding a route meant editing all five, and
// forgetting the Worker shipped a page that worked locally and 404'd in
// production. Both the browser app and the edge now read this file, and
// routes.contract.test.ts fails if they ever disagree.
//
// This module stays free of React and DOM APIs so the Worker can import it.

import type { Role } from "./policy";

export type Page =
  | "home"
  | "login"
  | "apply"
  | "profile"
  | "workspace"
  | "projects"
  | "research"
  | "crm"
  | "dashboard"
  | "privacy"
  | "not-found";

export type Route = {
  readonly page: Exclude<Page, "not-found">;
  readonly path: string;
  /** The route owns its child paths as deep links, e.g. /projects/:id. */
  readonly deepLinks?: boolean;
  /** Rendering requires a session. The edge still serves the shell; the app decides. */
  readonly authenticated?: boolean;
  /**
   * Roles that may open the route. Absent on a public route, required on an
   * authenticated one, which routes.contract.test.ts enforces.
   *
   * This is the coarse gate deciding whether a page opens at all and what the
   * navigation offers. It is never the security boundary: row-level security
   * in the database decides which rows the page can actually read.
   */
  readonly allow?: readonly Role[];
};

/** Every role that holds a company seat. Guests are deliberately excluded. */
const staff: readonly Role[] = [
  "owner",
  "super_admin",
  "admin",
  "hr",
  "sales",
  "employee",
  "project_member",
  "research_member",
];

/** Roles that administer the company rather than work inside it. */
const administrators: readonly Role[] = ["owner", "super_admin", "admin", "hr"];

export const routes: readonly Route[] = [
  { page: "home", path: "/" },
  { page: "login", path: "/login" },
  { page: "apply", path: "/apply" },
  { page: "privacy", path: "/privacy" },
  // A guest has a profile but no workspace: the profile route admits everyone
  // with a session so an approved applicant can complete onboarding.
  { page: "profile", path: "/profile", authenticated: true, allow: [...staff, "guest"] },
  { page: "workspace", path: "/workspace", authenticated: true, allow: staff },
  { page: "projects", path: "/projects", deepLinks: true, authenticated: true, allow: staff },
  { page: "research", path: "/research", deepLinks: true, authenticated: true, allow: staff },
  { page: "crm", path: "/crm", authenticated: true, allow: ["owner", "super_admin", "admin", "hr", "sales"] },
  { page: "dashboard", path: "/dashboard", authenticated: true, allow: administrators },
];

/** Where the in-app 404 lives. It is never served by the edge. */
export const notFoundPath = "/404";

/** Trailing slashes are cosmetic; "/projects/" and "/projects" are one route. */
export function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

export function resolvePage(pathname: string): Page {
  const normalized = normalizePath(pathname);
  const exact = routes.find(route => route.path === normalized);
  if (exact) return exact.page;
  const parent = routes.find(
    route => route.deepLinks && normalized.startsWith(`${route.path}/`),
  );
  return parent ? parent.page : "not-found";
}

/** May a holder of these roles open this route at all? */
export function canOpen(route: Route, roles: readonly Role[]): boolean {
  if (!route.allow) return true;
  return route.allow.some(allowed => roles.includes(allowed));
}

/** The routes a navigation should offer, in declaration order. */
export function navigableRoutes(
  roles: readonly Role[],
  signedIn: boolean,
): readonly Route[] {
  return routes.filter(route =>
    route.authenticated ? signedIn && canOpen(route, roles) : true,
  );
}

export function routeFor(page: Page): Route | undefined {
  return routes.find(route => route.page === page);
}

export function pathFor(page: Page): string {
  if (page === "not-found") return notFoundPath;
  const route = routes.find(candidate => candidate.page === page);
  // Unreachable while Page and routes stay in step, which the contract test proves.
  if (!route) throw new Error(`unrouted_page: ${page}`);
  return route.path;
}

/**
 * Does the edge need to serve the application shell for this path?
 *
 * "/" is excluded on purpose: it is the shell already, so the asset handler
 * serves it directly without a rewrite.
 */
export function isAppShellPath(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  if (normalized === "/") return false;
  return resolvePage(normalized) !== "not-found";
}

/** Old static URLs kept working so existing links and search results survive. */
export const legacyRedirects: Readonly<Record<string, string>> = {
  "/privacy.html": "/privacy",
};
