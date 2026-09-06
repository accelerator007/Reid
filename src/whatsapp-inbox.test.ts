import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const component = readFileSync(new URL("./whatsapp-inbox.tsx", import.meta.url), "utf8");
const endpoint = readFileSync(new URL("../supabase/functions/whatsapp-inbox/index.ts", import.meta.url), "utf8");
const webhook = readFileSync(new URL("../supabase/functions/whatsapp-webhook/index.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/202609060004_whatsapp_owner_inbox.sql", import.meta.url), "utf8");

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
});
