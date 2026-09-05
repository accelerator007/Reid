import { describe, expect, it } from "vitest";
import { firstError, list, messageFor, run, toAppError } from "./db";
import type { Result } from "./db";

const supabaseError = (over: Record<string, unknown>) => ({
  code: null,
  message: null,
  details: null,
  ...over,
});

describe("classifying a Supabase failure", () => {
  it("reads an expired session as something the user can fix", () => {
    const error = toAppError(supabaseError({ code: "PGRST301", message: "JWT expired" }));
    expect(error.kind).toBe("unauthenticated");
    expect(error.message.ar).toContain("سجّل الدخول");
    expect(error.detail).toBe("JWT expired");
  });

  it("reads an RLS write refusal as forbidden, not as a bug", () => {
    const error = toAppError(
      supabaseError({ code: "42501", message: "new row violates row-level security policy" }),
    );
    expect(error.kind).toBe("forbidden");
  });

  it("separates a missing row from an empty result", () => {
    expect(toAppError(supabaseError({ code: "PGRST116" })).kind).toBe("not_found");
  });

  it("maps constraint violations to something the user can correct", () => {
    expect(toAppError(supabaseError({ code: "23505" })).kind).toBe("conflict");
    expect(toAppError(supabaseError({ code: "23514" })).kind).toBe("invalid");
    expect(toAppError(supabaseError({ code: "22P02" })).kind).toBe("invalid");
  });

  it("reads a network failure as an outage rather than a defect", () => {
    expect(toAppError(new TypeError("Failed to fetch")).kind).toBe("offline");
    expect(toAppError(supabaseError({ message: "NetworkError when attempting to fetch" })).kind)
      .toBe("offline");
  });

  it("falls back to HTTP status when no code is given", () => {
    expect(toAppError(supabaseError({ status: 401 })).kind).toBe("unauthenticated");
    expect(toAppError(supabaseError({ status: 403 })).kind).toBe("forbidden");
  });

  it("never leaves a failure unexplained", () => {
    const error = toAppError(supabaseError({ message: "something odd" }));
    expect(error.kind).toBe("unknown");
    expect(error.message.ar.length).toBeGreaterThan(0);
    expect(error.message.en.length).toBeGreaterThan(0);
    expect(toAppError(null).message.en).toBeTruthy();
  });
});

// Our RPCs refuse with `raise exception`, which arrives as P0001 carrying the
// raised text. These are the exact strings the agent gateway raises.
describe("refusals raised by our own database functions", () => {
  it("reads an approval refusal as forbidden", () => {
    expect(toAppError(supabaseError({ code: "P0001", message: "approval_denied" })).kind)
      .toBe("forbidden");
    expect(toAppError(supabaseError({ code: "P0001", message: "owner_approval_required" })).kind)
      .toBe("forbidden");
  });

  it("reads a provider clearance refusal as forbidden", () => {
    const error = toAppError(
      supabaseError({
        code: "P0001",
        message: "provider_not_cleared_for_classification: gemini cannot handle restricted",
      }),
    );
    expect(error.kind).toBe("forbidden");
  });

  it("reads a state refusal as an invalid request", () => {
    expect(toAppError(supabaseError({ code: "P0001", message: "run_not_pending" })).kind)
      .toBe("invalid");
  });
});

describe("running a query", () => {
  const resolves = <T,>(value: { data: T | null; error: unknown }) =>
    Promise.resolve(value);

  it("returns the payload when the call succeeds", async () => {
    const result = await run(resolves({ data: { id: "a" }, error: null }));
    expect(result).toEqual({ ok: true, data: { id: "a" } });
  });

  it("keeps the error instead of swallowing it into an empty value", async () => {
    const result = await run(resolves({ data: null, error: { code: "42501" } }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("forbidden");
  });

  it("catches a rejected call rather than letting it escape", async () => {
    const result = await run(Promise.reject(new TypeError("Failed to fetch")));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("offline");
  });

  it("normalises a missing list to an empty list", async () => {
    const result = await list(resolves({ data: null, error: null }));
    expect(result).toEqual({ ok: true, data: [] });
  });
});

describe("collapsing a panel that loads in parallel", () => {
  const bad = (kind: string): Result<never> =>
    ({ ok: false, error: toAppError(supabaseError({ code: kind })) });

  it("is silent when everything succeeded", () => {
    expect(firstError([{ ok: true, data: 1 }, { ok: true, data: 2 }])).toBeNull();
  });

  it("puts an expired session ahead of the failures it caused", () => {
    const error = firstError([bad("42501"), bad("PGRST301"), bad("23505")]);
    expect(error?.kind).toBe("unauthenticated");
  });

  it("reports an outage ahead of an ordinary failure", () => {
    const error = firstError([bad("23505"), { ok: false, error: toAppError(new TypeError("x")) }]);
    expect(error?.kind).toBe("offline");
  });

  it("otherwise reports the first failure", () => {
    expect(firstError([bad("42501"), bad("23505")])?.kind).toBe("forbidden");
  });
});

describe("presenting an error", () => {
  it("speaks the reader's language", () => {
    const error = toAppError(supabaseError({ code: "42501" }));
    expect(messageFor(error, "ar")).toMatch(/صلاحية/);
    expect(messageFor(error, "en")).toMatch(/permission/);
  });
});
