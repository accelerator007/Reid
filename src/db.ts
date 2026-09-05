// A typed boundary between the application and Supabase.
//
// Two failure modes were losing information before this existed:
//
//   1. `(result.data || [])` swallowed the error object. An expired session, a
//      network drop and a real empty table all rendered as the same blank
//      panel, with nothing for the user or the log to act on.
//
//   2. Row-level security does not raise on SELECT. It filters. A user who may
//      not see a row receives `[]` and HTTP 200, indistinguishable from a table
//      that is genuinely empty. The client cannot tell these apart, so this
//      module refuses to guess: `empty` is its own outcome, and the UI says
//      "nothing visible to you" rather than showing an unexplained void.
//
// Every message is bilingual because the application is, and every error keeps
// a technical `detail` for the console that is never shown to the user.

export type ErrorKind =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid"
  | "offline"
  | "unknown";

export type Message = { ar: string; en: string };

export type AppError = {
  kind: ErrorKind;
  message: Message;
  /** Raw provider text. For logs and bug reports, never for the interface. */
  detail?: string;
};

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

const messages: Record<ErrorKind, Message> = {
  unauthenticated: {
    ar: "انتهت جلستك. سجّل الدخول من جديد للمتابعة.",
    en: "Your session ended. Sign in again to continue.",
  },
  forbidden: {
    ar: "لا تملك صلاحية هذا الإجراء. راجع مدير النظام إن كنت تتوقع الوصول.",
    en: "You do not have permission for this action. Ask an administrator if you expected access.",
  },
  not_found: {
    ar: "العنصر غير موجود، أو حُذف.",
    en: "That item does not exist, or was deleted.",
  },
  conflict: {
    ar: "هذا السجل موجود مسبقاً.",
    en: "That record already exists.",
  },
  invalid: {
    ar: "البيانات المُدخلة غير مقبولة. راجع الحقول وحاول مرة أخرى.",
    en: "The submitted data was rejected. Check the fields and try again.",
  },
  offline: {
    ar: "تعذّر الوصول إلى الخادم. تحقّق من اتصالك ثم أعد المحاولة.",
    en: "Could not reach the server. Check your connection and try again.",
  },
  unknown: {
    ar: "حدث خطأ غير متوقع. أعد المحاولة، ثم أبلغ الدعم إن تكرّر.",
    en: "Something unexpected went wrong. Try again, then tell support if it persists.",
  },
};

/** Postgres and PostgREST codes, mapped to what the user can do about them. */
const byCode: Record<string, ErrorKind> = {
  // PostgREST
  PGRST301: "unauthenticated", // JWT expired or invalid
  PGRST116: "not_found", // .single() matched no row
  PGRST204: "invalid", // column named in the payload does not exist
  // Postgres
  "42501": "forbidden", // insufficient_privilege — an RLS write was refused
  "23505": "conflict", // unique_violation
  "23503": "invalid", // foreign_key_violation
  "23514": "invalid", // check_violation
  "23502": "invalid", // not_null_violation
  "22P02": "invalid", // invalid_text_representation, e.g. a malformed uuid
};

/**
 * Our own RPCs signal refusals with `raise exception`, which arrives as P0001
 * with the raised text. `approve_agent_run` and the agent clearance trigger
 * both do this, so the text decides between a refusal and a bad request.
 */
function classifyRaised(detail: string): ErrorKind {
  const text = detail.toLowerCase();
  if (/denied|not_cleared|required|forbidden/.test(text)) return "forbidden";
  if (/not_found/.test(text)) return "not_found";
  return "invalid";
}

type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
  status?: number | null;
  details?: string | null;
};

export function toAppError(raw: unknown): AppError {
  if (raw == null) return { kind: "unknown", message: messages.unknown };

  // fetch() rejects with a TypeError when the network is unreachable.
  if (raw instanceof TypeError) {
    return { kind: "offline", message: messages.offline, detail: raw.message };
  }

  const error = raw as SupabaseLikeError;
  const detail = error.message || error.details || String(raw);

  if (error.code === "P0001") {
    const kind = classifyRaised(detail);
    return { kind, message: messages[kind], detail };
  }

  const byCodeKind = error.code ? byCode[error.code] : undefined;
  if (byCodeKind) {
    return { kind: byCodeKind, message: messages[byCodeKind], detail };
  }

  if (error.status === 401) {
    return { kind: "unauthenticated", message: messages.unauthenticated, detail };
  }
  if (error.status === 403) {
    return { kind: "forbidden", message: messages.forbidden, detail };
  }
  if (error.status === 404) {
    return { kind: "not_found", message: messages.not_found, detail };
  }
  // Anything the browser could not send at all reads as an outage, not a bug.
  if (/failed to fetch|networkerror|load failed/i.test(detail)) {
    return { kind: "offline", message: messages.offline, detail };
  }

  return { kind: "unknown", message: messages.unknown, detail };
}

export const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
export const fail = (raw: unknown): Result<never> => ({
  ok: false,
  error: toAppError(raw),
});

/** Wraps any Supabase call so a thrown error and a returned error land alike. */
export async function run<T>(
  query: PromiseLike<{ data: T | null; error: unknown }>,
): Promise<Result<T | null>> {
  try {
    const { data, error } = await query;
    return error ? fail(error) : ok(data);
  } catch (thrown) {
    return fail(thrown);
  }
}

/** A list query. A missing payload is an empty list, never null. */
export async function list<T>(
  query: PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<Result<T[]>> {
  const result = await run<T[]>(query);
  return result.ok ? ok(result.data ?? []) : result;
}

export function messageFor(error: AppError, lang: "ar" | "en"): string {
  return error.message[lang];
}

/**
 * Collapses several results into one outcome for a panel that loads in
 * parallel. The first real failure wins, and an authentication problem
 * outranks the rest because it explains every other failure beside it.
 */
export function firstError(results: readonly Result<unknown>[]): AppError | null {
  const errors = results.flatMap(result => (result.ok ? [] : [result.error]));
  if (errors.length === 0) return null;
  return (
    errors.find(error => error.kind === "unauthenticated") ??
    errors.find(error => error.kind === "offline") ??
    errors[0]
  );
}
