export type Lang = 'ar' | 'en';

export type Status = {
  connection: string;
  qr: string | null;
  number: string | null;
  lastError: string | null;
};

export type AdminPerson = {
  id: string;
  full_name: string;
  email: string;
  role: string;
};

export type AdminLink = {
  user_id: string;
  phone_e164: string;
  enabled: boolean;
  memory_enabled: boolean;
  style_learning_enabled: boolean;
  style_profile: Record<string, unknown>;
  sample_count: number;
  outbound_scope: 'none' | 'company' | 'any';
  artifacts_enabled: boolean;
  notes_enabled: boolean;
  proactive_enabled: boolean;
  voice_enabled: boolean;
  reply_mode: 'text' | 'voice';
};

export type GroupLink = {
  jid: string;
  display_name: string;
  enabled: boolean;
  respond_to_all: boolean;
  guest_chat_enabled: boolean;
  reply_mode: 'text' | 'voice';
};

export type AssistantAction = {
  id: string;
  requester_id: string;
  kind: string;
  preview: string;
  status: string;
  recipient_name: string | null;
  recipient_phone: string | null;
  output_summary: string | null;
  error_code: string | null;
  created_at: string;
};

export type MeetStatus = {
  googleAppConfigured: boolean;
  googleConnected: boolean;
  googleEmail: string | null;
  voiceProviderConfigured: boolean;
  transcriptionConfigured: boolean;
  ready: boolean;
  active: {
    id: string;
    status: string;
    meeting_url: string | null;
    started_at: string | null;
  } | null;
};

export const roleRank = [
  'owner',
  'super_admin',
  'admin',
  'hr',
  'sales',
  'employee',
  'project_member',
  'research_member',
] as const;

export const roleLabels: Record<string, { ar: string; en: string }> = {
  owner: { ar: 'مالك', en: 'Owner' },
  super_admin: { ar: 'مدير عام', en: 'Super Admin' },
  admin: { ar: 'مسؤول', en: 'Admin' },
  hr: { ar: 'موارد بشرية', en: 'HR' },
  sales: { ar: 'مبيعات', en: 'Sales' },
  employee: { ar: 'موظف', en: 'Employee' },
  project_member: { ar: 'عضو مشروع', en: 'Project Member' },
  research_member: { ar: 'عضو بحث', en: 'Research Member' },
  guest: { ar: 'ضيف', en: 'Guest' },
};
