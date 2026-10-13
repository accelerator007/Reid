import React from 'react';
import { BookOpen, ExternalLink, Calendar, Award } from 'lucide-react';
import {
  Badge,
  Card,
  Field,
  FormGrid,
  Select,
  TextInput,
} from '../ui';
import {
  type Lang,
  type Research,
  type Publication,
  publicationStatuses,
  venueTypes,
  doiPattern,
  tr,
} from './model';
import * as api from './api';

export function ResearchPublications({
  lang,
  research,
  publications,
  currentUserId,
  isSupervisor,
  busy,
  onRun,
}: {
  lang: Lang;
  research: Research;
  publications: Publication[];
  currentUserId: string;
  isSupervisor: boolean;
  busy: boolean;
  onRun: (fn: () => Promise<{ error?: any }>) => Promise<void>;
}) {
  return (
    <div className="research-tab-content">
      <div className="research-items-grid">
        {publications.length === 0 ? (
          <div className="research-empty-state">
            <BookOpen size={32} />
            <p>{tr(lang, 'لا توجد أوراق أو منشورات علمية مسجلة بعد.', 'No research publications registered yet.')}</p>
          </div>
        ) : (
          publications.map(pu => {
            const statusOpt = publicationStatuses[pu.status] || publicationStatuses.draft;
            const venueLabel = venueTypes[pu.venue_type]?.[lang] || pu.venue_type;

            return (
              <Card key={pu.id} className="research-item-card">
                <div className="research-item-card__header">
                  <div>
                    <strong className="research-item-card__title">{pu.title}</strong>
                    <div className="research-item-card__tags">
                      <span className="research-chip">{venueLabel}</span>
                      {pu.venue_name && <span className="research-chip">{pu.venue_name}</span>}
                      {pu.authors && (
                        <span className="research-chip">
                          {tr(lang, 'المؤلفون: ', 'Authors: ')}
                          {pu.authors}
                        </span>
                      )}
                    </div>
                  </div>

                  {isSupervisor ? (
                    <Select
                      value={pu.status}
                      disabled={busy}
                      aria-label={tr(lang, 'تغيير حالة المنشور', 'Change publication status')}
                      onChange={e =>
                        onRun(() =>
                          api.updatePublicationStatus(pu.id, e.target.value, pu.published_at),
                        )
                      }
                    >
                      {Object.entries(publicationStatuses).map(([key, opt]) => (
                        <option key={key} value={key}>
                          {opt.label[lang]}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Badge tone={statusOpt.tone}>{statusOpt.label[lang]}</Badge>
                  )}
                </div>

                <div className="research-publication-footer">
                  <div className="research-publication-links">
                    {pu.doi && (
                      <a
                        href={`https://doi.org/${pu.doi}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="research-ext-link"
                      >
                        <span>DOI: {pu.doi}</span>
                        <ExternalLink size={13} />
                      </a>
                    )}
                    {pu.url && (
                      <a
                        href={pu.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="research-ext-link"
                      >
                        <span>{tr(lang, 'رابط المنشور', 'Paper URL')}</span>
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </div>

                  <div className="research-publication-dates">
                    {pu.event_date && (
                      <small>
                        <Calendar size={13} />
                        {tr(lang, 'المؤتمر: ', 'Event: ')}
                        {pu.event_date}
                      </small>
                    )}
                    {(pu.published_at || pu.submitted_at) && (
                      <small>
                        {pu.published_at
                          ? `${tr(lang, 'نُشر بتاريخ: ', 'Published: ')}${pu.published_at}`
                          : `${tr(lang, 'قُدم بتاريخ: ', 'Submitted: ')}${pu.submitted_at?.slice(0, 10)}`}
                      </small>
                    )}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* New Publication Form (Supervisor only) */}
      {isSupervisor && (
        <Card className="research-create-card">
          <div className="research-create-card__header">
            <Award size={18} />
            <h3>{tr(lang, 'تسجيل ورقة علمية أو منشور جديد', 'Add Research Publication')}</h3>
          </div>

          <FormGrid
            submit={tr(lang, 'تسجيل المنشور', 'Save Publication')}
            busy={busy}
            onSubmit={async (data, form) => {
              const title = data.get('title') as string;
              if (!title) return;
              await onRun(() =>
                api.createPublication(
                  research.id,
                  {
                    title,
                    authors: (data.get('authors') as string) || null,
                    venue_type: data.get('venue_type') as string,
                    venue_name: (data.get('venue_name') as string) || null,
                    doi: (data.get('doi') as string) || null,
                    url: (data.get('url') as string) || null,
                    event_date: (data.get('event_date') as string) || null,
                  },
                  currentUserId,
                ),
              );
              form.reset();
            }}
          >
            <Field label={tr(lang, 'عنوان الورقة أو المنشور', 'Publication Title')} required wide>
              <TextInput name="title" required placeholder={tr(lang, 'مثال: معالجة الإشارات اللغوية باستخدام الذكاء الاصطناعي…', 'e.g. Speech Processing for Arabian Dialects')} />
            </Field>
            <Field label={tr(lang, 'المؤلفون والباحثون المشاركون', 'Authors')} wide>
              <TextInput name="authors" placeholder="Ali Alajmi, Sheikha Almamari, Reid Team" />
            </Field>
            <Field label={tr(lang, 'نوع الوعاء العلمي', 'Venue Type')} required>
              <Select name="venue_type" defaultValue="conference">
                {Object.entries(venueTypes).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label[lang]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tr(lang, 'اسم المؤتمر أو الدورية العلمية', 'Venue Name')}>
              <TextInput name="venue_name" placeholder="IEEE ICASSP 2026 / Nature Machine Intelligence" />
            </Field>
            <Field label="DOI (Digital Object Identifier)">
              <TextInput name="doi" pattern={doiPattern} placeholder="10.1109/ICASSP.2026.0001" />
            </Field>
            <Field label={tr(lang, 'رابط المنشور المباشر', 'Paper URL')}>
              <TextInput name="url" type="url" placeholder="https://arxiv.org/abs/..." />
            </Field>
            <Field label={tr(lang, 'تاريخ انعقاد المؤتمر', 'Conference Date')}>
              <TextInput name="event_date" type="date" />
            </Field>
          </FormGrid>
        </Card>
      )}
    </div>
  );
}
