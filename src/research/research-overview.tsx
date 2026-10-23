import React from 'react';
import { Users, FlaskConical, ShieldCheck, BookOpen, Trash2, Archive, ArchiveRestore } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Field,
  FormGrid,
  Select,
  StatCard,
  TextArea,
  TextInput,
  Checkbox,
} from '../ui';
import {
  type Lang,
  type Research,
  type Person,
  type Member,
  type Experiment,
  type Ethics,
  type Publication,
  researchStatuses,
  memberRoles,
  tr,
} from './model';
import * as api from './api';

export function ResearchOverview({
  lang,
  research,
  people,
  members,
  experiments,
  ethics,
  publications,
  isSupervisor,
  busy,
  onRun,
}: {
  lang: Lang;
  research: Research;
  people: Person[];
  members: Member[];
  experiments: Experiment[];
  ethics: Ethics[];
  publications: Publication[];
  isSupervisor: boolean;
  busy: boolean;
  onRun: (fn: () => Promise<{ error?: any }>) => Promise<void>;
}) {
  const personName = (id: string | null) => people.find(p => p.id === id)?.full_name || '—';
  const approvedEthics = ethics.filter(e => e.status === 'approved').length;
  const completedExperiments = experiments.filter(e => e.status === 'completed').length;
  const publishedCount = publications.filter(e => e.status === 'published').length;

  return (
    <div className="research-overview-layout">
      {/* Key Metrics */}
      <div className="research-metrics-grid">
        <StatCard
          label={tr(lang, 'الباحثون والفرق', 'Researchers')}
          value={members.length}
          icon={<Users size={18} />}
          tone="brand"
        />
        <StatCard
          label={tr(lang, 'التجارب المكتملة', 'Completed Experiments')}
          value={`${completedExperiments} / ${experiments.length}`}
          icon={<FlaskConical size={18} />}
          tone="info"
        />
        <StatCard
          label={tr(lang, 'الموافقات الأخلاقية', 'Ethics Approved')}
          value={`${approvedEthics} / ${ethics.length}`}
          icon={<ShieldCheck size={18} />}
          tone="success"
        />
        <StatCard
          label={tr(lang, 'المنشورات العلمية', 'Publications')}
          value={`${publishedCount} / ${publications.length}`}
          icon={<BookOpen size={18} />}
          tone="brand"
        />
      </div>

      <div className="research-panels-split">
        {/* Team Panel */}
        <Card className="research-panel">
          <div className="research-panel__header">
            <h3>{tr(lang, 'فريق البحث والباحثون', 'Research Team')}</h3>
            <Badge tone="brand">{members.length} {tr(lang, 'أعضاء', 'members')}</Badge>
          </div>

          <div className="research-team-list">
            {members.map(m => (
              <div key={m.user_id} className="research-team-item">
                <div className="research-team-item__info">
                  <strong>{personName(m.user_id)}</strong>
                  <Badge tone={m.member_role === 'supervisor' ? 'brand' : 'neutral'}>
                    {memberRoles[m.member_role]?.[lang] || m.member_role}
                  </Badge>
                </div>
                {isSupervisor && m.user_id !== research.supervisor_id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 size={14} />}
                    disabled={busy}
                    onClick={() => onRun(() => api.removeResearchMember(research.id, m.user_id))}
                    aria-label={tr(lang, 'إزالة باحث', 'Remove member')}
                  />
                )}
              </div>
            ))}
          </div>

          {isSupervisor && (
            <div className="research-add-member">
              <h4>{tr(lang, 'إضافة باحث جديد', 'Add Team Member')}</h4>
              <FormGrid
                submit={tr(lang, 'إضافة الباحث', 'Add Member')}
                busy={busy}
                onSubmit={async (data, form) => {
                  const userId = data.get('user_id') as string;
                  const role = data.get('member_role') as string;
                  if (!userId) return;
                  await onRun(() => api.addResearchMember(research.id, userId, role));
                  form.reset();
                }}
              >
                <Field label={tr(lang, 'الباحث', 'Researcher')} required>
                  <Select name="user_id" required defaultValue="">
                    <option value="" disabled>
                      {tr(lang, 'اختر من قائمة الفريق…', 'Select a researcher…')}
                    </option>
                    {people
                      .filter(p => !members.some(m => m.user_id === p.id))
                      .map(p => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label={tr(lang, 'الدور البحثي', 'Research Role')} required>
                  <Select name="member_role" defaultValue="researcher">
                    {Object.entries(memberRoles).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label[lang]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FormGrid>
            </div>
          )}
        </Card>

        {/* Settings & Archive Panel (Supervisor Only) */}
        {isSupervisor && (
          <Card className="research-panel">
            <div className="research-panel__header">
              <h3>{tr(lang, 'إعدادات وحالة البحث', 'Research Settings')}</h3>
              <Badge tone={researchStatuses[research.status]?.tone || 'neutral'}>
                {researchStatuses[research.status]?.label[lang] || research.status}
              </Badge>
            </div>

            <FormGrid
              submit={tr(lang, 'حفظ التغييرات', 'Save Changes')}
              busy={busy}
              onSubmit={async data => {
                await onRun(() =>
                  api.updateResearchSettings(research.id, {
                    title: data.get('title') as string,
                    abstract: data.get('abstract') as string,
                    field: (data.get('field') as string) || null,
                    status: data.get('status') as string,
                    conference: (data.get('conference') as string) || null,
                    target_date: (data.get('target_date') as string) || null,
                    is_public: data.get('is_public') === 'on',
                  }),
                );
              }}
            >
              <Field label={tr(lang, 'عنوان البحث', 'Title')} required wide>
                <TextInput name="title" defaultValue={research.title} required />
              </Field>
              <Field label={tr(lang, 'المجال التخصصي', 'Field')}>
                <TextInput name="field" defaultValue={research.field || ''} />
              </Field>
              <Field label={tr(lang, 'الحالة الحالية', 'Current Status')} required>
                <Select name="status" defaultValue={research.status}>
                  {Object.entries(researchStatuses).map(([key, opt]) => (
                    <option key={key} value={key}>
                      {opt.label[lang]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={tr(lang, 'الملخص التنفيذي', 'Abstract')} wide required>
                <TextArea name="abstract" defaultValue={research.abstract || ''} required />
              </Field>
              <Field label={tr(lang, 'المؤتمر المستهدف', 'Conference')}>
                <TextInput name="conference" defaultValue={research.conference || ''} />
              </Field>
              <Field label={tr(lang, 'الموعد النهائي المستهدف', 'Target Date')}>
                <TextInput name="target_date" type="date" defaultValue={research.target_date || ''} />
              </Field>
              <div style={{ gridColumn: 'span 2' }}>
                <Checkbox
                  name="is_public"
                  defaultChecked={research.is_public}
                  label={tr(lang, 'بحث عام — متاح للمشاهدة لجميع موظفي ريّد', 'Public research — visible to all employees')}
                />
              </div>
            </FormGrid>

            <div className="research-panel__footer-action">
              <Button
                variant={research.archived_at ? 'secondary' : 'danger'}
                icon={research.archived_at ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                disabled={busy}
                onClick={() => onRun(() => api.toggleArchiveResearch(research.id, !!research.archived_at))}
              >
                {research.archived_at
                  ? tr(lang, 'إلغاء أرشفة البحث', 'Unarchive Research')
                  : tr(lang, 'أرشفة هذا البحث', 'Archive Research')}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
