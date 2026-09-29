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
  profiles: [
    { id: user.id, full_name: 'شيخة المعمري', email: 'owner@reid.test', phone: '+968 9000 0001', position: 'المؤسسة والمديرة التنفيذية', department: null, department_id: 'dep-mgmt', hire_date: '2025-01-05', employment_status: 'active', linkedin_url: 'https://linkedin.com/in/reid-preview' },
    { id: 'u-ali', full_name: 'علي الحارثي', email: 'ali@reid.test', phone: null, position: 'مدير المشاريع', department: null, department_id: 'dep-dev', hire_date: '2025-03-01', employment_status: 'active', linkedin_url: 'https://linkedin.com/in/x' },
    { id: 'u-maryam', full_name: 'مريم البلوشية', email: 'maryam@reid.test', phone: '+968 9000 0003', position: 'مطورة واجهات', department: null, department_id: 'dep-dev', hire_date: '2026-09-01', employment_status: 'onboarding', linkedin_url: 'https://linkedin.com/in/x' },
    { id: 'u-said', full_name: 'سعيد الكندي', email: 'said@reid.test', phone: null, position: 'مهندس بنية تحتية', department: null, department_id: 'dep-dev', hire_date: '2025-06-15', employment_status: 'leave', linkedin_url: 'https://linkedin.com/in/x' },
  ],
  departments: [
    { id: 'dep-mgmt', name_ar: 'الإدارة', name_en: 'Management', description: 'القيادة والاستراتيجية', manager_id: user.id },
    { id: 'dep-dev', name_ar: 'التطوير', name_en: 'Engineering', description: 'المنتجات والمشاريع التقنية', manager_id: 'u-ali' },
  ],
  onboarding_items: [
    { id: 'ob1', user_id: 'u-maryam', title_ar: 'توقيع العقد وسياسة السرية', title_en: 'Sign contract and NDA', due_date: '2026-09-03', completed: true, completed_at: iso(-600) },
    { id: 'ob2', user_id: 'u-maryam', title_ar: 'استلام الجهاز والبريد', title_en: 'Receive laptop and email', due_date: '2026-09-04', completed: true, completed_at: iso(-580) },
    { id: 'ob3', user_id: 'u-maryam', title_ar: 'جولة على مشاريع العملاء', title_en: 'Tour of client projects', due_date: '2026-10-01', completed: false, completed_at: null },
    { id: 'ob4', user_id: 'u-maryam', title_ar: 'أول مهمة على منصة الحجز', title_en: 'First task on the booking platform', due_date: '2026-10-05', completed: false, completed_at: null },
  ],
  calendar_events: [
    { id: 'ev1', user_id: null, title: 'اجتماع الفريق الشهري', description: 'مراجعة أهداف أكتوبر', starts_at: iso(48), ends_at: iso(49), visibility: 'company' },
    { id: 'ev2', user_id: user.id, title: 'مكالمة مع شركة الأمل', description: null, starts_at: iso(28), ends_at: iso(28.5), visibility: 'private' },
  ],
  announcements: [
    { id: 'an1', title_ar: 'مرحبًا بمريم في فريق التطوير', title_en: 'Welcome Maryam to Engineering', body_ar: 'انضمت مريم البلوشية إلينا مطورةً للواجهات، وستعمل على منصة الحجز.', body_en: 'Maryam joins us as a front-end developer on the booking platform.', published_at: iso(-600) },
    { id: 'an2', title_ar: 'إجازة اليوم الوطني', title_en: 'National Day holiday', body_ar: 'إجازة رسمية يومي 18 و19 نوفمبر.', body_en: 'Official holiday on 18 and 19 November.', published_at: iso(-100) },
  ],
  employee_documents: [
    { id: 'ed1', owner_id: 'u-maryam', title: 'عقد العمل', category: 'contract', storage_path: 'u-maryam/contract.pdf', created_at: iso(-600) },
    { id: 'ed2', owner_id: 'u-maryam', title: 'شهادة البكالوريوس', category: 'certificate', storage_path: 'u-maryam/degree.pdf', created_at: iso(-590) },
  ],
  employee_kpis: [
    { id: 'ek1', user_id: 'u-maryam', title: 'شاشات منجزة', target_value: 12, current_value: 5, unit: 'شاشة', period_start: '2026-09-01', period_end: '2026-12-31', status: 'on_track' },
  ],
  performance_reviews: [
    { id: 'pr1', user_id: 'u-ali', reviewer_id: user.id, period_start: '2026-01-01', period_end: '2026-06-30', rating: 4.5, summary: 'قيادة ممتازة لمشاريع العملاء والتزام بالمواعيد.', strengths: 'التواصل مع العملاء', improvements: 'توثيق القرارات التقنية' },
  ],
  timesheets: [
    { id: 'ts1', user_id: 'u-maryam', task_id: null, minutes: 420, work_date: '2026-09-29', notes: 'تصميم شاشة الحجز' },
    { id: 'ts2', user_id: 'u-maryam', task_id: null, minutes: 390, work_date: '2026-09-28', notes: 'مراجعة مكونات الواجهة' },
    { id: 'ts3', user_id: 'u-maryam', task_id: null, minutes: 300, work_date: '2026-09-27', notes: null },
  ],
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
    { id: 't1', title: 'مراجعة عرض شركة الأمل', description: 'تحديث الجدول الزمني قبل الإرسال', status: 'todo', priority: 1, due_at: iso(-20), project_id: 'p1', assignee_id: 'u-ali' },
    { id: 't2', title: 'تصميم شاشة الحجز على الجوال', description: null, status: 'in_progress', priority: 2, due_at: iso(30), project_id: 'p1', assignee_id: 'u-maryam' },
    { id: 't3', title: 'ربط بوابة الدفع', description: 'بيئة الاختبار أولًا', status: 'in_progress', priority: 2, due_at: iso(-4), project_id: 'p1', assignee_id: 'u-said' },
    { id: 't4', title: 'اختبارات القبول مع العميل', description: null, status: 'review', priority: 3, due_at: iso(70), project_id: 'p1', assignee_id: 'u-ali' },
    { id: 't5', title: 'إعداد قاعدة البيانات', description: null, status: 'done', priority: 3, due_at: iso(-200), project_id: 'p1', assignee_id: 'u-said' },
    { id: 't6', title: 'تحليل متطلبات الحجز', description: null, status: 'done', priority: 2, due_at: iso(-300), project_id: 'p1', assignee_id: 'u-maryam' },
    { id: 't7', title: 'نموذج أولي لمساعد ريد', description: null, status: 'done', priority: 2, due_at: iso(-50), project_id: 'p2', assignee_id: user.id },
    { id: 't8', title: 'اعتماد تصميم الصفحة الرئيسية', description: null, status: 'in_progress', priority: 2, due_at: iso(6), project_id: 'p2', assignee_id: user.id },
    { id: 't9', title: 'توقيع عقد شركة الأمل', description: null, status: 'todo', priority: 1, due_at: iso(-30), project_id: 'p1', assignee_id: user.id },
    { id: 't10', title: 'مراجعة خطة المحتوى الأسبوعية', description: null, status: 'todo', priority: 3, due_at: iso(50), project_id: null, assignee_id: user.id },
    { id: 't11', title: 'قراءة تقرير رصد المنافسين', description: null, status: 'todo', priority: 3, due_at: null, project_id: null, assignee_id: user.id },
  ],
  work_records: [
    { id: 'w1', kind: 'ticket', title: 'الطابعة في مكتب مسقط لا تعمل', description: 'تظهر رسالة خطأ في الورق منذ الصباح.', status: 'open', owner_id: 'u-said', assigned_to: null, due_date: null, created_at: iso(-3) },
    { id: 'w2', kind: 'ticket', title: 'صلاحية دخول لمستودع GitHub الجديد', description: 'للمطورة مريم على مشروع منصة الحجز.', status: 'in_progress', owner_id: 'u-maryam', assigned_to: 'u-ali', due_date: '2026-09-27', created_at: iso(-40) },
    { id: 'w3', kind: 'ticket', title: 'تحديث نظام التشغيل لأجهزة الفريق', description: '', status: 'done', owner_id: 'u-ali', assigned_to: null, due_date: '2026-09-20', created_at: iso(-200) },
    { id: 'w4', kind: 'leave', title: 'إجازة سنوية — أسبوع', description: 'من 12 إلى 19 أكتوبر، يغطيني سعيد.', status: 'open', owner_id: 'u-maryam', assigned_to: null, due_date: '2026-10-12', created_at: iso(-10) },
    { id: 'w5', kind: 'goal', title: 'إطلاق منصة الحجز قبل منتصف أكتوبر', description: 'مع اختبار الدفع الكامل.', status: 'in_progress', owner_id: user.id, assigned_to: 'u-ali', due_date: '2026-10-15', created_at: iso(-300) },
    { id: 'w6', kind: 'decision', title: 'اعتماد Tavily للبحث في الويب', description: 'بحدود 60 بحثًا يوميًا.', status: 'done', owner_id: user.id, assigned_to: null, due_date: null, created_at: iso(-30) },
    { id: 'w7', kind: 'contract', title: 'تجديد عقد الاستضافة', description: '', status: 'review', owner_id: user.id, assigned_to: null, due_date: '2026-10-01', created_at: iso(-80) },
  ],
  projects: [
    { id: 'p1', name: 'منصة الحجز — شركة الأمل', type: 'client', description: 'منصة حجز ودفع إلكتروني لعيادات شركة الأمل في مسقط وصحار.', manager_id: 'u-ali', client_name: 'شركة الأمل', status: 'active', github_repo: 'https://github.com/reid/booking', start_date: '2026-08-01', target_date: '2026-10-15', archived_at: null, updated_at: iso(-2) },
    { id: 'p2', name: 'تطبيق مساعد ريد', type: 'product', description: 'مساعد صوتي تنفيذي بالعربي للأشخاص الأساسيين.', manager_id: user.id, client_name: null, status: 'active', github_repo: null, start_date: '2026-09-01', target_date: '2026-11-01', archived_at: null, updated_at: iso(-5) },
    { id: 'p3', name: 'بوابة الموارد البشرية', type: 'internal', description: 'تهيئة الموظفين الجدد والمستندات في مكان واحد.', manager_id: 'u-said', client_name: null, status: 'planning', github_repo: null, start_date: null, target_date: null, archived_at: null, updated_at: iso(-30) },
    { id: 'p4', name: 'دراسة سوق التعليم الرقمي', type: 'research', description: null, manager_id: 'u-maryam', client_name: null, status: 'on_hold', github_repo: null, start_date: null, target_date: '2026-09-10', archived_at: null, updated_at: iso(-60) },
  ],
  project_members: [
    { project_id: 'p1', user_id: 'u-ali', member_role: 'manager' },
    { project_id: 'p1', user_id: 'u-maryam', member_role: 'lead' },
    { project_id: 'p1', user_id: 'u-said', member_role: 'member' },
    { project_id: 'p1', user_id: user.id, member_role: 'member' },
  ],
  project_milestones: [
    { id: 'ms1', title: 'تحليل المتطلبات', description: 'ورش عمل مع فريق العميل', due_date: '2026-08-20', status: 'completed' },
    { id: 'ms2', title: 'النسخة التجريبية', description: 'الحجز والدفع على بيئة الاختبار', due_date: '2026-10-05', status: 'in_progress' },
    { id: 'ms3', title: 'الإطلاق', description: null, due_date: '2026-10-15', status: 'planned' },
  ],
  project_meetings: [
    { id: 'mt1', title: 'مراجعة أسبوعية مع العميل', agenda: 'حالة النسخة التجريبية وملاحظات الدفع', starts_at: iso(26), ends_at: iso(27), location: 'https://meet.google.com/abc-defg-hij', notes: null },
    { id: 'mt2', title: 'اجتماع انطلاق المشروع', agenda: null, starts_at: iso(-400), ends_at: iso(-399), location: 'مكتب ريّد — مسقط', notes: null },
  ],
  project_files: [
    { id: 'f1', title: 'عقد المشروع', storage_path: 'p1/contract.pdf', category: 'عقد', restricted: true, uploaded_by: 'u-ali', created_at: iso(-500) },
    { id: 'f2', title: 'تصاميم الواجهات', storage_path: 'p1/designs.fig', category: 'تصميم', restricted: false, uploaded_by: 'u-maryam', created_at: iso(-100) },
  ],
  project_file_permissions: [
    { id: 'fp1', file_id: 'f1', user_id: 'u-ali', role: null, can_read: true, can_write: true },
  ],
  project_kpis: [
    { id: 'k1', title: 'زمن إتمام الحجز', target_value: 60, current_value: 45, unit: 'ثانية', status: 'on_track' },
    { id: 'k2', title: 'نجاح عمليات الدفع', target_value: 99, current_value: 92, unit: '٪', status: 'at_risk' },
  ],
  project_activity: [
    { id: 1, actor_id: 'u-maryam', action: 'UPDATE', entity_type: 'tasks', entity_id: 't2', details: {}, created_at: iso(-2) },
    { id: 2, actor_id: 'u-ali', action: 'INSERT', entity_type: 'project_meetings', entity_id: 'mt1', details: {}, created_at: iso(-20) },
    { id: 3, actor_id: 'u-said', action: 'INSERT', entity_type: 'project_files', entity_id: 'f2', details: {}, created_at: iso(-100) },
  ],
  crm_companies: [
    { id: 'c1', name: 'شركة الأمل الطبية', industry: 'صحة', email: 'info@alamal.om', phone: '+968 2412 3456', status: 'active', owner_id: 'u-ali' },
    { id: 'c2', name: 'مدارس النور', industry: 'تعليم', email: 'admin@alnoor.edu.om', phone: null, status: 'prospect', owner_id: user.id },
    { id: 'c3', name: 'مجموعة الساحل للتجزئة', industry: 'تجزئة', email: null, phone: '+968 9911 2233', status: 'prospect', owner_id: 'u-ali' },
  ],
  crm_contacts: [
    { id: 'ct1', name: 'د. خالد الراشدي', email: 'khalid@alamal.om', phone: '+968 9922 1100', position: 'المدير التنفيذي', company_id: 'c1', stage: 'customer', owner_id: 'u-ali' },
    { id: 'ct2', name: 'أمل الهنائية', email: 'amal@alnoor.edu.om', phone: null, position: 'مديرة التقنية', company_id: 'c2', stage: 'lead', owner_id: user.id },
  ],
  crm_leads: [
    { id: 'l1', title: 'بوابة أولياء الأمور — مدارس النور', stage: 'qualified', probability: 45, next_follow_up_at: iso(-26), company_id: 'c2', contact_id: 'ct2', owner_id: user.id },
    { id: 'l2', title: 'تطبيق نقاط الولاء — الساحل', stage: 'new', probability: 15, next_follow_up_at: iso(30), company_id: 'c3', contact_id: null, owner_id: 'u-ali' },
    { id: 'l3', title: 'مساعد واتساب للمواعيد — الأمل', stage: 'proposal', probability: 60, next_follow_up_at: iso(-2), company_id: 'c1', contact_id: 'ct1', owner_id: 'u-ali' },
    { id: 'l4', title: 'لوحة مؤشرات المبيعات', stage: 'negotiation', probability: 75, next_follow_up_at: null, company_id: 'c3', contact_id: null, owner_id: user.id },
    { id: 'l5', title: 'موقع تعريفي لعيادة جديدة', stage: 'new', probability: 20, next_follow_up_at: iso(80), company_id: null, contact_id: null, owner_id: 'u-ali' },
  ],
  crm_deals: [
    { id: 'd1', title: 'منصة الحجز — المرحلة الثانية', stage: 'negotiation', expected_close_date: '2026-10-06', company_id: 'c1', contact_id: 'ct1', owner_id: 'u-ali' },
    { id: 'd2', title: 'ورشة الذكاء الاصطناعي للمعلمين', stage: 'proposal', expected_close_date: '2026-10-20', company_id: 'c2', contact_id: 'ct2', owner_id: user.id },
    { id: 'd3', title: 'منصة الحجز — المرحلة الأولى', stage: 'won', expected_close_date: '2026-08-01', company_id: 'c1', contact_id: 'ct1', owner_id: 'u-ali' },
  ],
  crm_activities: [
    { id: 'a1', activity_type: 'call', subject: 'اتصال لمتابعة عرض بوابة أولياء الأمور', due_at: iso(-26), completed_at: null, created_at: iso(-50), company_id: null, contact_id: null, lead_id: 'l1', deal_id: null },
    { id: 'a2', activity_type: 'meeting', subject: 'اجتماع تفاوض المرحلة الثانية', due_at: iso(28), completed_at: null, created_at: iso(-10), company_id: null, contact_id: null, lead_id: null, deal_id: 'd1' },
    { id: 'a3', activity_type: 'email', subject: 'إرسال دراسة الحالة', due_at: iso(-72), completed_at: iso(-70), created_at: iso(-90), company_id: 'c3', contact_id: null, lead_id: null, deal_id: null },
  ],
  executive_reports: [
    { id: 'r1', period: 'weekly', period_start: '2026-09-22', period_end: '2026-09-28', generated_at: iso(-5), email_status: 'sent',
      metrics: { active_projects: 3, open_tasks: 14, employees: 12, new_leads: 4, open_deals: 2, won_deals: 1, pending_applications: 1, agent_failures: 0, alerts: [] } },
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
  // Honour simple equality filters (?id=eq.x) on rows that carry the column,
  // so .eq(...).maybeSingle() gets one row like PostgREST would return.
  if (Array.isArray(data)) {
    for (const [key, value] of url.searchParams) {
      if (!value.startsWith('eq.')) continue;
      data = data.filter(row => !(key in row) || String(row[key]) === value.slice(3));
    }
  }
  if (wantsObject && Array.isArray(data)) data = data[0] ?? null;
  if (!wantsObject && data && !Array.isArray(data) && !url.pathname.includes('/rpc/')) data = [data];
  const count = Array.isArray(data) ? data.length : data ? 1 : 0;
  if (request.method() === 'HEAD') {
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-range': `0-0/${count || 3}` } });
  }
  return json(data, 200, { 'content-range': `0-${Math.max(0, count - 1)}/${count}` });
}

