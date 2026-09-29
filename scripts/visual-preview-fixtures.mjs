// Mocked Supabase for design previews: a signed-in Owner and realistic,
// entirely fictional Arabic data. Shared by visual-preview.mjs and
// find-overflow.mjs. Nothing here reaches a real project.
export const role = process.env.PREVIEW_ROLE || 'owner';
const user = {
  id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated',
  email: 'owner@reid.test', user_metadata: { full_name: 'شيخة المعمري' }, app_metadata: {},
  created_at: '2026-09-01T00:00:00Z',
};
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 86400;
const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, role: 'authenticated', exp })}.preview`;
export const previewSession = { access_token: token, refresh_token: 'preview', token_type: 'bearer', expires_in: 86400, expires_at: exp, user };

const now = Date.now();
const iso = hours => new Date(now + hours * 3600_000).toISOString();
const fixtures = {
  user_roles: [{ role }],
  account_controls: { status: 'active' },
  profiles: { id: user.id, full_name: 'شيخة المعمري', linkedin_url: 'https://linkedin.com/in/reid-preview', position: 'المالك', department: 'الإدارة' },
  owner_company_snapshot: {
    as_of: iso(0),
    metrics: { active_people: 14, active_projects: 5 },
    alerts: { overdue_tasks: 3, pending_approvals: 2, pending_applications: 1, failed_agent_runs_7d: 0 },
    projects: [
      { id: 'p1', name: 'منصة الحجز — شركة الأمل', status: 'active', target_date: '2026-10-15', overdue_tasks: 2, risk_count: 1 },
      { id: 'p2', name: 'تطبيق مساعد ريد', status: 'active', target_date: '2026-11-01', overdue_tasks: 1, risk_count: 0 },
      { id: 'p3', name: 'بوابة الموارد البشرية', status: 'active', target_date: null, overdue_tasks: 0, risk_count: 0 },
    ],
  },
  tasks: [
    { id: 't1', title: 'مراجعة عرض شركة الأمل', status: 'todo', priority: 3, due_at: iso(-20), project_id: 'p1' },
    { id: 't2', title: 'اعتماد تصميم الصفحة الرئيسية', status: 'in_progress', priority: 2, due_at: iso(6), project_id: 'p2' },
    { id: 't3', title: 'مقابلة مرشح مطوّر واجهات', status: 'todo', priority: 2, due_at: iso(28), project_id: null },
  ],
  projects: [
    { id: 'p1', name: 'منصة الحجز — شركة الأمل', status: 'active', type: 'software', updated_at: iso(-2) },
    { id: 'p2', name: 'تطبيق مساعد ريد', status: 'active', type: 'ai', updated_at: iso(-5) },
    { id: 'p3', name: 'بوابة الموارد البشرية', status: 'planning', type: 'software', updated_at: iso(-30) },
  ],
  notifications: [
    { id: 'n1', title_ar: 'تم إسناد مهمة جديدة لك', title_en: 'A new task was assigned to you', read_at: null, created_at: iso(-1) },
    { id: 'n2', title_ar: 'طلب انضمام جديد', title_en: 'New join application', read_at: null, created_at: iso(-3) },
  ],
  agents: ['ceo', 'operations', 'marketing', 'sales', 'knowledge', 'analytics', 'content', 'competitor', 'support', 'hr'].map((id, index) => ({
    id, name: id, status: 'idle', model: 'gemma4:12b', host: 'ai-lap', approval_level: 1, provider_id: 'ollama',
    classification: index < 5 ? 'internal' : 'public', enabled: true, disabled_reason: null,
  })),
  llm_providers: [{ id: 'ollama', name: 'ai-lap', kind: 'local', chat_model: 'gemma4:12b', max_classification: 'restricted', retains_data: false, enabled: true }],
  agent_runner_status: { id: 'ai-lap', status: 'online', version: '1.2.2', model: 'gemma4:12b', last_seen_at: iso(0) },
  agent_rooms: { id: 'room-1', name: 'فريق ريّد', created_by: user.id, created_at: iso(-48), updated_at: iso(-1) },
  agent_room_messages: [
    { id: 'm1', room_id: 'room-1', sender_kind: 'user', sender_user_id: user.id, sender_agent_id: null, body: '@operations لخص لي وضع مشروع منصة الحجز', mentions: ['operations'], run_id: null, reply_to: null, state: 'completed', error: null, created_at: iso(-1), updated_at: iso(-1) },
    { id: 'm2', room_id: 'room-1', sender_kind: 'agent', sender_user_id: null, sender_agent_id: 'operations', body: 'المشروع على المسار عمومًا: 12 مهمة منجزة من 18، ومهمتان متأخرتان تخصان مراجعة العرض والاختبارات. أقترح تثبيت موعد المراجعة يوم الأحد.', mentions: [], run_id: 'r1', reply_to: 'm1', state: 'completed', error: null, created_at: iso(-0.9), updated_at: iso(-0.9) },
    { id: 'm3', room_id: 'room-1', sender_kind: 'user', sender_user_id: user.id, sender_agent_id: null, body: '@ceo جهّز لي موجز الأسبوع مع الأرقام', mentions: ['ceo'], run_id: null, reply_to: null, state: 'completed', error: null, created_at: iso(-0.2), updated_at: iso(-0.2) },
    { id: 'm4', room_id: 'room-1', sender_kind: 'agent', sender_user_id: null, sender_agent_id: 'ceo', body: 'الأسبوع هادئ عمومًا: مشروعان على المسار وواحد يحتاج قرارًا في المراجعة. سأطلب الأرقام التفصيلية.\n[HANDOFF:@analytics] جهّز مؤشرات الأسبوع للمشاريع الثلاثة', mentions: [], run_id: 'r2', reply_to: 'm3', state: 'completed', error: null, created_at: iso(-0.15), updated_at: iso(-0.15) },
    { id: 'm5', room_id: 'room-1', sender_kind: 'agent', sender_user_id: null, sender_agent_id: 'analytics', body: '…', mentions: [], run_id: 'r3', reply_to: 'm4', state: 'running', error: null, created_at: iso(-0.1), updated_at: iso(-0.1) },
  ],
};

export function respondForPreview(route) {
  const request = route.request();
  const url = new URL(request.url());
  const json = (body, status = 200, headers = {}) =>
    route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: JSON.stringify(body) });
  if (request.method() === 'OPTIONS') {
    return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  }
  if (url.pathname.startsWith('/auth/v1/user')) return json(user);
  if (url.pathname.startsWith('/auth/v1/')) return json(previewSession);
  if (url.pathname.startsWith('/functions/v1/')) return json({});
  const name = url.pathname.replace('/rest/v1/', '').replace('rpc/', '');
  const wantsObject = (request.headers()['accept'] || '').includes('vnd.pgrst.object');
  let data = fixtures[name];
  if (data === undefined) data = wantsObject ? null : [];
  if (wantsObject && Array.isArray(data)) data = data[0] ?? null;
  if (!wantsObject && data && !Array.isArray(data) && !url.pathname.includes('/rpc/')) data = [data];
  const count = Array.isArray(data) ? data.length : data ? 1 : 0;
  if (request.method() === 'HEAD') {
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-range': `0-0/${count || 3}` } });
  }
  return json(data, 200, { 'content-range': `0-${Math.max(0, count - 1)}/${count}` });
}

