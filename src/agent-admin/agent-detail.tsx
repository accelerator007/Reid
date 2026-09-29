// One agent: what it is for, why it cannot run when it cannot, its tools as
// real forms, a manual run, pause and enable, and its recent runs.
import React from 'react';
import { ArrowLeft, ArrowRight, Bot, BrainCircuit, CirclePause, Play, Power, ShieldAlert, Wrench } from 'lucide-react';
import { canRun, operationalState, providerAccepts, runAgent, runAgentTool, setAgentState, topologyFor, type AgentRow, type AgentToolRow, type ProviderRow } from '../agents';
import { messageForRaw } from '../db';
import { useSession } from '../shell';
import { Badge, Button, Card, Dialog, EmptyState, Field, FormGrid, InlineAlert, SectionHeader, TextArea, TextInput } from '../ui';
import type { AgentAdminData, RunWithRequester } from './api';
import { DecideDialog, RunRowView } from './agent-parts';
import {
  agentName, agentStates, blockReason, blockReasons, canToggleAgents, classificationLabels, describeToolResult, domainLabels,
  fieldLabel, lastRunsLine, levelLabel, openRun, toolArguments, toolFields, type Lang, type ToolField,
} from './model';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);
const operations: Record<AgentToolRow['operation'], { ar: string; en: string }> = {
  read: { ar: 'قراءة', en: 'Read' }, create: { ar: 'إنشاء', en: 'Create' }, update: { ar: 'تعديل', en: 'Update' }, publish: { ar: 'نشر', en: 'Publish' },
};

