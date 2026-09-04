import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(path) && !path.endsWith(".test.ts") ? [path] : [];
  });
}

describe("deployable assets", () => {
  // The header mark shipped broken because `<img src="/assets/img/reid-logo.svg">`
  // is a plain string: Vite rewrites imported assets and files under public/, but
  // leaves literal URLs alone, so nothing was emitted to dist and the tag 404ed in
  // production while still resolving against the dev server.
  it("never references /assets through a bare string literal", () => {
    const offenders = sourceFiles(join(root, "src")).filter((file) =>
      /["'`]\/assets\//.test(readFileSync(file, "utf8")),
    );

    expect(offenders).toEqual([]);
  });

  it("keeps the imported brand mark on disk", () => {
    const logo = readFileSync(join(root, "assets/img/reid-logo.svg"), "utf8");

    expect(logo).toContain("<svg");
    expect(logo).toContain("Reid");
  });
});
