import React from 'react';
import { ShieldCheck, Calendar, FileText, CheckCircle2 } from 'lucide-react';
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
  type Ethics,
  ethicsStatuses,
  tr,
} from './model';
import * as api from './api';

export function ResearchEthics({
  lang,
  research,
  ethics,
  people,
  currentUserId,
  isSupervisor,
  busy,
  onRun,
}: {
  lang: Lang;
  research: Research;
  ethics: Ethics[];
  people: Person[];
  currentUserId: string;
  isSupervisor: boolean;
  busy: boolean;
  onRun: (fn: () => Promise<{ error?: any }>) => Promise<void>;
}) {
  const personName = (id: string | null) => people.find(p => p.id === id)?.full_name || '—';

  return (
    <div className="research-tab-content">
      <div className="research-items-grid">
        {ethics.length === 0 ? (
          <div className="research-empty-state">
            <ShieldCheck size={32} />
            <p>{tr(lang, 'لا توجد طلبات موافقة أخلاقية مسجلة بعد.', 'No ethics approvals recorded yet.')}</p>
          </div>
        ) : (
          ethics.map(et => {
            const statusOpt = ethicsStatuses[et.status] || ethicsStatuses.draft;

            return (
              <Card key={et.id} className="research-item-card">
                <div className="research-item-card__header">
                  <div>
                    <strong className="research-item-card__title">{et.title}</strong>
                    <div className="research-item-card__tags">
                      <span className="research-chip">{et.authority}</span>
                      {et.reference && (
                        <span className="research-chip">
                          {tr(lang, 'مرجع: ', 'Ref: ')}
                          {et.reference}
                        </span>
                      )}
                      {et.expires_at && (
                        <span className="research-chip">
                          {tr(lang, 'ينتهي: ', 'Expires: ')}
                          {et.expires_at}
                        </span>
                      )}
                    </div>
                  </div>

                  {isSupervisor ? (
                    <Select
                      value={et.status}
                      disabled={busy}
                      aria-label={tr(lang, 'تغيير حالة الاعتماد الأخلاقي', 'Change ethics status')}
                      onChange={e =>
                        onRun(() =>
                          api.updateEthicsStatus(et.id, e.target.value, currentUserId, {
                            submitted_at: et.submitted_at,
                            decided_at: et.decided_at,
                            decided_by: et.decided_by,
                          }),
                        )
                      }
                    >
                      {Object.entries(ethicsStatuses).map(([key, opt]) => (
                        <option key={key} value={key}>
                          {opt.label[lang]}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Badge tone={statusOpt.tone}>{statusOpt.label[lang]}</Badge>
                  )}
                </div>

                {et.notes && <p className="research-item-card__desc">{et.notes}</p>}

                {et.decided_by && (
                  <div className="research-ethics-decision">
                    <CheckCircle2 size={14} />
                    <small>
                      {tr(lang, 'صادر عن:', 'Decided by:')} {personName(et.decided_by)}
                      {et.decided_at && ` · ${et.decided_at.slice(0, 10)}`}
                    </small>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* New Ethics Form (Supervisor only) */}
      {isSupervisor && (
        <Card className="research-create-card">
          <div className="research-create-card__header">
            <FileText size={18} />
            <h3>{tr(lang, 'تسجيل طلب موافقة أخلاقية أو تصريح رسمي', 'Submit Ethics Approval')}</h3>
          </div>

          <FormGrid
            submit={tr(lang, 'تسجيل الطلب', 'Save Submission')}
            busy={busy}
            onSubmit={async (data, form) => {
              const title = data.get('title') as string;
              const authority = data.get('authority') as string;
              if (!title || !authority) return;
              await onRun(() =>
                api.createEthics(
                  research.id,
                  {
                    title,
                    authority,
                    reference: (data.get('reference') as string) || null,
                    expires_at: (data.get('expires_at') as string) || null,
                    notes: (data.get('notes') as string) || null,
                  },
                  currentUserId,
                ),
              );
              form.reset();
            }}
          >
            <Field label={tr(lang, 'عنوان الطلب أو الترخيص', 'Submission Title')} required wide>
              <TextInput name="title" required placeholder={tr(lang, 'مثال: ترخيص جمع بيانات الصوت البشري…', 'e.g. Human Voice Recording Ethics Protocol')} />
            </Field>
            <Field label={tr(lang, 'الجهة المصدرة للترخيص', 'Issuing Authority')} required>
              <TextInput name="authority" required placeholder={tr(lang, 'مثال: لجنة الأخلاقيات الحيوية…', 'e.g. National Bioethics Committee')} />
            </Field>
            <Field label={tr(lang, 'الرقم المرجعي أو الكود', 'Reference No.')}>
              <TextInput name="reference" placeholder="IRB-2026-OM-0042" />
            </Field>
            <Field label={tr(lang, 'تاريخ انتهاء الصلاحية', 'Expiration Date')}>
              <TextInput name="expires_at" type="date" />
            </Field>
            <Field label={tr(lang, 'الملاحظات والاشتراطات', 'Notes and Conditions')} wide>
              <TextArea name="notes" placeholder={tr(lang, 'أي شروط خاصة لحماية البيانات وخصوصية المشاركين…', 'Data handling restrictions, participant consent requirements…')} />
            </Field>
          </FormGrid>
        </Card>
      )}
    </div>
  );
}