export function AgentDetail({ lang, agent, provider, data, back, reload }: {
  lang: Lang; agent: AgentRow; provider: ProviderRow | undefined; data: AgentAdminData; back: () => void; reload: () => Promise<void>;
}) {
  const { roles } = useSession();
  const owner = canToggleAgents(roles);
  const node = topologyFor(agent.id);
  const runs = data.runs.filter(item => item.agent_id === agent.id);
  const state = operationalState(agent, provider, data.runs);
  const blocked = blockReason(agent, provider);
  const runnable = canRun(agent, provider);
  const tools = data.tools.filter(tool => agent.permissions?.includes(tool.id));
  const [prompt, setPrompt] = React.useState('');
  const [busy, setBusy] = React.useState<'run' | 'pause' | 'enable' | null>(null);
  const [result, setResult] = React.useState<{ tone: 'success' | 'warning' | 'danger'; text: string } | null>(null);
  const [tool, setTool] = React.useState<AgentToolRow | null>(null);
  const [deciding, setDeciding] = React.useState<RunWithRequester | null>(null);
  const [disabling, setDisabling] = React.useState(false);
  const name = agentName(agent, lang);
  const queued = runs.filter(openRun).length;
  const measured = runs.filter(item => item.quality_score != null);
  const quality = measured.length ? Math.round(measured.reduce((sum, item) => sum + (item.quality_score ?? 0), 0) / measured.length) : null;
  const timed = runs.filter(item => item.latency_ms != null);
  const latency = timed.length ? timed.reduce((sum, item) => sum + (item.latency_ms ?? 0), 0) / timed.length / 1000 : null;

  const execute = async () => {
    setBusy('run'); setResult(null);
    try {
      const outcome = await runAgent(agent.id, prompt.trim(), agent.classification);
      if (outcome.status === 'pending_approval') setResult({ tone: 'warning', text: tr(lang, 'الطلب ينتظر الموافقة قبل التنفيذ.', 'The request is waiting for approval.') });
      else if (outcome.status === 'queued' || !outcome.output) setResult({ tone: 'success', text: tr(lang, 'أُرسل الطلب إلى ai-lap. ستظهر النتيجة في سجل التشغيل.', 'Sent to ai-lap. The result will appear in the run log.') });
      else setResult({ tone: 'success', text: outcome.output });
      setPrompt('');
    } catch (thrown) { setResult({ tone: 'danger', text: messageForRaw(thrown, lang) }); }
    finally { setBusy(null); await reload(); }
  };
  const change = async (kind: 'pause' | 'enable', patch: Parameters<typeof setAgentState>[1]) => {
    setBusy(kind); setResult(null);
    try { await setAgentState(agent.id, patch); await reload(); }
    catch (thrown) { setResult({ tone: 'danger', text: messageForRaw(thrown, lang) }); }
    finally { setBusy(null); }
  };

  return (
    <main className="agent-page">
      <div>
        <Button variant="ghost" icon={lang === 'ar' ? <ArrowRight /> : <ArrowLeft />} onClick={back}>{tr(lang, 'كل الوكلاء', 'All agents')}</Button>
      </div>

      <Card className="agent-hero" data-state={state}>
        <span className="agent-hero__icon" aria-hidden="true">{agent.id === 'ceo' ? <BrainCircuit /> : <Bot />}</span>
        <div className="agent-hero__text">
          <p className="ui-eyebrow">{node ? domainLabels[node.domain][lang] : tr(lang, 'وكيل', 'Agent')}</p>
          <h1>{name}</h1>
          {node && <p>{node.purpose[lang]}</p>}
        </div>
        <div className="agent-hero__side">
          <div className="agent-hero__badges">
            <Badge tone={agentStates[state].tone} dot>{agentStates[state].label[lang]}</Badge>
            {queued > 0 && <Badge tone="brand">{tr(lang, `${queued} في الطابور`, `${queued} queued`)}</Badge>}
          </div>
          <div className="agent-hero__actions">
            <Button icon={<CirclePause />} busy={busy === 'pause'} disabled={!!busy || !agent.enabled}
              onClick={() => void change('pause', { status: agent.status === 'paused' ? 'idle' : 'paused' })}>
              {agent.status === 'paused' ? tr(lang, 'استئناف', 'Resume') : tr(lang, 'إيقاف مؤقت', 'Pause')}
            </Button>
            {owner && (agent.enabled
              ? <Button variant="danger" icon={<Power />} disabled={!!busy} onClick={() => setDisabling(true)}>{tr(lang, 'تعطيل', 'Disable')}</Button>
              : <Button variant="primary" icon={<Power />} busy={busy === 'enable'} disabled={!!busy} onClick={() => void change('enable', { enabled: true, disabled_reason: null })}>{tr(lang, 'تفعيل', 'Enable')}</Button>)}
          </div>
        </div>
      </Card>

      {blocked && (
        <InlineAlert tone="danger">
          <ShieldAlert aria-hidden="true" className="agent-alert-icon" />
          {blockReasons[blocked][lang]}{blocked === 'disabled' && agent.disabled_reason ? ` ${tr(lang, 'السبب', 'Reason')}: ${agent.disabled_reason}` : ''}
        </InlineAlert>
      )}
      {!owner && <p className="agents-note">{tr(lang, 'التفعيل والتعطيل للمالك فقط؛ الإيقاف المؤقت متاح للإدارة.', 'Only the owner enables or disables agents; administrators can pause them.')}</p>}

      <div className="agent-facts">
        <Fact label={tr(lang, 'المزوّد والنموذج', 'Provider and model')} value={provider?.name ?? '—'} hint={provider?.chat_model ?? agent.model} ltrHint />
        <Fact label={tr(lang, 'تصنيف البيانات', 'Data classification')} value={classificationLabels[agent.classification].label[lang]} hint={classificationLabels[agent.classification].hint[lang]} />
        <Fact label={tr(lang, 'أعلى صلاحية', 'Highest authority')} value={`L${agent.approval_level}`} hint={levelLabel(agent.approval_level, lang)} />
        <Fact label={tr(lang, 'التصريح', 'Clearance')}
          value={provider && providerAccepts(provider, agent.classification) ? tr(lang, 'مسموح', 'Cleared') : tr(lang, 'مرفوض', 'Denied')}
          hint={tr(lang, 'هل يُسمح بإرسال بياناته لمزوّده', 'Whether its data may go to its provider')} />
        <Fact label={tr(lang, 'متوسط المدة', 'Average time')} value={latency != null ? `${latency.toFixed(1)}s` : '—'} hint={runs.length ? lastRunsLine(runs.length, lang) : undefined} />
        <Fact label={tr(lang, 'جودة الردود', 'Answer quality')} value={quality != null ? `${quality}/100` : '—'} hint={tr(lang, 'فحص الدقة والمراجع قبل العرض', 'Checked for accuracy and grounding')} />
      </div>

      <div className="agent-columns">
        <div className="agent-main">
          <Card>
            <SectionHeader title={tr(lang, 'اطلب منه مباشرة', 'Ask it directly')}
              description={tr(lang, 'للمحادثة الجماعية بين الوكلاء استخدم غرفة الوكلاء.', 'For a conversation across agents, use the agent room.')} />
            <form className="agent-ask" onSubmit={event => { event.preventDefault(); if (prompt.trim() && runnable) void execute(); }}>
              <TextArea value={prompt} onChange={event => setPrompt(event.target.value)} rows={3} maxLength={8000}
                aria-label={tr(lang, 'المطلوب', 'Request')} placeholder={tr(lang, 'اكتب الهدف أو المهمة…', 'Describe the objective or task…')} disabled={!runnable} />
              <div className="agent-ask__row">
                <small>{runnable ? tr(lang, 'المحادثة قراءة وتحليل فقط؛ أي تعديل يتم عبر الأدوات.', 'Conversation only reads and analyses; changes go through tools.') : tr(lang, 'لا يمكن تشغيله الآن.', 'It cannot run right now.')}</small>
                <Button type="submit" variant="primary" icon={<Play />} busy={busy === 'run'} disabled={!runnable || !prompt.trim() || !!busy}>{tr(lang, 'تشغيل', 'Run')}</Button>
              </div>
            </form>
            {result && <output className="agent-result" data-tone={result.tone}>{result.text}</output>}
          </Card>

          <Card>
            <SectionHeader title={tr(lang, 'آخر التشغيلات', 'Recent runs')} />
            {runs.length ? (
              <div className="agents-list">
                {runs.slice(0, 12).map(item => (
                  <RunRowView key={item.id} lang={lang} run={item} requester={data.names.get(item.requested_by ?? '')}
                    actions={item.approval_state === 'pending'
                      ? <div className="run__actions"><Button size="sm" variant="primary" onClick={() => setDeciding(item)}>{tr(lang, 'مراجعة وقرار', 'Review')}</Button></div>
                      : undefined} />
                ))}
              </div>
            ) : <EmptyState icon={<Play />} title={tr(lang, 'لم يُشغَّل بعد', 'No runs yet')} />}
          </Card>
        </div>

        <div className="agent-side">
          <Card>
            <SectionHeader title={tr(lang, 'الأدوات', 'Tools')} description={tr(lang, 'ما يستطيع فعله فعليًا في النظام.', 'What it can actually do in the system.')} />
            {tools.length ? (
              <div className="agent-tools">
                {tools.map(item => (
                  <button type="button" key={item.id} className="agent-tool" disabled={!runnable} onClick={() => setTool(item)}>
                    <span className="agent-tool__icon" aria-hidden="true"><Wrench /></span>
                    <span className="agent-tool__text">
                      <strong>{lang === 'ar' ? item.name_ar : item.name_en}</strong>
                      <small>{operations[item.operation][lang]} · {levelLabel(item.approval_level, lang)}</small>
                    </span>
                    <Badge tone={item.approval_level >= 2 ? 'warning' : 'neutral'}>L{item.approval_level}</Badge>
                  </button>
                ))}
              </div>
            ) : <p className="agents-muted">{tr(lang, 'لا أدوات مسندة لهذا الوكيل.', 'No tools are assigned to this agent.')}</p>}
          </Card>
          {node && (
            <Card>
              <SectionHeader title={tr(lang, 'ما يتذكره', 'What it remembers')} description={tr(lang, 'نطاق الذاكرة المسموح له بقراءتها.', 'The memory scopes it may read.')} />
              <div className="agent-chips">{node.memories.map(memory => <span key={memory}>{memory}</span>)}</div>
            </Card>
          )}
        </div>
      </div>

      <ToolDialog lang={lang} agent={agent} tool={tool} onClose={() => setTool(null)} onDone={async text => { setResult(text); await reload(); }} />
      <DecideDialog lang={lang} run={deciding} agentLabel={name} onClose={() => setDeciding(null)} onDone={reload} />
      <DisableDialog lang={lang} open={disabling} name={name} onClose={() => setDisabling(false)}
        confirm={reason => change('enable', { enabled: false, disabled_reason: reason || null }).then(() => setDisabling(false))} />
    </main>
  );
}

