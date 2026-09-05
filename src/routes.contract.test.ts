import { describe, expect, it, vi } from "vitest";
import worker from "./worker";
import {
  isAppShellPath,
  notFoundPath,
  pathFor,
  resolvePage,
  routes,
} from "./routes";
import type { Page } from "./routes";

// Reid shipped a page that worked locally and 404'd in production because the
// browser knew a route the Cloudflare Worker did not. These checks make that
// class of bug fail in CI instead of on reidpro.com.

function createAssets() {
  return {
    fetch: vi.fn(
      async (request: Request) =>
        new URL(request.url).pathname === "/"
          ? new Response("<main>Reid</main>", { status: 200 })
          : new Response("Not found", { status: 404 }),
    ),
  };
}

const serve = (path: string) =>
  worker.fetch(new Request(`https://reidpro.com${path}`), {
    ASSETS: createAssets(),
  });

describe("the app and the edge agree on every route", () => {
  it.each(routes.filter(route => route.path !== "/"))(
    "$path renders the shell at the edge",
    async route => {
      const response = await serve(route.path);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("Reid");
    },
  );

  it.each(routes.filter(route => route.deepLinks))(
    "$path owns its deep links",
    async route => {
      const child = `${route.path}/00000000-0000-0000-0000-000000000001`;
      expect(resolvePage(child)).toBe(route.page);
      expect((await serve(child)).status).toBe(200);
    },
  );

  it("never serves the shell for a path the app cannot render", async () => {
    for (const path of ["/not-a-real-page", "/projectsx", "/research-notes"]) {
      expect(resolvePage(path)).toBe("not-found");
      expect(isAppShellPath(path)).toBe(false);
      expect((await serve(path)).status).toBe(404);
    }
  });

  it("leaves the root to the asset handler untouched", async () => {
    expect(isAppShellPath("/")).toBe(false);
    expect(resolvePage("/")).toBe("home");
  });
});

describe("route manifest", () => {
  it("round-trips every page through its path", () => {
    for (const route of routes) {
      expect(resolvePage(pathFor(route.page))).toBe(route.page);
    }
  });

  it("gives the in-app 404 a path the edge refuses to serve", () => {
    expect(pathFor("not-found" as Page)).toBe(notFoundPath);
    expect(isAppShellPath(notFoundPath)).toBe(false);
  });

  it("ignores a trailing slash", () => {
    expect(resolvePage("/projects/")).toBe("projects");
    expect(resolvePage("/dashboard/")).toBe("dashboard");
  });

  it("declares no duplicate path or page", () => {
    expect(new Set(routes.map(r => r.path)).size).toBe(routes.length);
    expect(new Set(routes.map(r => r.page)).size).toBe(routes.length);
  });

  it("keeps every authenticated route out of the public sitemap", async () => {
    const sitemap = await import("node:fs").then(fs =>
      fs.readFileSync("public/sitemap.xml", "utf8"),
    );
    for (const route of routes.filter(r => r.authenticated)) {
      expect(sitemap).not.toContain(`<loc>https://reidpro.com${route.path}</loc>`);
    }
  });

  it("still redirects the legacy privacy URL", async () => {
    const response = await serve("/privacy.html");
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://reidpro.com/privacy");
  });
});
