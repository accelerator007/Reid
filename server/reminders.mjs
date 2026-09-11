export function reminderDecision(row, now = Date.now()) {
  if (!/^[0-9]{7,15}$/.test(row.whatsapp_phone)) return 'invalid_recipient';
  if (now - Date.parse(row.due_at) > 30 * 60_000) return 'overdue_review_required';
  return 'queue';
}

export async function processReminders(admin, check, connected) {
  // Reconcile against actual delivery; never describe an enqueue as "sent".
  const sending = await check(admin.from('personal_reminders').select('id').eq('status','sending').limit(25));
  for (const row of sending) {
    const outbox = await check(admin.from('qr_outbox').select('status').eq('dedupe_key',`reminder:${row.id}`).maybeSingle());
    if (!outbox || ['uncertain','failed','cancelled'].includes(outbox.status)) {
      await check(admin.from('personal_reminders').update({status:'failed',last_error:'verify_delivery_before_retry',updated_at:new Date().toISOString()}).eq('id',row.id).eq('status','sending'));
    } else if (outbox.status === 'sent') {
      await check(admin.from('personal_reminders').update({status:'sent',sent_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()}).eq('id',row.id).eq('status','sending'));
    }
  }
  if (!connected) return;
  const due = await check(admin.from('personal_reminders').select('*').eq('status','scheduled').lte('due_at',new Date().toISOString()).order('due_at').limit(10));
  for (const row of due) {
    const decision = reminderDecision(row);
    if (decision !== 'queue') {
      await check(admin.from('personal_reminders').update({status:'failed',last_error:decision,updated_at:new Date().toISOString()}).eq('id',row.id).eq('status','scheduled'));
      continue;
    }
    const control = await check(admin.from('account_controls').select('status').eq('user_id',row.owner_id).maybeSingle());
    const role = await check(admin.from('user_roles').select('role').eq('user_id',row.owner_id).eq('role','owner').maybeSingle());
    if (control?.status !== 'active' || !role) continue;
    const jid = `${row.whatsapp_phone}@s.whatsapp.net`;
    await check(admin.from('qr_conversations').upsert({jid,display_name:row.whatsapp_phone},{onConflict:'jid',ignoreDuplicates:true}));
    const chat = await check(admin.from('qr_conversations').select('id').eq('jid',jid).single());
    await check(admin.from('qr_outbox').upsert({conversation_id:chat.id,origin:'human',requested_by:row.owner_id,
      body:`⏰ تذكيرك:\n${row.reminder_text}`,dedupe_key:`reminder:${row.id}`,
    },{onConflict:'dedupe_key',ignoreDuplicates:true}));
    await check(admin.from('personal_reminders').update({status:'sending',attempts:row.attempts+1,updated_at:new Date().toISOString()}).eq('id',row.id).eq('status','scheduled'));
  }
}
