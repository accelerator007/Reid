import React from 'react';
import { Database, ShieldAlert, FileSpreadsheet } from 'lucide-react';
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
  type Dataset,
  sensitivities,
  tr,
} from './model';
import * as api from './api';

export function ResearchDatasets({
  lang,
  research,
  datasets,
  currentUserId,
  isSupervisor,
  busy,
  onRun,
}: {
  lang: Lang;
  research: Research;
  datasets: Dataset[];
  currentUserId: string;
  isSupervisor: boolean;
  busy: boolean;
  onRun: (fn: () => Promise<{ error?: any }>) => Promise<void>;
}) {
  return (
    <div className="research-tab-content">
      <div className="research-items-grid">
        {datasets.length === 0 ? (
          <div className="research-empty-state">
            <Database size={32} />
            <p>{tr(lang, 'لا توجد مجموعات بيانات مسجلة لهذا البحث بعد.', 'No datasets registered for this research yet.')}</p>
          </div>
        ) : (
          datasets.map(d => {
            const sensOpt = sensitivities[d.sensitivity] || sensitivities.internal;
            return (
              <Card key={d.id} className="research-item-card">
                <div className="research-item-card__header">
                  <div>
                    <strong className="research-item-card__title">{d.name}</strong>
                    <div className="research-item-card__tags">
                      {d.source && <span className="research-chip">{d.source}</span>}
                      {d.license && <span className="research-chip">{d.license}</span>}
                      {d.record_count != null && (
                        <span className="research-chip">
                          {d.record_count} {tr(lang, 'سجل', 'records')}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge tone={sensOpt.tone}>{sensOpt.label[lang]}</Badge>
                </div>

                {d.description && <p className="research-item-card__desc">{d.description}</p>}
              </Card>
            );
          })
        )}
      </div>

      {isSupervisor && (
        <Card className="research-create-card">
          <div className="research-create-card__header">
            <FileSpreadsheet size={18} />
            <h3>{tr(lang, 'تسجيل مجموعة بيانات جديدة', 'Register New Dataset')}</h3>
          </div>

          <FormGrid
            submit={tr(lang, 'حفظ مجموعة البيانات', 'Save Dataset')}
            busy={busy}
            onSubmit={async (data, form) => {
              const name = data.get('name') as string;
              if (!name) return;
              await onRun(() =>
                api.createDataset(
                  research.id,
                  {
                    name,
                    description: (data.get('description') as string) || null,
                    source: (data.get('source') as string) || null,
                    license: (data.get('license') as string) || null,
                    record_count: data.get('record_count') ? Number(data.get('record_count')) : null,
                    sensitivity: data.get('sensitivity') as string,
                  },
                  currentUserId,
                ),
              );
              form.reset();
            }}
          >
            <Field label={tr(lang, 'اسم مجموعة البيانات', 'Dataset Name')} required>
              <TextInput name="name" required placeholder={tr(lang, 'مثال: مدونة اللهجة العُمانية…', 'e.g. Omani Dialect Corpus')} />
            </Field>
            <Field label={tr(lang, 'مستوى الحساسية والمشاركة', 'Sensitivity')} required>
              <Select name="sensitivity" defaultValue="internal">
                {Object.entries(sensitivities).map(([key, opt]) => (
                  <option key={key} value={key}>
                    {opt.label[lang]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tr(lang, 'المصدر أو جهة الجمع', 'Source')}>
              <TextInput name="source" placeholder={tr(lang, 'مثال: جمع ميداني، أرشيف…', 'e.g. Field collection, Open Data…')} />
            </Field>
            <Field label={tr(lang, 'الرخصة القانونية', 'License')}>
              <TextInput name="license" placeholder="CC-BY-4.0 / Proprietary" />
            </Field>
            <Field label={tr(lang, 'عدد السجلات أو العينات', 'Record Count')}>
              <TextInput name="record_count" type="number" min="0" placeholder="10000" />
            </Field>
            <Field label={tr(lang, 'الوصف والخصائص الفنية', 'Description')} wide>
              <TextArea name="description" placeholder={tr(lang, 'وصف محتوى البيانات وتنسيقها وأبعادها…', 'Dataset format, attributes and notes…')} />
            </Field>
          </FormGrid>
        </Card>
      )}
    </div>
  );
}
