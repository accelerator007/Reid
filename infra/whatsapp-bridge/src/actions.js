import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const cleanJson = (value) => {
  const match = String(value || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('planner_invalid_json');
  return JSON.parse(match[0]);
};

export async function planAction(chat, input, images = []) {
  const system = `حلل رسالة واتساب وأخرج JSON فقط بلا markdown. الأنواع: chat,outbound_message,meeting,project_status,memory_list,memory_save,memory_delete,knowledge,content,image_generate,image_edit,image_schedule,report_edit,invoice,troubleshoot,task_status,retry,undo,handoff. البنية {"intent":"...","query":"...","recipient":"","message":"","project":"...","memory":"...","memory_id":"","job_id":"","prompt":"...","title":"...","platforms":[],"aspect_ratio":"1:1","count":1,"scheduled_at":null,"tasks":[{"title":"","assignee":"","due_at":null}],"summary":"","decisions":[],"confidence":0.0,"missing":"","clarifying_question":""}. outbound_message يعني أن المالك يطلب إرسال رسالة واتساب لطرف ثالث؛ استخرج اسم/رقم المستلم في recipient ونص الرسالة فقط في message ولا تعتبر طلب الاتصال رسالة. task_status لطلب حالة الطلبات، retry لإعادة المحاولة، undo للتراجع، handoff للتحويل لمسؤول. إذا نقصت معلومة حاسمة ضعها في missing واكتب سؤالًا واحدًا فقط في clarifying_question. مقاسات Instagram post=1:1 أو 4:5 وStory=9:16 وLinkedIn/banner=16:9. scheduled_at بصيغة ISO مع +04:00. الاجتماع يستخرج ملخصًا وقرارات ومهام. لا تخترع أسماء أو مواعيد.`;
  const plan = cleanJson(await chat(system, input, images));
  plan.intent = String(plan.intent || 'chat');
  plan.confidence = Math.min(1, Math.max(0, Number(plan.confidence) || 0));
  plan.count = Math.min(3, Math.max(1, Number(plan.count) || 1));
  if (plan.missing) plan.clarifying_question = String(plan.clarifying_question || 'وش المعلومة الناقصة؟').split(/\n+/)[0].slice(0, 240);
  return plan;
}

export class ActionStore {
  constructor(path) { this.path = path; this.state = { pending: {}, artifacts: {}, jobs: [], publicImageUsage: {}, contacts: {} }; this.queue = Promise.resolve(); }
  async load() {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    try { this.state = { ...this.state, ...JSON.parse(await readFile(this.path, 'utf8')) }; } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    this.prune(); await this.save();
  }
  prune() { const cutoff = Date.now() - 30 * 86_400_000; this.state.jobs = this.state.jobs.filter((x) => new Date(x.updatedAt).getTime() > cutoff).slice(-500); }
  save() { this.queue = this.queue.then(async () => { const tmp = `${this.path}.tmp`; await writeFile(tmp, `${JSON.stringify(this.state, null, 2)}\n`, { mode: 0o600 }); await rename(tmp, this.path); }); return this.queue; }
  async pending(key, value) { if (value === undefined) return this.state.pending[key]; if (value === null) delete this.state.pending[key]; else this.state.pending[key] = value; await this.save(); return value; }
  async artifact(key, value) { if (value === undefined) return this.state.artifacts[key]; this.state.artifacts[key] = value; await this.save(); return value; }
  async job(kind, request, contextKey = '') { const row = { id: randomUUID().slice(0, 8), kind, status: 'running', contextKey, request, attempts: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; this.state.jobs.push(row); await this.save(); return row; }
  async finish(id, status, result) { const row = this.state.jobs.find((x) => x.id === id); if (row) { row.status = status; row.result = result; row.updatedAt = new Date().toISOString(); await this.save(); } return row; }
  recentJobs(contextKey, limit = 5) { return this.state.jobs.filter((row) => row.contextKey === contextKey).slice(-Math.max(1, limit)).reverse(); }
  findJob(contextKey, id = '') { const rows = this.recentJobs(contextKey, 100); return id ? rows.find((row) => row.id === id) : rows[0]; }
  async prepareRetry(contextKey, id = '') {
    const row = this.findJob(contextKey, id);
    if (!row || row.status !== 'failed') return null;
    row.status = 'pending_approval'; row.attempts = Number(row.attempts || 1) + 1; row.updatedAt = new Date().toISOString(); await this.save();
    return row;
  }
  async handoff(contextKey, id = '') {
    const row = this.findJob(contextKey, id);
    if (!row) return null;
    row.status = 'needs_human'; row.updatedAt = new Date().toISOString(); await this.save(); return row;
  }
  async cancel(contextKey, id = '') {
    const row = this.findJob(contextKey, id);
    if (!row || !['running', 'pending_approval', 'needs_input'].includes(row.status)) return null;
    row.status = 'cancelled'; row.updatedAt = new Date().toISOString(); await this.save(); return row;
  }
  async claimPublicImage(sender, dailyLimit = 2) {
    const day = new Date().toISOString().slice(0, 10); const key = `${day}:${sender}`;
    const used = Number(this.state.publicImageUsage[key] || 0);
    if (used >= dailyLimit) return { allowed: false, remaining: 0 };
    this.state.publicImageUsage = Object.fromEntries(Object.entries(this.state.publicImageUsage).filter(([entry]) => entry.startsWith(`${day}:`)));
    this.state.publicImageUsage[key] = used + 1; await this.save();
    return { allowed: true, remaining: dailyLimit - used - 1 };
  }
  async rememberContacts(rows = []) {
    for (const row of rows) {
      const id = String(row?.id || ''); const name = String(row?.name || row?.notify || row?.verifiedName || '').trim();
      if (!id || id.endsWith('@g.us') || !name) continue;
      this.state.contacts[id] = { id, name: name.slice(0, 120), updatedAt: new Date().toISOString() };
    }
    await this.save();
  }
  resolveContact(value) {
    const query = String(value || '').trim(); const digits = query.replace(/\D/g, '');
    if (digits.length >= 8) { const phone = digits.length === 8 ? `968${digits}` : digits; return { id: `${phone}@s.whatsapp.net`, name: `+${phone}`, phone }; }
    const normalized = query.toLocaleLowerCase('ar').replace(/[ـًٌٍَُِّْ]/g, '').replace(/\s+/g, ' ');
    const matches = Object.values(this.state.contacts).filter((row) => row.name.toLocaleLowerCase('ar').replace(/[ـًٌٍَُِّْ]/g, '').includes(normalized));
    if (matches.length === 1) return matches[0];
    return { ambiguous: matches.slice(0, 5) };
  }
}
