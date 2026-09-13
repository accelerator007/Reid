import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { routeFor } from "./routes";

const component = readFileSync(new URL("./workshops.tsx", import.meta.url), "utf8");
const main = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./reid-os.css", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/202609130003_workshops.sql", import.meta.url), "utf8");
const gateway = readFileSync(new URL("../supabase/functions/llm-gateway/index.ts", import.meta.url), "utf8");
const publicServer = readFileSync(new URL("../server/index.mjs", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("../public/sitemap.xml", import.meta.url), "utf8");

describe("workshop catalogue and management", () => {
  it("ships one public route that the app, navigation, and sitemap render", () => {
    expect(routeFor("workshops")).toMatchObject({ path: "/workshops" });
    expect(routeFor("workshops")?.authenticated).toBeUndefined();
    expect(main).toContain('page === "workshops"');
    expect(main).toContain('<Workshops lang={lang} go={go} />');
    expect(sitemap).toContain("https://reidpro.com/workshops");
  });

  it("has bilingual, responsive loading, error, empty, and management states", () => {
    expect(component).toContain("ورش ريّد");
    expect(component).toContain("Reid workshops");
    expect(component).toContain("جارٍ تحميل الورش");
    expect(component).toContain('role="alert"');
    expect(component).toContain("لا توجد ورش ظاهرة الآن");
    expect(component).toContain("useSession");
    expect(component).not.toContain('from("user_roles")');
    expect(styles).toContain(".os-workshop-grid");
    expect(styles).toContain("@media(max-width:700px)");
  });

  it("protects drafts and registrations with database policies", () => {
    expect(migration).toContain("alter table public.workshops enable row level security");
    expect(migration).toContain("workshops_public_read");
    expect(migration).toContain("status='published' and visibility='public'");
    expect(migration).toContain("workshops_manager_insert");
    expect(migration).toContain("workshop_registrations_read");
    expect(migration).toContain("attendee_id=auth.uid()");
    expect(migration).toContain("register_for_workshop");
    expect(migration).toContain("for update");
    expect(migration).toContain("waitlisted");
    expect(migration).toContain("cancel_workshop_registration");
  });

  it("grounds internal agents in workshop data through a bounded read tool", () => {
    expect(migration).toContain("workshops.list");
    expect(migration).toContain("'ceo','workshops.list'");
    expect(migration).toContain("'support','workshops.list'");
    expect(gateway).toContain("context.workshops");
    expect(gateway).toContain("case 'workshops.list'");
    expect(gateway).toContain("registration_count");
  });

  it("gives the public assistant only published public upcoming workshops", () => {
    expect(publicServer).toContain("PUBLIC_WORKSHOPS=");
    expect(publicServer).toContain(".eq('status','published').eq('visibility','public')");
    expect(publicServer).toContain("https://reidpro.com/workshops");
    expect(publicServer).not.toMatch(/publicWorkshops=.*workshop_registrations/);
  });
});
