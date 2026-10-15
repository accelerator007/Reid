import React from 'react';
import { FlaskConical, Play, CheckCircle2, XCircle } from 'lucide-react';
import {
  Badge,
  Card,
  Field,
  FormGrid,
  Select,
  TextArea,
  TextInput,
} from '../ui';
import {
  type Lang,
  type Research,
  type Person,
  type Dataset,
  type Experiment,
  experimentStatuses,
  tr,
} from './model';
import * as api from './api';

export function ResearchExperiments({
  lang,
  research,
  experiments,
  datasets,
  people,
  currentUserId,
  isSupervisor,
  isMember,
  busy,
  onRun,
}: {
  lang: Lang;
  research: Research;
  experiments: Experiment[];
  datasets: Dataset[];
  people: Person[];
  currentUserId: string;
  isSupervisor: boolean;
  isMember: boolean;
  busy: boolean;
  onRun: (fn: () => Promise<{ error?: any }>) => Promise<void>;
}) {
  const personName = (id: string | null) => people.find(p => p.id === id)?.full_name || '—';
  const datasetName = (id: string | null) => datasets.find(d => d.id === id)?.name || null;

  return (
    <div className="research-tab-content">
      <div className="research-items-grid">
        {experiments.length === 0 ? (
          <div className="research-empty-state">
            <FlaskConical size={32} />
            <p>{tr(lang, 'لا توجد تجارب بحثية مسجلة بعد.', 'No experiments recorded yet.')}</p>
          </div>
        ) : (
          experiments.map(ex => {
            const statusOpt = experimentStatuses[ex.status] || experimentStatuses.planned;
            const canChangeStatus = isSupervisor || ex.created_by === currentUserId;
            const ds = datasetName(ex.dataset_id);

            return (
              <Card key={ex.id} className="research-item-card">
                <div className="research-item-card__header">
                  <div>
                    <strong className="research-item-card__title">{ex.title}</strong>
                    <div className="research-item-card__tags">
                      {ds && (
                        <span className="research-chip">
                          {tr(lang, 'بيانات: ', 'Dataset: ')}
                          {ds}
                        </span>
                      )}
                      <span className="research-chip">
                        {personName(ex.created_by)}
                      </span>
                    </div>
                  </div>

                  {canChangeStatus ? (
                    <Select
                      value={ex.status}
                      disabled={busy}
                      aria-label={tr(lang, 'تغيير حالة التجربة', 'Change experiment status')}
                      onChange={e =>
                        onRun(() =>
                          api.updateExperimentStatus(ex.id, e.target.value, {
                            started_at: ex.started_at,
                            ended_at: ex.ended_at,
                          }),
                        )
                      }
                    >
                      {Object.entries(experimentStatuses).map(([key, opt]) => (
                        <option key={key} value={key}>
                          {opt.label[lang]}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Badge tone={statusOpt.tone}>{statusOpt.label[lang]}</Badge>
                  )}
                </div>

                {ex.hypothesis && (
                  <div className="research-experiment-block">
                    <small>{tr(lang, 'الفرضية:', 'Hypothesis:')}</small>
                    <p>{ex.hypothesis}</p>
                  </div>
                )}

                {ex.method && (
                  <div className="research-experiment-block">
                    <small>{tr(lang, 'المنهجية:', 'Method:')}</small>
                    <p>{ex.method}</p>
                  </div>
                )}

                {ex.result_summary && (
                  <div className="research-experiment-block research-experiment-block--result">
                    <small>{tr(lang, 'خلاصة النتائج:', 'Results Summary:')}</small>
                    <p>{ex.result_summary}</p>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* New Experiment Form (Any Member) */}
      {isMember && (
        <Card className="research-create-card">
          <div className="research-create-card__header">
            <FlaskConical size={18} />
            <h3>{tr(lang, 'إطلاق وتسجيل تجربة جديدة', 'Launch New Experiment')}</h3>
          </div>

          <FormGrid
            submit={tr(lang, 'تسجيل التجربة', 'Register Experiment')}
            busy={busy}
            onSubmit={async (data, form) => {
              const title = data.get('title') as string;
              if (!title) return;
              await onRun(() =>
                api.createExperiment(
                  research.id,
                  {
                    title,
                    dataset_id: (data.get('dataset_id') as string) || null,
                    hypothesis: (data.get('hypothesis') as string) || null,
                    method: (data.get('method') as string) || null,
                  },
                  currentUserId,
                ),
              );
              form.reset();
            }}
          >
            <Field label={tr(lang, 'عنوان التجربة', 'Experiment Title')} required wide>
              <TextInput name="title" required placeholder={tr(lang, 'مثال: تقييم نموذج Gemma 4 على معالجة اللهجة…', 'e.g. Evaluating Gemma 4 on dialectal NLP')} />
            </Field>
            <Field label={tr(lang, 'مجموعة البيانات المستخدمة', 'Associated Dataset')}>
              <Select name="dataset_id" defaultValue="">
                <option value="">{tr(lang, '— بدون ربط ببيانات —', '— None —')}</option>
                {datasets.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tr(lang, 'الفرضية العلمية', 'Hypothesis')} wide>
              <TextArea name="hypothesis" placeholder={tr(lang, 'ما هي الفرضية المراد اختبارها وإثباتها أو نفيها؟', 'What hypothesis is being tested?')} />
            </Field>
            <Field label={tr(lang, 'المنهجية وأدوات الاختبار', 'Methodology')} wide>
              <TextArea name="method" placeholder={tr(lang, 'المعايير المتبعة، أوزان التقييم، أدوات القياس…', 'Metrics, parameters, tooling…')} />
            </Field>
          </FormGrid>
        </Card>
      )}
    </div>
  );
}
