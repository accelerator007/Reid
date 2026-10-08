// Agent management (/dashboard): labels in both languages, the order the
// roster is shown in, why an agent cannot run, the ai-lap health read and the
// form a tool's input schema asks for. Pure, so it is tested.
import { agentNames } from '../agent-room';
import { agentTopology, operationalState, providerAccepts, type AgentRow, type AgentTopology, type Classification, type ProviderRow, type RunRow, type RunState, type RunnerStatusRow } from '../agents';
import { arabicCount } from '../owner-overview.model';
import type { Role } from '../policy';
import type { Tone } from '../ui';

export type Lang = 'ar' | 'en';
type Label = { ar: string; en: string };
export type AgentState = ReturnType<typeof operationalState>;

export const agentStates: Record<AgentState, { label: Label; tone: Tone }> = {
  working: { label: { ar: 'يعمل الآن', en: 'Working' }, tone: 'brand' },
  approval: { label: { ar: 'ينتظر موافقة', en: 'Needs approval' }, tone: 'warning' },
  ready: { label: { ar: 'جاهز', en: 'Ready' }, tone: 'success' },
  paused: { label: { ar: 'موقوف مؤقتًا', en: 'Paused' }, tone: 'neutral' },
  blocked: { label: { ar: 'محجوب', en: 'Blocked' }, tone: 'danger' },
  error: { label: { ar: 'تعثّر آخر تشغيل', en: 'Last run failed' }, tone: 'danger' },
};

export const runStates: Record<RunState, { label: Label; tone: Tone }> = {
  pending_approval: { label: { ar: 'بانتظار الموافقة', en: 'Awaiting approval' }, tone: 'warning' },
  queued: { label: { ar: 'في الطابور', en: 'Queued' }, tone: 'info' },
  running: { label: { ar: 'قيد التنفيذ', en: 'Running' }, tone: 'brand' },
  succeeded: { label: { ar: 'اكتمل', en: 'Succeeded' }, tone: 'success' },
  failed: { label: { ar: 'فشل', en: 'Failed' }, tone: 'danger' },
  cancelled: { label: { ar: 'أُلغي', en: 'Cancelled' }, tone: 'neutral' },
};

export const classificationLabels: Record<Classification, { label: Label; hint: Label }> = {
  public: { label: { ar: 'عامة', en: 'Public' }, hint: { ar: 'بيانات يمكن نشرها', en: 'Data that may be published' } },
  internal: { label: { ar: 'داخلية', en: 'Internal' }, hint: { ar: 'لفريق الشركة فقط', en: 'For the company team only' } },
  confidential: { label: { ar: 'سرية', en: 'Confidential' }, hint: { ar: 'عملاء وصفقات وأرقام حساسة', en: 'Clients, deals and sensitive figures' } },
  restricted: { label: { ar: 'مقيّدة', en: 'Restricted' }, hint: { ar: 'بيانات الموظفين الشخصية', en: 'Personal employee data' } },
};

export const domainLabels: Record<AgentTopology['domain'], Label> = {
  executive: { ar: 'القيادة', en: 'Leadership' },
  delivery: { ar: 'التنفيذ', en: 'Delivery' },
  growth: { ar: 'النمو', en: 'Growth' },
  revenue: { ar: 'العملاء', en: 'Clients' },
  knowledge: { ar: 'المعرفة', en: 'Knowledge' },
  governance: { ar: 'الموارد البشرية', en: 'People' },
};

/** Mirrors public.can_approve_level: who may decide a run held at each level. */
export const approvalLevels: Record<number, Label> = {
  0: { ar: 'يعمل مباشرة', en: 'Runs directly' },
  1: { ar: 'يعمل مباشرة ويُسجَّل', en: 'Runs directly, logged' },
  2: { ar: 'يحتاج موافقة الإدارة', en: 'Needs an administrator' },
  3: { ar: 'يحتاج موافقة الإدارة أو الموارد البشرية', en: 'Needs an administrator or HR' },
  4: { ar: 'يحتاج موافقة المالك', en: 'Needs the owner' },
};

