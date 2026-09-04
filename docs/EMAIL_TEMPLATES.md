# Reid email templates

These templates are ready for the future custom SMTP provider. Supabase Free locks
template editing while its default sender is in use, so they must not be described
as active until SMTP is connected and a delivery test passes.

## Account invitation (Arabic)

Subject: `مرحبًا بك في ريد — أكمل إنشاء حسابك`

```html
<div dir="rtl" lang="ar" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#241a33">
  <h1 style="color:#6546b4">مرحبًا بك في ريد</h1>
  <p>تمت الموافقة على طلب انضمامك. استخدم الزر التالي لإكمال إنشاء حسابك والوصول إلى مساحة العمل.</p>
  <p style="margin:32px 0">
    <a href="{{ .ConfirmationURL }}" style="background:#6546b4;color:#fff;padding:14px 24px;border-radius:12px;text-decoration:none">إكمال إنشاء الحساب</a>
  </p>
  <p>ينتهي هذا الرابط بعد المدة المحددة في إعدادات الأمان، ولا ينبغي مشاركته مع أي شخص.</p>
  <small>أُرسلت هذه الرسالة لأن طلب انضمامك إلى ريد تمت الموافقة عليه.</small>
</div>
```

## Magic Link (Arabic)

Subject: `رابط الدخول الآمن إلى ريد`

Use the same layout with button text `الدخول إلى حسابي` and
`{{ .ConfirmationURL }}` as the target.

## Administrator review (Arabic)

The mail provider should substitute `APPLICATION_ID` server-side. Both links are
safe entry points: they require an authenticated Admin/HR session and never execute
the decision automatically. The reviewer must read the request and press the final
confirmation button in the dashboard.

- Approve review: `https://reidpro.com/dashboard?review=APPLICATION_ID&decision=approved`
- Reject review: `https://reidpro.com/dashboard?review=APPLICATION_ID&decision=rejected`

The rejection reason is entered only inside the dashboard and is never included in
the applicant email.

## Deferred provider decision

Custom SMTP was deferred by the Owner on 2026-09-03. Evaluate Resend or Brevo when
the work resumes. Store SMTP credentials only in Supabase; never commit or paste
them into project documentation.
