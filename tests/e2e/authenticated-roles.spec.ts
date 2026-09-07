import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = process.env.AUTH_E2E === '1' && !!url && !!publishableKey && !!serviceKey;

test.describe('authenticated employee role journeys', () => {
  test.skip(!enabled, 'Authenticated remote E2E credentials are not configured.');

  let admin: SupabaseClient;
  const stamp = Date.now();
  const password = `Qa-${crypto.randomUUID()}-Aa1!`;
  const users: Record<string, { id: string; email: string }> = {};
  let departmentId: string | undefined;

  const createUser = async (label: string, role: 'employee' | 'hr' | 'owner') => {
    const email = `reid-browser-${label}-${stamp}@example.com`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Reid ${label}`, linkedin_url: `https://linkedin.com/in/reid-${label}-${stamp}` },
    });
    if (created.error) throw created.error;
    const id = created.data.user.id;
    const assigned = await admin.from('user_roles').insert({ user_id: id, role });
    if (assigned.error) throw assigned.error;
    const profile = await admin.from('profiles').update({
      full_name: `Reid ${label}`,
      linkedin_url: `https://linkedin.com/in/reid-${label}-${stamp}`,
      position: label === 'manager' ? 'QA Manager' : label === 'hr' ? 'HR QA' : 'QA Employee',
    }).eq('id', id);
    if (profile.error) throw profile.error;
    users[label] = { id, email };
  };

  const signIn = async (page: Page, label: string) => {
    await page.goto('/workspace');
    await page.locator('input[name="email"]').fill(users[label].email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('form button.primary').click();
    await expect(page.getByRole('heading', { name: 'مساحة عمل الموظفين' })).toBeVisible();
    await expect(page.locator('[role="status"]').filter({ hasText: /تعذر|انتهت الجلسة|غير مصرح/i })).toHaveCount(0);
  };

  test.beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
    await createUser('manager', 'employee');
    await createUser('employee', 'employee');
    await createUser('hr', 'hr');
    await createUser('owner', 'owner');
    const department = await admin.from('departments').insert({
      name_ar: `ضمان الجودة ${stamp}`,
      name_en: `Quality Assurance ${stamp}`,
      manager_id: users.manager.id,
    }).select('id').single();
    if (department.error) throw department.error;
    departmentId = department.data.id;
    const profiles = await admin.from('profiles').update({ department_id: departmentId }).in('id', [users.manager.id, users.employee.id]);
    if (profiles.error) throw profiles.error;
  });

  test.afterAll(async () => {
    if (departmentId) await admin.from('departments').delete().eq('id', departmentId);
    for (const user of Object.values(users)) await admin.auth.admin.deleteUser(user.id);
  });

  test('Employee opens an active employee workspace with the assigned role', async ({ page }) => {
    await signIn(page, 'employee');
    await expect(page.getByText('Reid employee · employee', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ملفي الشخصي' })).toBeVisible();
  });

  test('department Manager opens the directory and direct report', async ({ page }) => {
    await signIn(page, 'manager');
    await page.getByRole('button', { name: 'الموظفون' }).click();
    await expect(page.getByText('Reid employee', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`ضمان الجودة ${stamp}`, { exact: true }).first()).toBeVisible();
  });

  test('HR opens the company directory across departments', async ({ page }) => {
    await signIn(page, 'hr');
    await page.getByRole('button', { name: 'الموظفون' }).click();
    await expect(page.getByText('Reid manager', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Reid employee', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Reid hr', { exact: true }).first()).toBeVisible();
    await page.goto('/crm');
    await expect(page.getByRole('heading', { name: 'إدارة العملاء والمبيعات' })).toBeVisible();
  });

  test('Owner runs Operations through the configured governed provider', async ({ page }) => {
    test.skip(process.env.LIVE_AGENT_E2E !== '1' && process.env.LIVE_GEMINI_E2E !== '1', 'Live provider verification runs on its dedicated daily/manual workflow.');
    test.setTimeout(240_000);
    await page.goto('/dashboard');
    await page.locator('input[name="email"]').fill(users.owner.email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('form button.primary').click();
    await expect(page.getByRole('heading', { name: 'خريطة قيادة الوكلاء' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'مركز قيادة النظام' })).toBeVisible();
    const runnerCard=page.locator('.runner-card');
    await expect(runnerCard).toContainText('gemma4:12b');
    await expect(runnerCard).toContainText('متصل', { timeout:15_000 });
    await expect(runnerCard.locator('.telemetry')).toHaveCount(5);
    await page.getByRole('button', { name: /Operations:/ }).click();
    await expect(page.getByRole('button', { name: 'تشغيل يدوي' })).toBeVisible();
    const caller = createClient(url!, publishableKey!, { auth: { persistSession: false } });
    const signed = await caller.auth.signInWithPassword({ email: users.owner.email, password });
    if (signed.error) throw signed.error;
    const invoked = await caller.functions.invoke('llm-gateway', { body: {
      action: 'run', agentId: 'operations', classification: 'internal',
      input: 'أعطني ملخصًا قصيرًا لحالة المشاريع والمهام الموجودة في السياق المصرح به فقط.',
    }});
    if (invoked.error) {
      let detail = invoked.error.message;
      try { detail = JSON.stringify(await invoked.error.context.json()); } catch { /* keep SDK message */ }
      throw new Error(`llm-gateway: ${detail}`);
    }
    const gateway = invoked.data;
    expect(gateway.error, JSON.stringify(gateway)).toBeFalsy();
    expect(gateway.runId).toBeTruthy();
    expect(['queued', undefined]).toContain(gateway.status);
    let run: { provider_id:string; classification:string; run_state:string; latency_ms:number|null; token_usage:number|null } | null = null;
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const result = await admin.from('agent_runs').select('provider_id,classification,run_state,latency_ms,token_usage').eq('id', gateway.runId).single();
      if (result.error) throw result.error;
      run = result.data;
      if (run.run_state === 'succeeded' || run.run_state === 'failed') break;
      await new Promise(resolve => setTimeout(resolve, 2_000));
    }
    if (process.env.EXPECTED_AGENT_PROVIDER) expect(run?.provider_id).toBe(process.env.EXPECTED_AGENT_PROVIDER);
    else expect(['ollama', 'gemini']).toContain(run?.provider_id);
    expect(run?.classification).toBe('internal');
    expect(run?.run_state).toBe('succeeded');
    expect(run?.latency_ms).toBeGreaterThan(0);
  });

  test('Owner executes governed read and L1 content draft tools', async () => {
    test.skip(process.env.LIVE_TOOL_E2E !== '1', 'Live tool verification runs after deployment.');
    const caller = createClient(url!, publishableKey!, { auth: { persistSession: false } });
    const signed = await caller.auth.signInWithPassword({ email: users.owner.email, password });
    if (signed.error) throw signed.error;

    const read = await caller.functions.invoke('llm-gateway', { body: {
      action: 'tool', agentId: 'operations', toolName: 'projects.list', arguments: {}, classification: 'internal',
    }});
    if (read.error) throw read.error;
    expect(read.data.error, JSON.stringify(read.data)).toBeFalsy();
    expect(read.data.tool).toBe('projects.list');
    expect(Array.isArray(read.data.result)).toBe(true);

    let runId: string | undefined;
    let draftId: string | undefined;
    try {
      const created = await caller.functions.invoke('llm-gateway', { body: {
        action: 'tool', agentId: 'content', toolName: 'content.draft.create', classification: 'public',
        arguments: { title_ar: `مسودة تحقق ${stamp}`, title_en: `Verification draft ${stamp}`, body_ar: 'مسودة اختبار تحذف تلقائيًا.', body_en: 'Disposable verification draft.' },
      }});
      if (created.error) throw created.error;
      expect(created.data.tool).toBe('content.draft.create');
      runId = created.data.runId;
      draftId = created.data.result.id;
      const receipt = await admin.from('agent_tool_executions').select('tool_id,status').eq('run_id',runId).single();
      if (receipt.error) throw receipt.error;
      expect(receipt.data).toEqual({ tool_id:'content.draft.create', status:'succeeded' });
    } finally {
      if (draftId) await admin.from('content_drafts').delete().eq('id',draftId);
      if (runId) await admin.from('agent_runs').delete().eq('id',runId);
      if (read.data?.runId) await admin.from('agent_runs').delete().eq('id',read.data.runId);
    }
  });

  test('Owner exercises every live company tool family and approval gate', async () => {
    test.skip(process.env.LIVE_TOOL_E2E !== '1', 'Live tool verification runs after deployment.');
    test.setTimeout(180_000);
    const caller = createClient(url!, publishableKey!, { auth: { persistSession: false } });
    const signed = await caller.auth.signInWithPassword({ email: users.owner.email, password });
    if (signed.error) throw signed.error;
    const runIds:string[] = [];
    let projectId:string|undefined, companyId:string|undefined, leadId:string|undefined;
    let taskId:string|undefined, activityId:string|undefined, onboardingId:string|undefined, draftId:string|undefined;
    const invoke = async (agentId:string,toolName:string,args:Record<string,unknown>={}) => {
      const response=await caller.functions.invoke('llm-gateway',{body:{action:'tool',agentId,toolName,arguments:args}});
      if(response.error)throw response.error;
      expect(response.data.error,JSON.stringify(response.data)).toBeFalsy();
      if(response.data.runId)runIds.push(response.data.runId);
      else if(response.data.run?.id)runIds.push(response.data.run.id);
      return response.data;
    };
    try {
      const project=await admin.from('projects').insert({name:`Agent matrix ${stamp}`,type:'internal',status:'active',manager_id:users.owner.id,budget:1000,currency:'OMR'}).select('id').single();
      if(project.error)throw project.error; projectId=project.data.id;
      const company=await admin.from('crm_companies').insert({name:`Agent matrix ${stamp}`,owner_id:users.owner.id}).select('id').single();
      if(company.error)throw company.error; companyId=company.data.id;
      const lead=await admin.from('crm_leads').insert({title:`Agent matrix lead ${stamp}`,company_id:companyId,owner_id:users.owner.id}).select('id').single();
      if(lead.error)throw lead.error; leadId=lead.data.id;

      for(const [agent,tool] of [
        ['operations','projects.list'],['operations','tasks.list'],['sales','crm.pipeline'],
        ['hr','people.list'],['hr','applications.list'],['finance','finance.budgets'],
        ['content','content.context'],['knowledge','knowledge.search'],
      ] as const) {
        const result=await invoke(agent,tool,tool==='knowledge.search'?{query:'Agent matrix'}:{});
        expect(result.tool).toBe(tool);
      }

      const task=await invoke('operations','tasks.create',{title:`Live tool task ${stamp}`,project_id:projectId});
      taskId=task.result.id; expect(task.result.project_id).toBe(projectId);
      const followUp=await invoke('sales','crm.follow_up.create',{subject:`Live follow-up ${stamp}`,lead_id:leadId,owner_id:users.owner.id});
      activityId=followUp.result.id; expect(followUp.result.subject).toContain('Live follow-up');
      const onboarding=await invoke('hr','onboarding.create',{user_id:users.employee.id,title_ar:`تهيئة ${stamp}`,title_en:`Onboarding ${stamp}`});
      onboardingId=onboarding.result.id; expect(onboarding.result.user_id).toBe(users.employee.id);
      const draft=await invoke('content','content.draft.create',{title_ar:`مسودة ${stamp}`,title_en:`Draft ${stamp}`,body_ar:'اختبار',body_en:'Test'});
      draftId=draft.result.id; expect(draft.result.status).toBe('draft');

      const publish=await invoke('content','content.publish',{draft_id:draftId});
      expect(publish.status).toBe('pending_approval'); expect(publish.approvalLevel).toBe(2);
      const rejectedPublish=await caller.functions.invoke('llm-gateway',{body:{action:'reject',runId:publish.run.id}});
      if(rejectedPublish.error)throw rejectedPublish.error; expect(rejectedPublish.data.status).toBe('cancelled');

      const budget=await invoke('finance','projects.budget.update',{project_id:projectId,budget:9999,currency:'OMR'});
      expect(budget.status).toBe('pending_approval'); expect(budget.approvalLevel).toBe(3);
      const rejectedBudget=await caller.functions.invoke('llm-gateway',{body:{action:'reject',runId:budget.run.id}});
      if(rejectedBudget.error)throw rejectedBudget.error; expect(rejectedBudget.data.status).toBe('cancelled');
      const unchanged=await admin.from('projects').select('budget').eq('id',projectId).single();
      expect(Number(unchanged.data?.budget)).toBe(1000);
    } finally {
      if(activityId)await admin.from('crm_activities').delete().eq('id',activityId);
      if(taskId)await admin.from('tasks').delete().eq('id',taskId);
      if(onboardingId)await admin.from('onboarding_items').delete().eq('id',onboardingId);
      if(draftId)await admin.from('content_drafts').delete().eq('id',draftId);
      if(leadId)await admin.from('crm_leads').delete().eq('id',leadId);
      if(companyId)await admin.from('crm_companies').delete().eq('id',companyId);
      if(projectId)await admin.from('projects').delete().eq('id',projectId);
      if(runIds.length)await admin.from('agent_runs').delete().in('id',runIds);
    }
  });
});
