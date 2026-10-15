import { describe, it, expect } from 'vitest';
import {
  buildNewApplicationAlertEmail,
  buildApplicationApprovedEmail,
  buildApplicationRejectedEmail,
  buildCustomerInquiryAlertEmail,
} from './email-templates';

describe('Arabic Transactional Email Templates', () => {
  it('generates new application alert email with RTL, escaping, and review link', () => {
    const email = buildNewApplicationAlertEmail({
      applicantName: 'محمد البلوشي',
      applicantEmail: 'mohammed@example.com',
      applicantRole: 'مهندس ذكاء اصطناعي',
      applicationId: 'app-uuid-1234',
      dashboardUrl: 'https://reidpro.com',
    });

    expect(email.subject).toContain('محمد البلوشي');
    expect(email.html).toContain('dir="rtl"');
    expect(email.html).toContain('lang="ar"');
    expect(email.html).toContain('mohammed@example.com');
    expect(email.html).toContain('https://reidpro.com/dashboard?review=app-uuid-1234');
    expect(email.text).toContain('محمد البلوشي');
  });

  it('generates application approved email with magic link', () => {
    const email = buildApplicationApprovedEmail({
      applicantName: 'فاطمة الزدجالي',
      magicLinkUrl: 'https://reidpro.com/auth/confirm?token=xyz',
    });

    expect(email.subject).toContain('مرحبًا بك في فريق ريّد');
    expect(email.html).toContain('فاطمة الزدجالي');
    expect(email.html).toContain('https://reidpro.com/auth/confirm?token=xyz');
    expect(email.html).toContain('24 ساعة');
  });

  it('generates polite application rejected email', () => {
    const email = buildApplicationRejectedEmail({
      applicantName: 'سعيد المعمري',
    });

    expect(email.subject).toBe('بشأن طلب انضمامك إلى ريّد');
    expect(email.html).toContain('سعيد المعمري');
    expect(email.html).toContain('نعتذر عن عدم المضي قدمًا');
    expect(email.html).not.toContain('<a href='); // No CTA link for rejection
  });

  it('generates customer inquiry alert email with formatted table', () => {
    const email = buildCustomerInquiryAlertEmail({
      customerName: 'الشركة العمانية للاتصالات',
      customerPhone: '+96891234567',
      idea: 'تطوير بوت ذكي لخدمة العملاء',
      outcome: 'تقليل زمن الاستجابة بنسبة 50%',
      inboxUrl: 'https://reidpro.com/inbox',
    });

    expect(email.subject).toContain('الشركة العمانية للاتصالات');
    expect(email.html).toContain('+96891234567');
    expect(email.html).toContain('تطوير بوت ذكي');
    expect(email.html).toContain('https://reidpro.com/inbox');
  });

  it('escapes dangerous HTML characters in user input', () => {
    const email = buildApplicationApprovedEmail({
      applicantName: '<script>alert("xss")</script>',
      magicLinkUrl: 'https://reidpro.com/test',
    });

    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });
});
