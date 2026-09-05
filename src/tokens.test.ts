import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The design system holds only while these two rules hold. Colour drift is
// invisible in review - a seventeenth shade of purple looks like the other
// sixteen - so it is checked here instead.

const dir = "src";
const sheets = readdirSync(dir).filter(name => name.endsWith(".css"));
const read = (name: string) => readFileSync(join(dir, name), "utf8");

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const DEFINED = /--([a-zA-Z][\w-]*)\s*:/g;
const USED = /var\(\s*--([\w-]+)/g;

describe("tokens are the only place a colour is named", () => {
  it("ships a token layer", () => {
    expect(sheets).toContain("tokens.css");
  });

  it.each(sheets.filter(name => name !== "tokens.css"))(
    "%s writes no colour literal",
    name => {
      const found = read(name).match(HEX) ?? [];
      expect(found, `${name} should use a token, not ${found.join(", ")}`)
        .toEqual([]);
    },
  );
});

describe("the dark theme covers what the light theme defines", () => {
  const tokens = read("tokens.css");
  const [light, dark] = (() => {
    const at = tokens.indexOf(".dark");
    expect(at).toBeGreaterThan(-1);
    return [tokens.slice(0, at), tokens.slice(at)];
  })();

  const names = (block: string) =>
    new Set(Array.from(block.matchAll(DEFINED), m => m[1]));

  it("redefines every colour token that carries a literal value", () => {
    const lightNames = names(light);
    const darkNames = names(dark);
    // Aliases and geometry do not flip with the theme; raw colours must.
    const flips = Array.from(lightNames).filter(name => {
      const declaration = light.match(new RegExp(`--${name}\\s*:([^;]+);`));
      const value = declaration?.[1] ?? "";
      // Geometry, scrims and the deep brand fills do not flip: 500 and 700
      // carry white --on-brand text and stay deep on either ground. Naming
      // them here keeps the exemption a decision rather than a loophole.
      const exempt = /^(radius|shadow|scrim|on-brand|brand-(500|600|700))/;
      return HEX.test(value) && !exempt.test(name);
    });
    const missing = flips.filter(name => !darkNames.has(name));
    expect(missing, `no dark value for: ${missing.join(", ")}`).toEqual([]);
  });

  it("gives the dark theme its own elevation, not the light one", () => {
    expect(dark).toMatch(/--shadow-sm\s*:/);
  });
});

describe("every token referenced actually exists", () => {
  const defined = new Set(
    Array.from(read("tokens.css").matchAll(DEFINED), m => m[1]),
  );

  it.each(sheets)("%s references only defined tokens", name => {
    const used = new Set(Array.from(read(name).matchAll(USED), m => m[1]));
    const missing = Array.from(used).filter(token => !defined.has(token));
    expect(missing, `${name} uses undefined token(s): ${missing.join(", ")}`)
      .toEqual([]);
  });
});

describe("brand and state stay separate", () => {
  const tokens = read("tokens.css");

  it("keeps semantic state colours out of the brand ramp", () => {
    const brand = tokens.match(/--brand-\d00\s*:\s*([^;]+);/g) ?? [];
    expect(brand.length).toBeGreaterThanOrEqual(6);
    for (const kind of ["good", "warn", "risk"]) {
      expect(tokens).toMatch(new RegExp(`--${kind}\\s*:`));
      expect(tokens).toMatch(new RegExp(`--${kind}-fill\\s*:`));
    }
  });
});
