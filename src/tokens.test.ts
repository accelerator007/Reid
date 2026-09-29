import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// The design system holds only while these rules hold. Colour drift is
// invisible in review — a seventeenth shade of purple looks like the other
// sixteen — and so is a contrast regression, so both are checked here.

const root = "src";
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
const sheets = walk(root).filter(path => path.endsWith(".css")).map(path => relative(root, path));
const read = (name: string) => readFileSync(join(root, name), "utf8");

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const DEFINED = /--([a-zA-Z][\w-]*)\s*:/g;
const USED = /var\(\s*--([\w-]+)/g;

const tokens = read("tokens.css");
// tokens.css is flat: ":root" (ramps), ":root, .dark" (semantics and aliases,
// recomputed per theme) and ".dark" (dark ramps and adjustments, last).
const blocks = Array.from(tokens.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g), match => ({
  selector: match[1].replace(/\s+/g, ""),
  body: match[2],
}));
const blockFor = (selector: string) => blocks.filter(block => block.selector === selector).map(block => block.body).join("\n");
const rootBlock = blockFor(":root");
const sharedBlock = blockFor(":root,.dark");
const darkBlock = blockFor(".dark");
const lightBlock = rootBlock + sharedBlock;

describe("tokens are the only place a colour is named", () => {
  it("ships a token layer and a font layer", () => {
    expect(sheets).toContain("tokens.css");
    expect(sheets).toContain("fonts.css");
  });

  it.each(sheets.filter(name => name !== "tokens.css"))("%s writes no colour literal", name => {
    const found = read(name).match(HEX) ?? [];
    expect(found, `${name} should use a token, not ${found.join(", ")}`).toEqual([]);
  });
});

describe("the dark theme covers what the light theme defines", () => {
  const names = (block: string) => new Set(Array.from(block.matchAll(DEFINED), m => m[1]));

  it("redefines every ramp colour for the dark theme", () => {
    expect(darkBlock).not.toBe("");
    const darkNames = names(darkBlock);
    const literal = Array.from(names(rootBlock)).filter(name => {
      const value = rootBlock.match(new RegExp(`--${name}\\s*:([^;]+);`))?.[1] ?? "";
      return new RegExp(HEX.source).test(value);
    });
    const missing = literal.filter(name => !darkNames.has(name));
    expect(missing, `no dark value for: ${missing.join(", ")}`).toEqual([]);
  });

  it("gives the dark theme its own elevation", () => {
    expect(darkBlock).toMatch(/--shadow-2\s*:/);
  });

  // A semantic declared only on :root resolves its var() there and every
  // descendant inherits the light value, so the dark theme would never apply.
  it("recomputes semantics on the theme element, not only on :root", () => {
    expect(sharedBlock).toMatch(/--text\s*:\s*var\(--neutral-12\)/);
    expect(rootBlock).not.toMatch(/--text\s*:/);
    const semanticInRoot = Array.from(names(rootBlock)).filter(name => /var\(--/.test(rootBlock.match(new RegExp(`--${name}\\s*:([^;]+);`))?.[1] ?? ""));
    expect(semanticInRoot, `move to ":root, .dark": ${semanticInRoot.join(", ")}`).toEqual([]);
  });
});

describe("every token referenced actually exists", () => {
  const defined = new Set(Array.from(tokens.matchAll(DEFINED), m => m[1]));
  it.each(sheets)("%s references only defined tokens", name => {
    const local = new Set(Array.from(read(name).matchAll(DEFINED), m => m[1]));
    const used = new Set(Array.from(read(name).matchAll(USED), m => m[1]));
    const missing = Array.from(used).filter(token => !defined.has(token) && !local.has(token));
    expect(missing, `${name} uses undefined token(s): ${missing.join(", ")}`).toEqual([]);
  });
});

describe("brand and state stay separate", () => {
  it("has a full brand ramp and separate state colours", () => {
    const brand = rootBlock.match(/--brand-\d+\s*:\s*#/g) ?? [];
    expect(brand.length).toBe(12);
    for (const state of ["success", "warning", "danger", "info"]) {
      for (const part of ["soft", "border", "solid", "text"]) {
        expect(lightBlock).toMatch(new RegExp(`--${state}-${part}\\s*:`));
      }
    }
  });

  it("keeps every legacy alias older stylesheets rely on", () => {
    for (const legacy of ["bg", "card", "ink", "muted", "line", "purple", "good", "good-fill", "warn", "warn-fill", "risk", "risk-fill", "brand-gradient", "brand-400", "brand-600"]) {
      expect(lightBlock).toMatch(new RegExp(`--${legacy}\\s*:`));
    }
  });
});

// ---------------------------------------------------------------- contrast

type Theme = Map<string, string>;
const declarations = (block: string): Theme => {
  const map: Theme = new Map();
  for (const match of block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) map.set(match[1], match[2].trim());
  return map;
};
const light = new Map([...declarations(rootBlock), ...declarations(sharedBlock)]);
// On the .dark element: root ramps, then the shared layer, then the dark block (last in source).
const dark = new Map([...declarations(rootBlock), ...declarations(sharedBlock), ...declarations(darkBlock)]);

const resolve = (theme: Theme, name: string, depth = 0): string => {
  const value = theme.get(name);
  if (!value || depth > 10) throw new Error(`unresolved --${name}`);
  const alias = value.match(/^var\(--([\w-]+)\)$/);
  return alias ? resolve(theme, alias[1], depth + 1) : value;
};
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (theme: Theme, a: string, b: string) => {
  const [x, y] = [luminance(resolve(theme, a)), luminance(resolve(theme, b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// WCAG 2.2 AA: 4.5:1 for text, 3:1 for component boundaries and focus.
const pairs: Array<[string, string, number]> = [
  ["text", "surface", 4.5], ["text", "surface-app", 4.5], ["text", "surface-sunken", 4.5],
  ["text-muted", "surface", 4.5], ["text-muted", "surface-app", 4.5], ["text-muted", "surface-sunken", 4.5],
  ["text-subtle", "surface", 3],
  ["primary-text", "surface", 4.5], ["primary-text", "surface-app", 4.5], ["primary-text", "primary-soft", 4.5],
  ["on-primary", "primary", 4.5], ["on-primary", "primary-hover", 4.5],
  ["accent-text", "accent-soft", 4.5],
  ["success-text", "success-soft", 4.5], ["warning-text", "warning-soft", 4.5],
  ["danger-text", "danger-soft", 4.5], ["info-text", "info-soft", 4.5],
  ["success-text", "surface", 4.5], ["warning-text", "surface", 4.5], ["danger-text", "surface", 4.5],
  ["border-strong", "surface", 3], ["focus-ring", "surface", 3],
];

describe.each([["light", light], ["dark", dark]] as const)("%s theme contrast", (_name, theme) => {
  it.each(pairs)("%s on %s ≥ %s:1", (foreground, background, minimum) => {
    expect(contrast(theme, foreground, background)).toBeGreaterThanOrEqual(minimum);
  });
});
