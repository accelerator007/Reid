import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async request => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cronSecret = Deno.env.get("REPORT_CRON_SECRET");
  const authorization = request.headers.get("authorization") || "";
  if (!url || !serviceKey || !cronSecret || authorization !== `Bearer ${cronSecret}`) return json({ error: "unauthorized" }, 401);

  const input = await request.json().catch(() => ({})) as { period?: string; end?: string };
  const period = input.period === "weekly" ? "weekly" : input.period === "daily" ? "daily" : null;
  if (!period) return json({ error: "invalid_period" }, 400);
  const end = /^\d{4}-\d{2}-\d{2}$/.test(input.end || "") ? input.end! : new Date().toISOString().slice(0, 10);
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: report, error } = await supabase.rpc("generate_executive_report", { requested_period: period, requested_end: end });
  if (error || !report) return json({ error: "report_generation_failed" }, 500);

  if (period !== "weekly") return json({ report_id: report.id, email_status: "not_requested" });
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    await supabase.from("executive_reports").update({ email_status: "failed", email_error: "email_provider_not_configured" }).eq("id", report.id);
    return json({ report_id: report.id, email_status: "failed", reason: "email_provider_not_configured" });
  }

  const metrics = report.metrics as Record<string, number>;
  const rows = Object.entries(metrics).map(([key, value]) => `<tr><td style="padding:8px;border-bottom:1px solid #eee">${key.replaceAll("_", " ")}</td><td style="padding:8px;border-bottom:1px solid #eee"><b>${Number(value).toLocaleString("en-OM")}</b></td></tr>`).join("");
  const sent = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${resendKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("REPORT_FROM_EMAIL") || "Reid <reports@reidpro.com>",
      to: ["alialajmi524@gmail.com", "sheikhaalmamari4@gmail.com"],
      subject: `تقرير ريّد الأسبوعي — ${report.period_start} إلى ${report.period_end}`,
      html: `<main dir="rtl" style="font-family:Arial,sans-serif;max-width:680px;margin:auto"><h1 style="color:#5b3f95">تقرير ريّد الأسبوعي</h1><p>${report.period_start} — ${report.period_end}</p><table style="width:100%;border-collapse:collapse">${rows}</table><p style="color:#777">أُنشئ تلقائيًا من منصة ريّد.</p></main>`,
    }),
  });
  if (!sent.ok) {
    await supabase.from("executive_reports").update({ email_status: "failed", email_error: `provider_${sent.status}` }).eq("id", report.id);
    return json({ report_id: report.id, email_status: "failed" }, 502);
  }
  await supabase.from("executive_reports").update({ email_status: "sent", email_error: null }).eq("id", report.id);
  return json({ report_id: report.id, email_status: "sent" });
});