export const levelLabel = (level: number, lang: Lang) => approvalLevels[Math.max(0, Math.min(4, level))][lang];

export const agentName = (agent: Pick<AgentRow, 'id' | 'name'>, lang: Lang) => agentNames[agent.id]?.[lang] ?? agent.name;

const has = (roles: readonly Role[], ...wanted: Role[]) => wanted.some(role => roles.includes(role));

/** Mirrors public.is_admin(): who can read and change the agents themselves. */
export const canManageAgents = (roles: readonly Role[]) => has(roles, 'owner', 'super_admin', 'admin');

/** Enabling an agent decides what data leaves for its provider, so it stays with the owner. */
export const canToggleAgents = (roles: readonly Role[]) => has(roles, 'owner');

/**
 * The roster in the order of the operating map. An agent the map does not know
 * is shown after it only while enabled; a retired one (such as finance) stays
 * out of the way rather than listed as a permanent failure.
 */
export function rosterOrder(agents: readonly AgentRow[]): AgentRow[] {
  const known = agentTopology.flatMap(node => agents.filter(agent => agent.id === node.id));
  const extra = agents.filter(agent => agent.enabled && !agentTopology.some(node => node.id === agent.id));
  return [...known, ...extra.sort((a, b) => a.name.localeCompare(b.name))];
}

export type BlockReason = 'disabled' | 'no_provider' | 'provider_disabled' | 'clearance';

/** Why operationalState reports "blocked", in the words an owner can act on. */
export function blockReason(agent: AgentRow, provider: ProviderRow | undefined): BlockReason | null {
  if (!agent.enabled) return 'disabled';
  if (!provider) return 'no_provider';
  if (!provider.enabled) return 'provider_disabled';
  if (!providerAccepts(provider, agent.classification)) return 'clearance';
  return null;
}

export const blockReasons: Record<BlockReason, Label> = {
  disabled: { ar: 'الوكيل معطّل. يفعّله المالك من هذه الصفحة.', en: 'The agent is disabled. The owner can enable it here.' },
  no_provider: { ar: 'لا يوجد مزوّد نموذج مرتبط بهذا الوكيل.', en: 'No model provider is linked to this agent.' },
  provider_disabled: { ar: 'مزوّد النموذج المرتبط به متوقف.', en: 'Its model provider is switched off.' },
  clearance: { ar: 'تصنيف بيانات الوكيل أعلى مما يُسمح بإرساله لمزوّده.', en: 'The agent handles data above what its provider is cleared for.' },
};

/** Counts per state for the summary strip. */
export function stateCounts(agents: readonly AgentRow[], providers: readonly ProviderRow[], runs: readonly RunRow[]): Record<AgentState, number> {
  const counts: Record<AgentState, number> = { working: 0, approval: 0, ready: 0, paused: 0, blocked: 0, error: 0 };
  for (const agent of agents) counts[operationalState(agent, providers.find(p => p.id === agent.provider_id), runs)] += 1;
  return counts;
}

export const openRun = (run: Pick<RunRow, 'run_state'>) => ['queued', 'running', 'pending_approval'].includes(run.run_state);

/**
 * A provider is a risk when it would accept more than it should: an external
 * service that keeps what it receives, cleared above public data. A disabled
 * one is reported too, because enabling it later would silently widen access.
 */
export function providerRisk(provider: ProviderRow): 'retains_sensitive' | 'dormant_sensitive' | null {
  if (provider.kind !== 'external' || provider.max_classification === 'public') return null;
  if (!provider.enabled) return 'dormant_sensitive';
  return provider.retains_data ? 'retains_sensitive' : null;
}

