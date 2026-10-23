// Arabic Transactional Email Templates for Reid Platform.
// Fully self-contained HTML templates with inline styles, RTL direction,
// and compatibility with modern email clients (Gmail, Apple Mail, Outlook).

export type EmailTemplateResult = {
  subject: string;
  html: string;
  text: string;
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function baseEmailTemplate({
  subject,
  preheader,
  heading,
  bodyHtml,
  cta,
  footerNote,
}: {
  subject: string;
  preheader?: string;
  heading: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  footerNote?: string;
}): string {
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f7f4fd;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;direction:rtl;text-align:right;color:#1f1b26;">
  ${preheader ? `<div style="display:none;font-size:1px;color:#f7f4fd;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>` : ''}
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f7f4fd;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:580px;background-color:#ffffff;border-radius:18px;border:1px solid #e5ddf7;box-shadow:0 4px 18px rgba(91,68,153,0.06);overflow:hidden;">
          <!-- Header Bar -->
          <tr>
            <td style="padding:28px 32px 20px;background:linear-gradient(135deg,#5b4499,#7c5cb7);color:#ffffff;text-align:right;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.12em;color:#e5ddf7;text-transform:uppercase;">ريّد · REID</span>
                    <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#ffffff;line-height:1.4;">${escapeHtml(heading)}</h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding:32px;font-size:15px;line-height:1.8;color:#2b1f4d;">
              ${bodyHtml}

              ${
                cta
                  ? `
              <div style="margin:32px 0 16px;text-align:center;">
                <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:14px 28px;background-color:#5b4499;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;box-shadow:0 3px 10px rgba(91,68,153,0.25);">
                  ${escapeHtml(cta.label)}
                </a>
              </div>`
                  : ''
              }
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:#fdfcfe;border-top:1px solid #efeafb;font-size:12px;color:#7b7488;text-align:center;line-height:1.6;">
              <p style="margin:0;">منصة ريّد التقنية — أفكار تستحق أن تصبح واقعًا.</p>
              ${footerNote ? `<p style="margin:6px 0 0;color:#8a8397;">${escapeHtml(footerNote)}</p>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * 1. Alert to Admin/HR: New join application submitted
 */
export function buildNewApplicationAlertEmail({
  applicantName,
  applicantEmail,
  applicantRole,
  applicationId,
  dashboardUrl,
}: {
  applicantName: string;
  applicantEmail: string;
  applicantRole: string;
  applicationId: string;
  dashboardUrl: string;
}): EmailTemplateResult {
  const subject = `طلب انضمام جديد إلى ريّد: ${applicantName}`;
  const reviewUrl = `${dashboardUrl.replace(/\/$/, '')}/dashboard?review=${encodeURIComponent(applicationId)}`;

  const bodyHtml = `
    <p style="margin:0 0 16px;">مرحبًا فريق الإدارة،</p>
    <p style="margin:0 0 16px;">تم تقديم طلب انضمام جديد عبر البوابة الرسمية، وتفاصيل المتقدم كالتالي:</p>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f9f8fb;border:1px solid #e2dde7;border-radius:10px;margin-bottom:20px;padding:16px;">
      <tr><td style="padding:6px 12px;color:#7b7488;font-size:13px;width:120px;">الاسم:</td><td style="padding:6px 12px;font-weight:600;">${escapeHtml(applicantName)}</td></tr>
      <tr><td style="padding:6px 12px;color:#7b7488;font-size:13px;">البريد الإلكتروني:</td><td style="padding:6px 12px;direction:ltr;text-align:right;">${escapeHtml(applicantEmail)}</td></tr>
      <tr><td style="padding:6px 12px;color:#7b7488;font-size:13px;">المجال / الدور:</td><td style="padding:6px 12px;font-weight:600;">${escapeHtml(applicantRole)}</td></tr>
    </table>
    <p style="margin:0;">يمكنكم مراجعة السيرة الذاتية واتخاذ القرار المباشر عبر لوحة الإدارة:</p>
  `;

  return {
    subject,
    html: baseEmailTemplate({
      subject,
      preheader: `طلب انضمام جديد من ${applicantName}`,
      heading: 'طلب انضمام جديد',
      bodyHtml,
      cta: { label: 'مراجعة الطلب في النظام', url: reviewUrl },
      footerNote: 'أُرسل هذا الإشعار تلقائيًا إلى مسؤولي التوظيف والإدارة في ريّد.',
    }),
    text: `طلب انضمام جديد إلى ريّد:\nالاسم: ${applicantName}\nالبريد: ${applicantEmail}\nالدور: ${applicantRole}\nرابط المراجعة: ${reviewUrl}`,
  };
}

/**
 * 2. Welcome to Applicant: Application approved with Magic Link
 */
export function buildApplicationApprovedEmail({
  applicantName,
  magicLinkUrl,
}: {
  applicantName: string;
  magicLinkUrl: string;
}): EmailTemplateResult {
  const subject = 'مرحبًا بك في فريق ريّد — تفعيل حسابك';

  const bodyHtml = `
    <p style="margin:0 0 16px;">عزيزنا <strong>${escapeHtml(applicantName)}</strong>،</p>
    <p style="margin:0 0 16px;">يسعدنا إبلاغك بأنه تمت الموافقة على طلب انضمامك إلى <strong>ريّد</strong>! نرحب بك في بيئة العمل التقنية والابتكار.</p>
    <p style="margin:0 0 16px;">لبدء رحلتك وتفعيل حسابك الرسمي في المنصة، يرجى الضغط على الزر التالي لتسجيل الدخول بأمان:</p>
  `;

  return {
    subject,
    html: baseEmailTemplate({
      subject,
      preheader: 'تم قبول طلب انضمامك إلى ريّد. أكمل إعداد حسابك.',
      heading: 'مرحبًا بك في ريّد!',
      bodyHtml,
      cta: { label: 'تفعيل الحساب والدخول', url: magicLinkUrl },
      footerNote: 'ينتهي هذا الرابط خلال 24 ساعة لضمان أمان حسابك. لا تشارك الرابط مع أي شخص آخر.',
    }),
    text: `عزيزنا ${applicantName}، تمت الموافقة على طلب انضمامك إلى ريّد.\nرابط الدخول الآمن: ${magicLinkUrl}\nينتهي الرابط خلال 24 ساعة.`,
  };
}

/**
 * 3. Polite Application Rejection Email
 */
export function buildApplicationRejectedEmail({
  applicantName,
}: {
  applicantName: string;
}): EmailTemplateResult {
  const subject = 'بشأن طلب انضمامك إلى ريّد';

  const bodyHtml = `
    <p style="margin:0 0 16px;">عزيزنا <strong>${escapeHtml(applicantName)}</strong>،</p>
    <p style="margin:0 0 16px;">نشكرك جزيل الشكر على اهتمامك وحرصك على الانضمام إلى فريق عمل ريّد، وعلى الوقت الذي خصصته لمشاركتنا خبراتك ومؤهلاتك.</p>
    <p style="margin:0 0 16px;">بعد دراسة متأنية لجميع الطلبات في ضوء الاحتياجات والفرص الحالية للشركة، نعتذر عن عدم المضي قدمًا في ترشيحك في الوقت الراهن.</p>
    <p style="margin:0 0 16px;">ملفك المهني سيبقى محفوظًا لدينا باعتزاز في قاعدة بيانات الكفاءات، وسنتواصل معك فور توفر فرصة مستقبلية تتناسب مع مهاراتك المميزة.</p>
    <p style="margin:0;">نتمنى لك كل التوفيق والنجاح في مسيرتك المهنية القادمة.</p>
  `;

  return {
    subject,
    html: baseEmailTemplate({
      subject,
      preheader: 'نشكرك على اهتمامك بالانضمام إلى فريق ريّد.',
      heading: 'شكر وتقدير',
      bodyHtml,
      footerNote: 'فريق استقطاب الكفاءات — ريّد',
    }),
    text: `عزيزنا ${applicantName}، نشكرك على تقديم طلبك إلى ريّد. نعتذر عن عدم قبول الطلب في الوقت الحالي مع تمنياتنا لك بالتوفيق والنجاح.`,
  };
}

/**
 * 4. Alert to Owner: Direct Customer Inquiry from WhatsApp or Public Brief
 */
export function buildCustomerInquiryAlertEmail({
  customerName,
  customerPhone,
  idea,
  outcome,
  inboxUrl,
}: {
  customerName: string;
  customerPhone: string;
  idea: string;
  outcome: string;
  inboxUrl: string;
}): EmailTemplateResult {
  const subject = `استفسار عميل جديد: ${customerName} (${customerPhone})`;

  const bodyHtml = `
    <p style="margin:0 0 16px;">تلقى النظام ملخص مشروع جديد من عميل مهتم بخدمات ريّد:</p>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f9f8fb;border:1px solid #e2dde7;border-radius:10px;margin-bottom:20px;padding:16px;">
      <tr><td style="padding:6px 12px;color:#7b7488;font-size:13px;width:120px;">اسم العميل:</td><td style="padding:6px 12px;font-weight:600;">${escapeHtml(customerName)}</td></tr>
      <tr><td style="padding:6px 12px;color:#7b7488;font-size:13px;">رقم الهاتف:</td><td style="padding:6px 12px;direction:ltr;text-align:right;">${escapeHtml(customerPhone)}</td></tr>
      <tr><td style="padding:6px 12px;color:#7b7488;font-size:13px;vertical-align:top;">فكرة المشروع:</td><td style="padding:6px 12px;line-height:1.6;">${escapeHtml(idea)}</td></tr>
      <tr><td style="padding:6px 12px;color:#7b7488;font-size:13px;vertical-align:top;">النتيجة المطلوبة:</td><td style="padding:6px 12px;line-height:1.6;">${escapeHtml(outcome)}</td></tr>
    </table>
    <p style="margin:0;">يمكنكم متابعة المحادثة مباشرة عبر صندوق الوارد أو تطبيق واتساب:</p>
  `;

  return {
    subject,
    html: baseEmailTemplate({
      subject,
      preheader: `ملخص مشروع جديد من العميل ${customerName}`,
      heading: 'استفسار مشروع جديد',
      bodyHtml,
      cta: { label: 'فتح صندوق محادثات ريّد', url: inboxUrl },
      footerNote: 'نظام إدارة التواصل الذكي — ريّد',
    }),
    text: `استفسار عميل جديد:\nالاسم: ${customerName}\nالهاتف: ${customerPhone}\nالفكرة: ${idea}\nالنتيجة: ${outcome}\nرابط الصندوق: ${inboxUrl}`,
  };
}