function Fact({ label, value, hint, ltrHint = false }: { label: string; value: string; hint?: string; ltrHint?: boolean }) {
  return (
    <div className="agent-fact">
      <span>{label}</span>
      <strong><bdi>{value}</bdi></strong>
      {hint && <small>{ltrHint ? <bdi dir="ltr">{hint}</bdi> : hint}</small>}
    </div>
  );
}

function ToolDialog({ lang, agent, tool, onClose, onDone }: {
  lang: Lang; agent: AgentRow; tool: AgentToolRow | null; onClose: () => void;
  onDone: (result: { tone: 'success' | 'warning' | 'danger'; text: string }) => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  React.useEffect(() => setError(''), [tool?.id]);
  if (!tool) return null;
  const fields = toolFields(tool.input_schema);
  const submit = async (form: FormData) => {
    const values: Record<string, string> = {};
    form.forEach((value, key) => { values[key] = String(value); });
    setBusy(true); setError('');
    try {
      const outcome = await runAgentTool(agent.id, tool.id, toolArguments(fields, values), agent.classification);
      await onDone(outcome.status === 'pending_approval'
        ? { tone: 'warning', text: tr(lang, 'الطلب ينتظر الموافقة قبل التنفيذ. تجده في الموافقات.', 'The request is waiting for approval under Approvals.') }
        : { tone: 'success', text: `${lang === 'ar' ? tool.name_ar : tool.name_en}: ${describeToolResult(outcome.result, lang)}` });
      onClose();
    } catch (thrown) { setError(messageForRaw(thrown, lang)); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} closeLabel={tr(lang, 'إغلاق', 'Close')} title={lang === 'ar' ? tool.name_ar : tool.name_en}
      description={`${agentName(agent, lang)} · ${levelLabel(tool.approval_level, lang)}`}>
      {error && <InlineAlert>{error}</InlineAlert>}
      {tool.approval_level >= 2 && <InlineAlert tone="warning">{tr(lang, 'هذه الأداة لن تُنفَّذ حتى يعتمدها شخص مخوّل.', 'This tool will not run until an authorised person approves it.')}</InlineAlert>}
      <FormGrid busy={busy} submit={fields.length ? tr(lang, 'تنفيذ', 'Run') : tr(lang, 'تنفيذ الآن', 'Run now')}
        cancel={{ label: tr(lang, 'إلغاء', 'Cancel'), onClick: onClose }} onSubmit={data => submit(data)}>
        {fields.length ? fields.map(field => <ToolInput key={field.key} lang={lang} field={field} />)
          : <p className="agents-muted ui-field--wide">{tr(lang, 'هذه الأداة لا تحتاج مدخلات.', 'This tool needs no input.')}</p>}
      </FormGrid>
    </Dialog>
  );
}

function ToolInput({ lang, field }: { lang: Lang; field: ToolField }) {
  const label = fieldLabel(field.key, lang);
  const common = { name: field.key, required: field.required };
  const hint = /_id$/.test(field.key) ? tr(lang, 'المعرّف الداخلي (UUID)', 'Internal ID (UUID)') : undefined;
  const direction = /_en$|^url$|_id$|phone/.test(field.key) ? 'ltr' : /_ar$/.test(field.key) ? 'rtl' : undefined;
  return (
    <Field label={label} required={field.required} hint={hint} wide={field.kind === 'textarea'}>
      {field.kind === 'textarea' ? <TextArea {...common} dir={direction} />
        : field.kind === 'number' ? <TextInput {...common} type="number" inputMode="numeric" />
          : field.kind === 'datetime' ? <TextInput {...common} type="datetime-local" />
            : field.kind === 'date' ? <TextInput {...common} type="date" />
              : field.kind === 'url' ? <TextInput {...common} type="url" dir="ltr" placeholder="https://" />
                : <TextInput {...common} dir={direction} />}
    </Field>
  );
}

function DisableDialog({ lang, open, name, onClose, confirm }: {
  lang: Lang; open: boolean; name: string; onClose: () => void; confirm: (reason: string) => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  if (!open) return null;
  return (
    <Dialog open onClose={onClose} closeLabel={tr(lang, 'إغلاق', 'Close')} title={tr(lang, `تعطيل ${name}؟`, `Disable ${name}?`)}
      description={tr(lang, 'لن يستقبل أي طلب حتى تفعّله من جديد. التشغيلات الحالية لا تُلغى.', 'It will take no requests until you enable it again. Current runs are not cancelled.')}>
      <FormGrid busy={busy} submit={tr(lang, 'تعطيل', 'Disable')} cancel={{ label: tr(lang, 'إلغاء', 'Cancel'), onClick: onClose }}
        onSubmit={async data => { setBusy(true); await confirm(String(data.get('reason') ?? '').trim()); setBusy(false); }}>
        <Field label={tr(lang, 'السبب', 'Reason')} hint={tr(lang, 'يظهر لبقية الإدارة.', 'Shown to the other administrators.')} wide>
          <TextInput name="reason" maxLength={200} />
        </Field>
      </FormGrid>
    </Dialog>
  );
}
