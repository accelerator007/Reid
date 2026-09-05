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

  test('Owner runs Operations against real governed company context through Gemini', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/dashboard');
    await page.locator('input[name="email"]').fill(users.owner.email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('form button.primary').click();
    await expect(page.getByRole('heading', { name: 'خريطة قيادة الوكلاء' })).toBeVisible();
    await page.getByRole('button', { name: /Operations:/ }).click();
    await page.getByPlaceholder('اكتب الهدف أو المهمة').fill('أعطني ملخصًا قصيرًا لحالة المشاريع والمهام الموجودة في السياق المصرح به فقط.');
    const [gatewayResponse] = await Promise.all([
      page.waitForResponse(response => response.url().includes('/functions/v1/llm-gateway'), { timeout: 45_000 }),
      page.getByRole('button', { name: 'تشغيل يدوي' }).click(),
    ]);
    const gateway = await gatewayResponse.json();
    expect(gatewayResponse.ok(), JSON.stringify(gateway)).toBe(true);
    expect(gateway.runId).toBeTruthy();
    await expect(page.locator('.agent-output')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('.agent-output')).not.toContainText(/tool_.*_failed|provider_|unknown_error/i);
    const run = await admin.from('agent_runs').select('provider_id,classification,run_state,latency_ms,token_usage').eq('id', gateway.runId).single();
    if (run.error) throw run.error;
    expect(run.data.provider_id).toBe('gemini');
    expect(run.data.classification).toBe('internal');
    expect(run.data.run_state).toBe('succeeded');
    expect(run.data.latency_ms).toBeGreaterThan(0);
  });
});
