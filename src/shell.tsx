// The authenticated shell.
//
// Session, roles, account status and profile completion were each resolved
// independently by App, Dashboard, EmployeeWorkspace, ProjectWorkspace and
// ResearchWorkspace: seven separate reads of `user_roles` in one session, five
// hand-written gates that could disagree, and a navigation that offered every
// signed-in visitor every destination regardless of role.
//
// This module resolves that state once and hands it down. Which roles may open
// which route is declared in src/routes.ts, so the gate and the navigation can
// no longer disagree either.
//
// None of this is a security boundary. It decides what a person is offered;
// row-level security in the database decides what they can actually read.
import React from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { list, run } from "./db";
import type { AppError } from "./db";
import { canOpen, navigableRoutes, routeFor } from "./routes";
import type { Page, Route } from "./routes";
import type { Role } from "./policy";

export type AccessState =
  | "loading"
  | "anonymous"
  | "incomplete_profile"
  | "suspended"
  | "forbidden"
  | "error"
  | "ready";

export type SessionValue = {
  user: User | null;
  roles: readonly Role[];
  accountStatus: string;
  /** A LinkedIn URL on the profile is what marks onboarding as finished. */
  profileComplete: boolean;
  loading: boolean;
  error: AppError | null;
  reload: () => Promise<void>;
};

const empty: SessionValue = {
  user: null,
  roles: [],
  accountStatus: "active",
  profileComplete: false,
  loading: true,
  error: null,
  reload: async () => {},
};

const SessionContext = React.createContext<SessionValue>(empty);

export const useSession = () => React.useContext(SessionContext);

export function SessionProvider({
  user,
  children,
}: {
  user: User | null;
  children: React.ReactNode;
}) {
  const [state, setState] = React.useState<Omit<SessionValue, "reload">>({
    ...empty,
    user,
  });

  const load = React.useCallback(async () => {
    if (!supabase || !user) {
      setState({ ...empty, user: null, loading: false });
      return;
    }
    setState(previous => ({ ...previous, user, loading: true, error: null }));

    const [roles, control, profile] = await Promise.all([
      list<{ role: Role }>(
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ),
      run<{ status: string }>(
        supabase
          .from("account_controls")
          .select("status")
          .eq("user_id", user.id)
          .maybeSingle(),
      ),
      run<{ linkedin_url: string | null }>(
        supabase
          .from("profiles")
          .select("linkedin_url")
          .eq("id", user.id)
          .maybeSingle(),
      ),
    ]);

    // Suspension and role membership decide whether the workspace opens, so a
    // failed read of either must not be mistaken for permission. It is an
    // error state, and the gate stays closed.
    const failure = !roles.ok ? roles.error : !control.ok ? control.error : null;
    if (failure) {
      setState({ ...empty, user, loading: false, error: failure });
      return;
    }

    setState({
      user,
      roles: roles.ok ? roles.data.map(row => row.role) : [],
      accountStatus: control.ok ? control.data?.status || "active" : "active",
      // A profile that cannot be read is treated as incomplete, which sends the
      // person to a page they can fix rather than into a half-loaded workspace.
      profileComplete: profile.ok
        ? Boolean(profile.data?.linkedin_url)
        : false,
      loading: false,
      error: null,
    });
  }, [user]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const value = React.useMemo<SessionValue>(
    () => ({ ...state, reload: load }),
    [state, load],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

/** Why a route is or is not open to the current session. */
export function accessFor(
  route: Route | undefined,
  session: SessionValue,
): AccessState {
  if (!route?.authenticated) return "ready";
  if (session.loading) return "loading";
  if (session.error) return "error";
  if (!session.user) return "anonymous";
  if (session.accountStatus !== "active") return "suspended";
  if (!session.profileComplete) return "incomplete_profile";
  return canOpen(route, session.roles) ? "ready" : "forbidden";
}

export function accessForPage(page: Page, session: SessionValue): AccessState {
  return accessFor(routeFor(page), session);
}

/** Destinations this session may actually reach, derived from the manifest. */
export function useNavigation(): readonly Route[] {
  const session = useSession();
  return React.useMemo(
    () => navigableRoutes(session.roles, Boolean(session.user)),
    [session.roles, session.user],
  );
}

/** The one gate. Every guarded route refuses through this, for a stated reason. */
export function Gate({
  title,
  action,
  label,
}: {
  title: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <main className="auth">
      <section className="auth-card">
        <h1>{title}</h1>
        {action && (
          <button className="primary" onClick={action}>
            {label}
          </button>
        )}
      </section>
    </main>
  );
}

const gateCopy: Record<
  Exclude<AccessState, "ready" | "loading">,
  { ar: string; en: string }
> = {
  anonymous: {
    ar: "تسجيل الدخول مطلوب",
    en: "Sign in required",
  },
  incomplete_profile: {
    ar: "أكمل ملفك الشخصي أولاً",
    en: "Complete your profile first",
  },
  suspended: {
    ar: "الحساب موقوف. تواصل مع الإدارة.",
    en: "Account suspended. Contact an administrator.",
  },
  forbidden: {
    ar: "لا تملك صلاحية فتح هذه الصفحة.",
    en: "You do not have permission to open this page.",
  },
  error: {
    ar: "تعذّر التحقّق من صلاحياتك.",
    en: "Could not verify your access.",
  },
};

/**
 * Wraps a guarded page. Every refusal states its reason and, where the person
 * can act on it, offers the action that resolves it.
 */
export function Guarded({
  page,
  lang,
  renderSignIn,
  onProfile,
  children,
}: {
  page: Page;
  lang: "ar" | "en";
  /**
   * Rendered when there is no session. It is a render prop so the sign-in form
   * can send the person back to the page they asked for, rather than dropping
   * them at /login with their destination forgotten.
   */
  renderSignIn: () => React.ReactNode;
  onProfile: () => void;
  children: React.ReactNode;
}) {
  const session = useSession();
  const access = accessForPage(page, session);

  if (access === "ready") return <>{children}</>;
  if (access === "loading") {
    return (
      <Gate title={lang === "ar" ? "جارٍ التحقّق…" : "Checking access…"} />
    );
  }

  // An unreadable session is reported as a failure with a retry, never as a
  // permission problem: the roles list is empty in both cases.
  if (access === "error") {
    return (
      <Gate
        title={session.error ? session.error.message[lang] : gateCopy.error[lang]}
        action={() => void session.reload()}
        label={lang === "ar" ? "أعد المحاولة" : "Try again"}
      />
    );
  }

  // Signing in is offered inline, keeping the requested destination, instead
  // of a dead-end gate that forgets where the person was going.
  if (access === "anonymous") return <>{renderSignIn()}</>;

  const copy = gateCopy[access];
  if (access === "incomplete_profile") {
    return (
      <Gate
        title={copy[lang]}
        action={onProfile}
        label={lang === "ar" ? "ملفي" : "My profile"}
      />
    );
  }
  return <Gate title={copy[lang]} />;
}
