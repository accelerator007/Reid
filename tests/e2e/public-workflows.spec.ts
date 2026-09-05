import { expect, test } from '@playwright/test';

test('renders Reid bilingually and opens WhatsApp assistant', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('ريّد', { exact: true }).first()).toBeVisible();
  // Vite may inline the mark as a data URI or emit a hashed file depending on the
  // build, so assert what actually broke in production: that the image renders.
  const brandMark = page.locator('header .brand img');
  await expect(brandMark).toBeVisible();
  await expect
    .poll(() => brandMark.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'EN' }).click();
  await expect(page.getByText('Building the future intelligently.')).toBeVisible();
  await page.getByRole('button', { name: 'Chat' }).click();
  await expect(page.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', /^https:\/\/wa\.me\/96897308003/);
});

test('protects the dashboard for anonymous visitors', async ({ page }) => {
  await page.goto('/dashboard');
  // Every guarded route now offers sign-in inline and keeps the destination,
  // rather than a dead-end gate that forgets where the visitor was going.
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'G Google' })).toBeVisible();
  await expect(page.getByText('Pending Approvals')).toHaveCount(0);
});

test('protects the employee workspace for anonymous visitors', async ({ page }) => {
  await page.goto('/workspace');
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'G Google' })).toBeVisible();
});

test('protects project routes for anonymous visitors', async ({ page }) => {
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
  await page.goto('/projects/00000000-0000-0000-0000-000000000001');
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
});

test('protects research routes for anonymous visitors', async ({ page }) => {
  await page.goto('/research');
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
  await expect(page.getByText('الأبحاث')).toHaveCount(0);
  await page.goto('/research/00000000-0000-0000-0000-000000000002');
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
});

test('keeps account creation behind the join approval workflow', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByText('الدخول للحسابات المعتمدة فقط.')).toBeVisible();
  await expect(page.getByRole('button', { name: /أرسل طلب انضمام/ })).toBeVisible();
  await expect(page.getByText('أنشئ حسابًا')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'أرسل رابط دخول آمن' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'نسيت كلمة المرور' })).toBeVisible();
});

test('join form validates required fields and CV constraints', async ({ page }) => {
  await page.goto('/apply');
  await page.getByRole('button', { name: 'إرسال الطلب' }).click();
  await expect(page.locator('input[name="full_name"]')).toHaveJSProperty('validity.valueMissing', true);
  await expect(page.locator('input[name="cv"]')).toHaveAttribute('accept', 'application/pdf');
});

test('renders privacy and in-app 404 routes', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'سياسة الخصوصية' })).toBeVisible();
  await page.goto('/does-not-exist');
  await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
});