export const providerRisks: Record<'retains_sensitive' | 'dormant_sensitive', Label> = {
  retains_sensitive: { ar: 'خدمة خارجية تحتفظ بالبيانات ومسموح لها بأكثر من البيانات العامة.', en: 'An external service that keeps data is cleared above public data.' },
  dormant_sensitive: { ar: 'متوقف الآن، لكن سقفه أعلى من البيانات العامة؛ لو فُعّل سيستقبل بيانات حساسة.', en: 'Off now, but cleared above public data; enabling it would expose sensitive data.' },
};

export type RunnerHealth = { online: boolean; ageSeconds: number | null; memory: number | null; vram: number | null };

/** ai-lap reports a heartbeat; ninety seconds of silence means it is offline. */
export function runnerHealth(runner: RunnerStatusRow | null, now = Date.now()): RunnerHealth {
  if (!runner) return { online: false, ageSeconds: null, memory: null, vram: null };
  const ageSeconds = Math.max(0, Math.round((now - new Date(runner.last_seen_at).getTime()) / 1000));
  const share = (used: number | null, total: number | null) => (used != null && total ? Math.round((used / total) * 100) : null);
  return {
    online: runner.status === 'online' && ageSeconds < 90,
    ageSeconds,
    memory: share(runner.memory_used_gb, runner.memory_total_gb),
    vram: share(runner.vram_used_mb, runner.vram_total_mb),
  };
}

