import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const cleanJson = (value) => {
  const match = String(value || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('planner_invalid_json');
  return JSON.parse(match[0]);
};

export async function planAction(chat, input, images = []) {
  const system = `حلل رسالة واتساب وأخرج JSON فقط بلا markdown. الأنواع: chat,meeting,project_status,memory_list,memory_save,memory_delete,knowledge,content,image_generate,image_edit,image_schedule,report_edit,invoice,troubleshoot. البنية {"intent":"...","query":"...","project":"...","memory":"...","prompt":"...","title":"...","platforms":[],"aspect_ratio":"1:1","count":1,"scheduled_at":null,"tasks":[{"title":"","assignee":"","due_at":null}],"summary":"","decisions":[]}. مقاسات Instagram post=1:1 أو 4:5 وStory=9:16 وLinkedIn/banner=16:9. scheduled_at بصيغة ISO مع +04:00. الاجتماع يستخرج ملخصًا وقرارات ومهام. لا تخترع أسماء أو مواعيد.`;
  return cleanJson(await chat(system, input, images));
}

export class ActionStore {
  constructor(path) { this.path = path; this.state = { pending: {}, artifacts: {}, jobs: [] }; this.queue = Promise.resolve(); }
  async load() {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    try { this.state = { ...this.state, ...JSON.parse(await readFile(this.path, 'utf8')) }; } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    this.prune(); await this.save();
  }
  prune() { const cutoff = Date.now() - 30 * 86_400_000; this.state.jobs = this.state.jobs.filter((x) => new Date(x.updatedAt).getTime() > cutoff).slice(-500); }
  save() { this.queue = this.queue.then(async () => { const tmp = `${this.path}.tmp`; await writeFile(tmp, `${JSON.stringify(this.state, null, 2)}\n`, { mode: 0o600 }); await rename(tmp, this.path); }); return this.queue; }
  async pending(key, value) { if (value === undefined) return this.state.pending[key]; if (value === null) delete this.state.pending[key]; else this.state.pending[key] = value; await this.save(); return value; }
  async artifact(key, value) { if (value === undefined) return this.state.artifacts[key]; this.state.artifacts[key] = value; await this.save(); return value; }
  async job(kind, request) { const row = { id: randomUUID().slice(0, 8), kind, status: 'running', request, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; this.state.jobs.push(row); await this.save(); return row; }
  async finish(id, status, result) { const row = this.state.jobs.find((x) => x.id === id); if (row) { row.status = status; row.result = result; row.updatedAt = new Date().toISOString(); await this.save(); } return row; }
}
