import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const component = readFileSync(new URL("./whatsapp-inbox.tsx", import.meta.url), "utf8");
const endpoint = readFileSync(new URL("../supabase/functions/whatsapp-inbox/index.ts", import.meta.url), "utf8");
const webhook = readFileSync(new URL("../supabase/functions/whatsapp-webhook/index.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/202609060004_whatsapp_owner_inbox.sql", import.meta.url), "utf8");
const reminderMigration = readFileSync(new URL("../supabase/migrations/202609070001_personal_reminders_memory_v2.sql", import.meta.url), "utf8");
const reminderDispatch = readFileSync(new URL("../supabase/functions/reminder-dispatch/index.ts", import.meta.url), "utf8");

describe("WhatsApp Owner inbox contract", () => {
  it("keeps the permanent Meta token on the server", () => {
    expect(component).not.toContain("META_WHATSAPP_ACCESS_TOKEN");
    expect(endpoint).toContain("META_WHATSAPP_ACCESS_TOKEN");
  });

  it("enforces Owner access and the free-form 24-hour window", () => {
    expect(endpoint).toContain(".eq('role', 'owner')");
    expect(endpoint).toContain("outside_24h_window");
  });

  it("ships RLS for both normalized inbox tables", () => {
    expect(migration).toContain("whatsapp_conversations_owner_read");
    expect(migration).toContain("whatsapp_messages_owner_read");
    expect(migration).toContain("enable row level security");
  });

  it("notifies the responsible Owners without breaking WhatsApp delivery", () => {
    expect(webhook).toContain("notifyOwners");
    expect(webhook).toContain("ADMIN_NOTIFICATION_EMAILS");
    expect(webhook).toContain("owner_notification_failed");
  });

  it("maps each WhatsApp Owner to separate context and redacts obvious secrets", () => {
    expect(webhook).toContain("WHATSAPP_OWNER_EMAIL_MAP");
    expect(webhook).toContain("personalizedInput");
    expect(webhook).toContain("[OTP محذوف]");
    expect(webhook).toContain("requesterId:identity.id");
  });

  it("acts as a personal chief of staff and persists isolated user memory", () => {
    expect(webhook).toContain("رئيس مكتبه الرقمي");
    expect(webhook).toContain("rememberOwnerMessage");
    expect(webhook).toContain("scope:'user'");
    expect(webhook).toContain("scope_id:identity.id");
  });

  it("accepts typed Arabic approval and rejection for the latest pending command", () => {
    expect(webhook).toContain("plainDecision");
    expect(webhook).toContain("لا يوجد أمر معلّق");
    expect(webhook).toContain("تمت الموافقة على الأمر");
  });

  it("keeps normal conversation natural and reserves approval for real tools", () => {
    const gateway = readFileSync(new URL("../supabase/functions/llm-gateway/index.ts", import.meta.url), "utf8");
    expect(webhook).toContain("أجب مباشرة عن التحية");
    expect(webhook).not.toContain("`رد الوكيل:\\n${result.output}`");
    expect(gateway).toContain("let effectiveApproval = 0");
    expect(gateway).toContain("effectiveApproval = tool.approval_level");
  });

  it("grounds external-facing specialists with live Google Search sources", () => {
    const gateway = readFileSync(new URL("../supabase/functions/llm-gateway/index.ts", import.meta.url), "utf8");
    expect(gateway).toContain("google_search");
    expect(gateway).toContain("'marketing', 'content', 'competitor', 'knowledge'");
    expect(gateway).toContain("groundingChunks");
  });

  it("renders optional model-selected next steps as WhatsApp buttons", () => {
    expect(webhook).toContain("sendChoices");
    expect(webhook).toContain("assistantReply");
    expect(webhook).toContain("خيارات\\s*");
    expect(webhook).toContain("slice(0, 3)");
    expect(webhook).toContain("slice(0, 20)");
    expect(webhook).toContain("sendList");
    expect(webhook).toContain("عرض الخيارات");
  });

  it("executes project reads and L1 task creation instead of pretending", () => {
    expect(webhook).toContain("المشاريع المتأخرة");
    expect(webhook).toContain("matchingProjects");
    expect(webhook).toContain("toolName:'tasks.create'");
    expect(webhook).toContain("تم إنشاء المهمة");
    expect(webhook).toContain("https://reidpro.com/projects/");
  });

  it("creates real isolated reminders and dispatches them through an authenticated scheduler", () => {
    expect(reminderMigration).toContain("create table public.personal_reminders");
    expect(reminderMigration).toContain("personal_reminders_owner_read");
    expect(webhook).toContain("parseReminder");
    expect(webhook).toContain("تم ضبط التذكير");
    expect(reminderDispatch).toContain("REID_REMINDER_CRON_TOKEN");
    expect(reminderDispatch).toContain("status:'sent'");
  });

  it("supports explicit durable memory inspection and deletion", () => {
    expect(reminderMigration).toContain("memory_kind");
    expect(reminderMigration).toContain("expires_at");
    expect(webhook).toContain("تفضيل محفوظ من واتساب");
    expect(webhook).toContain("أتذكر عنك");
    expect(webhook).toContain("تم حذف");
  });
});