/** "12 ثانية" / "4 دقائق" / "3 ساعات" with the numbers the rest of the app uses. */
export function ageLabel(seconds: number | null, lang: Lang): string {
  if (seconds == null) return '—';
  if (seconds < 60) return lang === 'ar' ? `قبل ${seconds} ث` : `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return lang === 'ar' ? `قبل ${minutes} د` : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return lang === 'ar' ? `قبل ${hours} س` : `${hours} h ago`;
}

export type ToolField = { key: string; required: boolean; kind: 'text' | 'textarea' | 'number' | 'datetime' | 'date' | 'url' };
type Schema = { required?: string[]; properties?: Record<string, { type?: string }> };

/** The fields a tool asks for, required first, typed from their names and schema. */
export function toolFields(schema: Schema | null | undefined): ToolField[] {
  const required = schema?.required ?? [];
  const optional = Object.keys(schema?.properties ?? {}).filter(key => !required.includes(key));
  const kindOf = (key: string): ToolField['kind'] => {
    const type = schema?.properties?.[key]?.type;
    if (type === 'integer' || type === 'number') return 'number';
    if (/_at$/.test(key)) return 'datetime';
    if (/_date$/.test(key)) return 'date';
    if (key === 'url') return 'url';
    if (/^(body|notes|description)(_|$)/.test(key)) return 'textarea';
    return 'text';
  };
  return [...required.map(key => ({ key, required: true })), ...optional.map(key => ({ key, required: false }))]
    .map(field => ({ ...field, kind: kindOf(field.key) }));
}

/** Form values to tool arguments: empty optional fields are left out, times become ISO. */
export function toolArguments(fields: readonly ToolField[], values: Record<string, string>): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = (values[field.key] ?? '').trim();
    if (!raw) continue;
    if (field.kind === 'number') args[field.key] = Number(raw);
    else if (field.kind === 'datetime') args[field.key] = new Date(raw).toISOString();
    else args[field.key] = raw;
  }
  return args;
}

const fieldNames: Record<string, Label> = {
  title: { ar: 'العنوان', en: 'Title' }, title_ar: { ar: 'العنوان بالعربية', en: 'Arabic title' }, title_en: { ar: 'العنوان بالإنجليزية', en: 'English title' },
  body: { ar: 'النص', en: 'Text' }, body_ar: { ar: 'النص بالعربية', en: 'Arabic text' }, body_en: { ar: 'النص بالإنجليزية', en: 'English text' },
  description: { ar: 'التفاصيل', en: 'Details' }, notes: { ar: 'ملاحظات', en: 'Notes' }, subject: { ar: 'الموضوع', en: 'Subject' },
  query: { ar: 'عن ماذا تبحث؟', en: 'Search for' }, url: { ar: 'رابط الصفحة', en: 'Page link' }, count: { ar: 'عدد النتائج', en: 'Results' },
  due_at: { ar: 'الموعد', en: 'Due' }, due_date: { ar: 'تاريخ الاستحقاق', en: 'Due date' }, start_at: { ar: 'يبدأ', en: 'Starts' }, end_at: { ar: 'ينتهي', en: 'Ends' },
  priority: { ar: 'الأولوية (1 عاجلة – 4 منخفضة)', en: 'Priority (1 urgent – 4 low)' },
  project_id: { ar: 'معرّف المشروع', en: 'Project ID' }, research_id: { ar: 'معرّف البحث', en: 'Research ID' }, department_id: { ar: 'معرّف القسم', en: 'Department ID' },
  assignee_id: { ar: 'معرّف المسؤول', en: 'Assignee ID' }, owner_id: { ar: 'معرّف المسؤول', en: 'Owner ID' }, user_id: { ar: 'معرّف الموظف', en: 'Employee ID' },
  deal_id: { ar: 'معرّف الصفقة', en: 'Deal ID' }, lead_id: { ar: 'معرّف العميل المحتمل', en: 'Lead ID' }, company_id: { ar: 'معرّف الشركة', en: 'Company ID' }, contact_id: { ar: 'معرّف جهة الاتصال', en: 'Contact ID' },
  draft_id: { ar: 'معرّف المسودة', en: 'Draft ID' }, workshop_id: { ar: 'معرّف الورشة', en: 'Workshop ID' }, reminder_id: { ar: 'معرّف التذكير', en: 'Reminder ID' },
  reminder_text: { ar: 'نص التذكير', en: 'Reminder' }, whatsapp_phone: { ar: 'رقم واتساب مع مفتاح الدولة', en: 'WhatsApp number with country code' },
};

/** "3 تشغيلات فشلت خلال 24 ساعة" with the number and noun in agreement. */
export function failedRunsLine(count: number, lang: Lang): string {
  if (lang === 'en') return count === 1 ? '1 run failed in 24 h' : `${count} runs failed in 24 h`;
  if (!count) return 'لا تشغيلات فاشلة خلال 24 ساعة';
  return `${arabicCount(count, { one: 'تشغيل واحد فشل', two: 'تشغيلان فشلا', few: 'تشغيلات فشلت', many: 'تشغيلًا فشلت' })} خلال 24 ساعة`;
}

/** "من آخر 5 تشغيلات". */
export function lastRunsLine(count: number, lang: Lang): string {
  if (lang === 'en') return `Over the last ${count} run${count === 1 ? '' : 's'}`;
  return `من آخر ${arabicCount(count, { one: 'تشغيل', two: 'تشغيلين', few: 'تشغيلات', many: 'تشغيلًا' })}`;
}

export const fieldLabel = (key: string, lang: Lang) => fieldNames[key]?.[lang] ?? key.replaceAll('_', ' ');

/** A short, readable line for a tool result instead of raw JSON. */
export function describeToolResult(result: unknown, lang: Lang): string {
  if (Array.isArray(result)) {
    if (!result.length) return lang === 'ar' ? 'لا نتائج.' : 'No results.';
    return lang === 'ar'
      ? `${arabicCount(result.length, { one: 'نتيجة واحدة', two: 'نتيجتان', few: 'نتائج', many: 'نتيجة' })}.`
      : `${result.length} result${result.length === 1 ? '' : 's'}.`;
  }
  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>;
    const title = record.title ?? record.name ?? record.subject;
    if (typeof title === 'string') return lang === 'ar' ? `تم: ${title}` : `Done: ${title}`;
  }
  return lang === 'ar' ? 'اكتمل التنفيذ.' : 'Completed.';
}
