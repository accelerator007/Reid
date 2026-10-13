import React from 'react';
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Cpu,
  Link2,
  MessageCircle,
  Mic2,
  QrCode,
  ReceiptText,
  ShieldCheck,
  Smartphone,
  UsersRound,
  Video,
} from 'lucide-react';
import { localApi, localError } from '../local-api';
import type { Page } from '../routes';
import { supabase } from '../supabase';
import { useSession } from '../shell';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FormGrid,
  InlineAlert,
  PageHeader,
  Select,
  StatCard,
  Tabs,
  TextInput,
  type TabItem,
} from '../ui';
import {
  roleLabels,
  roleRank,
  type AdminLink,
  type AdminPerson,
  type AssistantAction,
  type GroupLink,
  type Lang,
  type MeetStatus,
  type Status,
} from './model';
import './connections.css';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);
type Tab = 'whatsapp' | 'admins' | 'groups' | 'meet' | 'actions';

export function Connections({ lang, go }: { lang: Lang; go: (page: Page) => void }) {
  const { user } = useSession();
  const [tab, setTab] = React.useState<Tab>('whatsapp');
  const [status, setStatus] = React.useState<Status | null>(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [ai, setAi] = React.useState<{
    online: boolean;
    model: string;
    latencyMs: number | null;
    capabilities: string[];
  } | null>(null);
  const [meet, setMeet] = React.useState<MeetStatus | null>(null);
  const [people, setPeople] = React.useState<AdminPerson[]>([]);
  const [links, setLinks] = React.useState<AdminLink[]>([]);
  const [groups, setGroups] = React.useState<GroupLink[]>([]);
  const [actions, setActions] = React.useState<AssistantAction[]>([]);
  const [person, setPerson] = React.useState('');
  const [phone, setPhone] = React.useState('');

  const loadAdmins = React.useCallback(async () => {
    if (!supabase) return;
    const [roles, profiles, linked, groupRows] = await Promise.all([
      supabase.from('user_roles').select('user_id,role').neq('role', 'guest'),
      supabase.from('profiles').select('id,full_name,email'),
      supabase
        .from('whatsapp_admin_profiles')
        .select(
          'user_id,phone_e164,enabled,memory_enabled,style_learning_enabled,style_profile,sample_count,outbound_scope,artifacts_enabled,workshops_enabled,notes_enabled,proactive_enabled,voice_enabled,reply_mode',
        )
        .order('created_at'),
      supabase
        .from('whatsapp_qr_groups')
        .select('jid,display_name,enabled,respond_to_all,guest_chat_enabled,reply_mode')
        .order('created_at'),
    ]);

    if (roles.error || profiles.error || linked.error || groupRows.error) {
      setError(tr(lang, 'تعذر تحميل حسابات ومجموعات واتساب.', 'Could not load WhatsApp accounts and groups.'));
      return;
    }

    const profileMap = new Map((profiles.data || []).map(row => [row.id, row]));
    const roleMap = new Map<string, string>();
    for (const row of roles.data || []) {
      const prior = roleMap.get(row.user_id);
      if (!prior || roleRank.indexOf(row.role as any) < roleRank.indexOf(prior as any)) {
        roleMap.set(row.user_id, row.role);
      }
    }

    const rows = [...roleMap].flatMap(([id, role]) => {
      const p = profileMap.get(id);
      return p ? [{ ...p, role }] : [];
    });

    setPeople(rows);
    setLinks((linked.data || []) as AdminLink[]);
    setGroups((groupRows.data || []) as GroupLink[]);
    setPerson(value => value || rows[0]?.id || '');
  }, [lang]);

  const load = React.useCallback(async () => {
    try {
      const [nextStatus, nextActions, nextMeet] = await Promise.all([
        localApi<Status>('whatsapp/status'),
        localApi<AssistantAction[]>('whatsapp/actions'),
        localApi<MeetStatus>('meet/status'),
      ]);
      setStatus(nextStatus);
      setActions(nextActions);
      setMeet(nextMeet);
      setError('');
    } catch (e) {
      setError(localError(e, lang));
    }
  }, [lang]);

  React.useEffect(() => {
    void load();
    void loadAdmins();
    const refreshAi = () =>
      void localApi<{ online: boolean; model: string; latencyMs: number | null; capabilities: string[] }>('ai/health')
        .then(setAi)
        .catch(() => setAi({ online: false, model: 'gemma4:12b', latencyMs: null, capabilities: [] }));
    refreshAi();
    const timer = setInterval(() => {
      void load();
      refreshAi();
    }, 10000);
    return () => clearInterval(timer);
  }, [load, loadAdmins]);

  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      await localApi('whatsapp/connect', {});
      await load();
    } catch (e) {
      setError(localError(e, lang));
    } finally {
      setBusy(false);
    }
  };

  const connectMeet = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await localApi<{ url: string }>('meet/google/connect', {});
      window.location.assign(result.url);
    } catch (e) {
      setError(localError(e, lang));
      setBusy(false);
    }
  };

  const linkAdmin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!supabase || !user || !person) return;
    const number = phone.replace(/\D/g, '');
    if (!/^[1-9][0-9]{7,14}$/.test(number)) {
      setError(tr(lang, 'اكتب الرقم مع مفتاح الدولة، أرقام فقط.', 'Enter the number with country code, digits only.'));
      return;
    }
    setBusy(true);
    const result = await supabase.from('whatsapp_admin_profiles').upsert(
      { user_id: person, phone_e164: number, created_by: user.id, enabled: true },
      { onConflict: 'user_id' },
    );
    if (result.error) {
      setError(tr(lang, 'تعذر ربط الرقم؛ تأكد أنه غير مرتبط بحساب آخر.', 'Could not link the number; make sure it is not linked to another account.'));
    } else {
      setPhone('');
      await loadAdmins();
    }
    setBusy(false);
  };

  const configureAdmin = async (
    link: AdminLink,
    patch: Partial<
      Pick<
        AdminLink,
        | 'enabled'
        | 'memory_enabled'
        | 'style_learning_enabled'
        | 'outbound_scope'
        | 'artifacts_enabled'
        | 'workshops_enabled'
        | 'notes_enabled'
        | 'proactive_enabled'
        | 'voice_enabled'
        | 'reply_mode'
      >
    >,
  ) => {
    if (!supabase) return;
    setBusy(true);
    const result = await supabase.from('whatsapp_admin_profiles').update(patch).eq('user_id', link.user_id);
    if (result.error) setError(tr(lang, 'تعذر تحديث الإعداد.', 'Could not update the setting.'));
    else await loadAdmins();
    setBusy(false);
  };

  const configureGroup = async (
    group: GroupLink,
    patch: Partial<Pick<GroupLink, 'enabled' | 'respond_to_all' | 'guest_chat_enabled' | 'reply_mode'>>,
  ) => {
    if (!supabase) return;
    setBusy(true);
    const result = await supabase.from('whatsapp_qr_groups').update({ ...patch, updated_at: new Date().toISOString() }).eq('jid', group.jid);
    if (result.error) setError(tr(lang, 'تعذر تحديث المجموعة.', 'Could not update the group.'));
    else await loadAdmins();
    setBusy(false);
  };

  const connected = status?.connection === 'connected';

  const tabs: TabItem<Tab>[] = [
    { id: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle />, count: connected ? 1 : 0 },
    { id: 'admins', label: tr(lang, 'الموظفون والصلاحيات', 'Employees'), icon: <UsersRound />, count: links.length },
    { id: 'groups', label: tr(lang, 'المجموعات', 'Groups'), icon: <ShieldCheck />, count: groups.length },
    { id: 'meet', label: 'Google Meet', icon: <Video /> },
    { id: 'actions', label: tr(lang, 'سجل العمليات', 'Receipts'), icon: <ReceiptText />, count: actions.length },
  ];

  return (
    <main className="connections-page">
      <PageHeader
        eyebrow="REID / CONNECTIONS"
        title={tr(lang, 'الربط والتكاملات', 'Connections & Integrations')}
        description={tr(lang, 'اربط رقم الشركة وتابع خدمات الذكاء الاصطناعي والصوت وصلاحيات الفريق.', 'Connect the company WhatsApp number, manage AI services and team permissions.')}
      />

      {error && <InlineAlert tone="danger">{error}</InlineAlert>}

      <div className="connections-status-strip">
        <StatCard
          icon={<MessageCircle />}
          label="WhatsApp"
          value={connected ? `+${status?.number}` : tr(lang, 'غير متصل', 'Disconnected')}
          hint={connected ? tr(lang, 'الجلسة نشطة ومستقرة', 'Session active') : tr(lang, 'يحتاج مسح رمز QR', 'Scan QR to connect')}
        />
        <StatCard
          icon={<Cpu />}
          label={tr(lang, 'الذكاء المحلي', 'Local AI')}
          value={ai?.online ? tr(lang, 'جاهز', 'Ready') : tr(lang, 'غير متاح', 'Offline')}
          hint={ai ? `${ai.model}${ai.latencyMs != null ? ` · ${ai.latencyMs}ms` : ''}` : 'gemma4:12b'}
        />
        <StatCard
          icon={<Video />}
          label="Google Meet"
          value={meet?.ready ? tr(lang, 'جاهز للاجتماعات', 'Ready') : tr(lang, 'يحتاج إعداد', 'Setup required')}
          hint={meet?.googleConnected ? meet.googleEmail || tr(lang, 'الحساب متصل', 'Connected') : tr(lang, 'غير مفوض', 'Not authorized')}
        />
      </div>

      <Tabs
        label={tr(lang, 'أقسام الربط', 'Connections tabs')}
        items={tabs}
        value={tab}
        onChange={setTab}
      />

      {tab === 'whatsapp' && (
        <Card className="connections-qr-container">
          {connected ? (
            <div className="connections-qr-success">
              <CheckCircle2 />
              <h3>{tr(lang, 'رقم ريّد متصل بنجاح', 'Reid is connected successfully')}</h3>
              <b dir="ltr">+{status?.number}</b>
              <p style={{ color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto' }}>
                {tr(lang, 'يستقبل ريّد الرسائل النصية والصوتية والمستندات ويتعامل معها وفق القواعد المعتمدة.', 'Reid is listening for messages, voice notes and documents according to governed rules.')}
              </p>
              <Button variant="primary" onClick={() => go('inbox')}>
                {tr(lang, 'فتح صندوق المحادثات', 'Open inbox')} <ArrowUpRight />
              </Button>
            </div>
          ) : (
            <div>
              <div className="connections-qr-box">
                {status?.qr ? (
                  <img src={status.qr} alt={tr(lang, 'رمز الاستجابة السريعة للربط', 'Scan this QR code')} />
                ) : (
                  <div style={{ display: 'grid', placeItems: 'center', gap: '12px' }}>
                    <QrCode size={64} style={{ color: 'var(--text-muted)' }} />
                    <Button variant="primary" busy={busy || status?.connection === 'connecting'} onClick={() => void connect()}>
                      {busy || status?.connection === 'connecting' ? tr(lang, 'جارٍ التجهيز…', 'Preparing QR…') : tr(lang, 'إظهار رمز QR', 'Show QR code')}
                    </Button>
                  </div>
                )}
              </div>
              <ol className="connections-steps-list">
                <li>{tr(lang, '1. افتح واتساب في هاتف رقم ريّد.', '1. Open WhatsApp on the Reid phone.')}</li>
                <li>{tr(lang, '2. الإعدادات ← الأجهزة المرتبطة ← ربط جهاز.', '2. Settings → Linked devices → Link a device.')}</li>
                <li>{tr(lang, '3. امسح الرمز، وستبدأ المزامنة فوراً.', '3. Scan the code to start syncing.')}</li>
              </ol>
            </div>
          )}
        </Card>
      )}

      {tab === 'admins' && (
        <div className="connections-admin-grid">
          <Card>
            <h3 style={{ margin: '0 0 var(--space-3)' }}>{tr(lang, 'ربط حساب موظف برقم واتساب', 'Link an employee to WhatsApp')}</h3>
            <FormGrid
              submit={tr(lang, 'ربط الرقم', 'Link number')}
              busy={busy}
              onSubmit={async () => {
                await linkAdmin();
              }}
            >
              <Field label={tr(lang, 'حساب الموظف', 'Employee account')}>
                <Select value={person} onChange={e => setPerson(e.target.value)}>
                  {people.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || p.email} ({roleLabels[p.role]?.[lang] || p.role})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={tr(lang, 'رقم واتساب (مع مفتاح الدولة، مثل: 968XXXXXXXX)', 'WhatsApp number (e.g. 968XXXXXXXX)')}>
                <TextInput
                  dir="ltr"
                  inputMode="tel"
                  placeholder="968XXXXXXXX"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  required
                />
              </Field>
            </FormGrid>
          </Card>

          {links.length === 0 ? (
            <EmptyState
              icon={<UsersRound />}
              title={tr(lang, 'لا توجد أرقام مرتبطة بعد', 'No linked employees yet')}
              description={tr(lang, 'اربط الموظفين بأرقامهم ليتمكنوا من التعامل مع ريّد بالصوت والرسائل.', 'Link employee numbers to grant tailored assistant features.')}
            />
          ) : (
            links.map(link => {
              const linked = people.find(p => p.id === link.user_id);
              const style = link.style_profile || {};
              return (
                <Card key={link.user_id} className="connections-admin-card">
                  <div className="connections-admin-card-head">
                    <div className="connections-admin-info">
                      <strong>{linked?.full_name || linked?.email || link.user_id}</strong>
                      <small dir="ltr">+{link.phone_e164}</small>
                      <small>
                        {roleLabels[linked?.role || '']?.[lang] || linked?.role} · {tr(lang, 'عينات الأسلوب', 'Style samples')}:{' '}
                        {link.sample_count} · {String(style.dominant_language || '—')}
                      </small>
                    </div>
                    <Badge tone={link.enabled ? 'success' : 'neutral'}>
                      {link.enabled ? tr(lang, 'مفعّل', 'Enabled') : tr(lang, 'معطّل', 'Disabled')}
                    </Badge>
                  </div>

                  <div className="connections-toggles-grid">
                    <label className="connections-toggle-label">
                      <input
                        type="checkbox"
                        checked={link.enabled}
                        disabled={busy}
                        onChange={e => void configureAdmin(link, { enabled: e.target.checked })}
                      />
                      {tr(lang, 'تفعيل الحساب', 'Enabled')}
                    </label>

                    <label className="connections-toggle-label">
                      <input
                        type="checkbox"
                        checked={link.memory_enabled}
                        disabled={busy}
                        onChange={e => void configureAdmin(link, { memory_enabled: e.target.checked })}
                      />
                      {tr(lang, 'الذاكرة الخاصة', 'Memory')}
                    </label>

                    <label className="connections-toggle-label">
                      <input
                        type="checkbox"
                        checked={link.voice_enabled}
                        disabled={busy}
                        onChange={e => void configureAdmin(link, { voice_enabled: e.target.checked })}
                      />
                      {tr(lang, 'الرسائل الصوتية', 'Voice notes')}
                    </label>

                    <label className="connections-toggle-label">
                      <input
                        type="checkbox"
                        checked={link.artifacts_enabled}
                        disabled={busy}
                        onChange={e => void configureAdmin(link, { artifacts_enabled: e.target.checked })}
                      />
                      {tr(lang, 'المستندات والصور', 'Files & docs')}
                    </label>

                    <label className="connections-toggle-label">
                      <input
                        type="checkbox"
                        checked={link.workshops_enabled}
                        disabled={busy}
                        onChange={e => void configureAdmin(link, { workshops_enabled: e.target.checked })}
                      />
                      {tr(lang, 'الورش والنماذج', 'Workshops')}
                    </label>

                    <label className="connections-toggle-label">
                      <input
                        type="checkbox"
                        checked={link.notes_enabled}
                        disabled={busy}
                        onChange={e => void configureAdmin(link, { notes_enabled: e.target.checked })}
                      />
                      {tr(lang, 'الملاحظات', 'Notes')}
                    </label>

                    <label className="connections-toggle-label">
                      <input
                        type="checkbox"
                        checked={link.proactive_enabled}
                        disabled={busy}
                        onChange={e => void configureAdmin(link, { proactive_enabled: e.target.checked })}
                      />
                      {tr(lang, 'المبادرة الذكية', 'Initiative')}
                    </label>

                    <div className="connections-select-wrapper">
                      <span>{tr(lang, 'طريقة الرد', 'Reply mode')}</span>
                      <select
                        value={link.reply_mode || 'text'}
                        disabled={busy || !link.voice_enabled}
                        onChange={e => void configureAdmin(link, { reply_mode: e.target.value as AdminLink['reply_mode'] })}
                      >
                        <option value="text">{tr(lang, 'نصي', 'Text')}</option>
                        <option value="voice">{tr(lang, 'صوتي دائم', 'Always voice')}</option>
                      </select>
                    </div>

                    <div className="connections-select-wrapper">
                      <span>{tr(lang, 'نطاق الإرسال', 'Sending scope')}</span>
                      <select
                        value={link.outbound_scope}
                        disabled={busy}
                        onChange={e => void configureAdmin(link, { outbound_scope: e.target.value as AdminLink['outbound_scope'] })}
                      >
                        <option value="none">{tr(lang, 'مغلق', 'Off')}</option>
                        <option value="company">{tr(lang, 'داخل الشركة فقط', 'Company only')}</option>
                        <option value="any">{tr(lang, 'أي رقم', 'Any number')}</option>
                      </select>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {tab === 'groups' && (
        <div className="connections-admin-grid">
          {groups.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck />}
              title={tr(lang, 'لم تُسجل أي مجموعة بعد', 'No registered groups')}
              description={tr(lang, 'عند إضافة رقم ريّد إلى مجموعة واتساب ستظهر هنا للتحكم في صلاحياتها.', 'When Reid is added to a WhatsApp group, it will appear here.')}
            />
          ) : (
            groups.map(group => (
              <Card key={group.jid} className="connections-admin-card">
                <div className="connections-admin-card-head">
                  <div className="connections-admin-info">
                    <strong>{group.display_name}</strong>
                    <small dir="ltr">{group.jid}</small>
                    <small>
                      {group.respond_to_all
                        ? tr(lang, 'يرد على جميع الرسائل', 'Replies to all messages')
                        : tr(lang, 'يرد عند المنشن أو ذكر اسمه فقط', 'Replies on mention only')}
                    </small>
                  </div>
                  <Badge tone={group.enabled ? 'success' : 'neutral'}>
                    {group.enabled ? tr(lang, 'مفعّلة', 'Enabled') : tr(lang, 'معطّلة', 'Disabled')}
                  </Badge>
                </div>

                <div className="connections-toggles-grid">
                  <label className="connections-toggle-label">
                    <input
                      type="checkbox"
                      checked={group.enabled}
                      disabled={busy}
                      onChange={e => void configureGroup(group, { enabled: e.target.checked })}
                    />
                    {tr(lang, 'مفعّلة', 'Enabled')}
                  </label>

                  <label className="connections-toggle-label">
                    <input
                      type="checkbox"
                      checked={group.respond_to_all}
                      disabled={busy}
                      onChange={e => void configureGroup(group, { respond_to_all: e.target.checked })}
                    />
                    {tr(lang, 'الرد التلقائي على الجميع', 'Reply to all')}
                  </label>

                  <label className="connections-toggle-label">
                    <input
                      type="checkbox"
                      checked={group.guest_chat_enabled}
                      disabled={busy}
                      onChange={e => void configureGroup(group, { guest_chat_enabled: e.target.checked })}
                    />
                    {tr(lang, 'السماح لغير المرتبطين', 'Guest chat')}
                  </label>

                  <div className="connections-select-wrapper">
                    <span>{tr(lang, 'طريقة رد المجموعة', 'Group reply mode')}</span>
                    <select
                      value={group.reply_mode || 'text'}
                      disabled={busy}
                      onChange={e => void configureGroup(group, { reply_mode: e.target.value as GroupLink['reply_mode'] })}
                    >
                      <option value="text">{tr(lang, 'نصي', 'Text')}</option>
                      <option value="voice">{tr(lang, 'صوتي', 'Voice')}</option>
                    </select>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'meet' && (
        <Card>
          <div className="connections-meet-steps">
            <div className="connections-meet-item">
              <Link2 />
              <div className="connections-meet-item-text">
                <b>{tr(lang, 'حساب Google', 'Google Account')}</b>
                <small>
                  {meet?.googleConnected
                    ? meet.googleEmail || tr(lang, 'متصل ومفوض', 'Connected')
                    : meet?.googleAppConfigured
                      ? tr(lang, 'جاهز للتفويض', 'Ready to authorize')
                      : tr(lang, 'بيانات تطبيق Google ناقصة على الخادم', 'Google App credentials missing on host')}
                </small>
                {!meet?.googleConnected && meet?.googleAppConfigured && (
                  <div style={{ marginTop: 'var(--space-3)' }}>
                    <Button variant="secondary" busy={busy} onClick={() => void connectMeet()}>
                      {tr(lang, 'ربط Google Meet', 'Connect Google Meet')}
                    </Button>
                  </div>
                )}
              </div>
              {meet?.googleConnected && <CheckCircle2 style={{ color: 'var(--success-text)' }} />}
            </div>

            <div className="connections-meet-item">
              <Mic2 />
              <div className="connections-meet-item-text">
                <b>{tr(lang, 'دخول ريّد والاستماع المباشر', 'Live listening & Voice')}</b>
                <small>
                  {meet?.voiceProviderConfigured && meet?.transcriptionConfigured
                    ? tr(lang, 'الدخول والاستماع والرد الصوتي جاهزة', 'Join, listen and voice response ready')
                    : tr(lang, 'يتطلب تفعيل RECALL_API_KEY و ElevenLabs', 'Requires RECALL_API_KEY and ElevenLabs')}
                </small>
              </div>
              {meet?.voiceProviderConfigured && meet?.transcriptionConfigured && (
                <CheckCircle2 style={{ color: 'var(--success-text)' }} />
              )}
            </div>
          </div>

          {meet?.active && (
            <div style={{ marginTop: 'var(--space-6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-4)', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)' }}>
              <div>
                <Badge tone="success">{tr(lang, 'اجتماع نشط الآن', 'Active meeting')}</Badge>
                <small style={{ display: 'block', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {meet.active.started_at ? new Date(meet.active.started_at).toLocaleTimeString() : ''}
                </small>
              </div>
              {meet.active.meeting_url && (
                <a
                  className="ui-button ui-button--primary ui-button--md"
                  href={meet.active.meeting_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  {tr(lang, 'دخول الاجتماع', 'Join meeting')} <ArrowUpRight />
                </a>
              )}
            </div>
          )}
        </Card>
      )}

      {tab === 'actions' && (
        <Card>
          {actions.length === 0 ? (
            <EmptyState
              icon={<ReceiptText />}
              title={tr(lang, 'لا توجد طلبات منفذة بعد', 'No executed actions yet')}
              description={tr(lang, 'ستظهر هنا طلبات واتساب المؤكدة ونتائج تنفيذها.', 'Confirmed WhatsApp actions will appear here.')}
            />
          ) : (
            <div className="connections-actions-log">
              {actions.slice(0, 30).map(action => {
                const requester = people.find(p => p.id === action.requester_id);
                return (
                  <div key={action.id} className="connections-action-row">
                    <div className="connections-action-desc">
                      <b>{action.preview}</b>
                      <small>
                        {requester?.full_name || requester?.email || action.requester_id} ·{' '}
                        {new Date(action.created_at).toLocaleString(lang === 'ar' ? 'ar-OM' : 'en-GB')}
                      </small>
                    </div>
                    <div className="connections-action-meta">
                      <Badge tone={action.status === 'completed' ? 'success' : action.status === 'failed' ? 'danger' : 'neutral'}>
                        {action.status}
                      </Badge>
                      <small>#{action.id.slice(0, 8)}</small>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </main>
  );
}
