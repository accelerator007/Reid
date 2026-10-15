import React from 'react';
import type { User } from '@supabase/supabase-js';
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Search,
  ExternalLink,
  BookOpen,
  Calendar,
  User as UserIcon,
  Archive,
} from 'lucide-react';
import { supabase } from '../supabase';
import { useSession } from '../shell';
import { messageFor } from '../db';
import {
  Badge,
  Button,
  Card,
  Field,
  FormGrid,
  InlineAlert,
  Select,
  TextArea,
  TextInput,
  Checkbox,
} from '../ui';
import {
  type Lang,
  type Tab,
  type Research,
  type Person,
  type ResearchDetail,
  researchStatuses,
  tabs,
  canManageResearch,
  tr,
} from './model';
import * as api from './api';
import { ResearchOverview } from './research-overview';
import { ResearchTasks } from './research-tasks';
import { ResearchDatasets } from './research-datasets';
import { ResearchExperiments } from './research-experiments';
import { ResearchEthics } from './research-ethics';
import { ResearchPublications } from './research-publications';
import { ResearchDocuments } from './research-documents';
import { ResearchActivity } from './research-activity';
import './research.css';

const emptyDetail: ResearchDetail = {
  members: [],
  tasks: [],
  datasets: [],
  experiments: [],
  ethics: [],
  publications: [],
  documents: [],
  permissions: [],
  activity: [],
};

export function ResearchWorkspace({ lang, user }: { lang: Lang; user: User }) {
  const { roles } = useSession();
  const [researchList, setResearchList] = React.useState<Research[]>([]);
  const [people, setPeople] = React.useState<Person[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(
    () => location.pathname.split('/')[2] || null,
  );
  const [currentTab, setCurrentTab] = React.useState<Tab>('overview');
  const [showArchived, setShowArchived] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [showCreateModal, setShowCreateModal] = React.useState(false);

  const [detail, setDetail] = React.useState<ResearchDetail>(emptyDetail);
  const [message, setMessage] = React.useState<{ text: string; tone: 'success' | 'danger' | 'info' } | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Sync selectedId with popstate history navigation
  React.useEffect(() => {
    const handlePopState = () => {
      const idFromPath = location.pathname.split('/')[2] || null;
      setSelectedId(idFromPath);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const loadList = React.useCallback(async () => {
    const res = await api.loadResearchList();
    setPeople(res.people);
    setResearchList(res.research);
    if (res.error) {
      setMessage({ text: messageFor(res.error, lang), tone: 'danger' });
    }
  }, [lang]);

  const loadDetail = React.useCallback(async (id: string) => {
    const res = await api.loadResearchDetail(id);
    setDetail(res.detail);
    if (res.error) {
      setMessage({ text: messageFor(res.error, lang), tone: 'danger' });
    }
  }, [lang]);

  React.useEffect(() => {
    void loadList();
  }, [loadList]);

  React.useEffect(() => {
    if (selectedId) {
      void loadDetail(selectedId);
    } else {
      setDetail(emptyDetail);
    }
  }, [selectedId, loadDetail]);

  // Real-time subscription to postgres changes for the selected research
  React.useEffect(() => {
    if (!supabase || !selectedId) return;
    const channel = supabase
      .channel(`research:${selectedId}`)
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        void loadList();
        void loadDetail(selectedId);
      })
      .subscribe();

    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [selectedId, loadList, loadDetail]);

  const runAction = async (fn: () => Promise<{ error?: any }>) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fn();
      if (res.error) {
        const errorText =
          typeof res.error === 'string'
            ? res.error
            : res.error.message
            ? (typeof res.error.message === 'string' ? res.error.message : res.error.message[lang])
            : messageFor(res.error, lang);
        setMessage({ text: errorText, tone: 'danger' });
      } else {
        setMessage({ text: tr(lang, 'تم الحفظ وتحديث البيانات بنجاح.', 'Changes saved successfully.'), tone: 'success' });
        await loadList();
        if (selectedId) {
          await loadDetail(selectedId);
        }
      }
    } catch (err: any) {
      setMessage({ text: err?.message || 'Error occurred', tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const openResearch = (id: string) => {
    history.pushState({}, '', `/research/${id}`);
    setSelectedId(id);
    setCurrentTab('overview');
    setMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const backToList = () => {
    history.pushState({}, '', '/research');
    setSelectedId(null);
    setMessage(null);
  };

  const currentItem = researchList.find(r => r.id === selectedId);
  const { isAdmin, isSupervisor, isMember } = canManageResearch(
    user.id,
    currentItem,
    detail.members,
    roles,
  );

  const personName = (id: string | null) => people.find(p => p.id === id)?.full_name || '—';

  // Filter list
  const filteredList = researchList.filter(r => {
    const matchesArchived = showArchived ? !!r.archived_at : !r.archived_at;
    if (!matchesArchived) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.title.toLowerCase().includes(q) ||
      (r.field && r.field.toLowerCase().includes(q)) ||
      (r.abstract && r.abstract.toLowerCase().includes(q))
    );
  });

  return (
    <main className="research-workspace-root">
      {/* Alert Banner */}
      {message && (
        <div style={{ marginBottom: '20px' }}>
          <InlineAlert tone={message.tone}>{message.text}</InlineAlert>
        </div>
      )}

      {!currentItem ? (
        /* LIST VIEW */
        <section className="research-list-view">
          <div className="research-header">
            <div className="research-header__titles">
              <span>{tr(lang, 'ريّد للأبحاث والتطوير', 'Reid Research & Innovation')}</span>
              <h1>{tr(lang, 'المشاريع والأبحاث العلمية', 'Research Workspace')}</h1>
            </div>

            <div className="research-header__actions">
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={e => setShowArchived(e.target.checked)}
                />
                <span>{tr(lang, 'عرض المؤرشفة', 'Show archived')}</span>
              </label>

              {isAdmin && (
                <Button
                  variant="primary"
                  icon={<Plus size={16} />}
                  onClick={() => setShowCreateModal(!showCreateModal)}
                >
                  {tr(lang, 'بحث جديد', 'New Research')}
                </Button>
              )}
            </div>
          </div>

          {/* Search bar */}
          <div style={{ maxWidth: '420px', marginBottom: '20px' }}>
            <TextInput
              placeholder={tr(lang, 'بحث في عناوين ومجالات الأبحاث…', 'Search research titles and fields…')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Create new research section (Admin only) */}
          {isAdmin && showCreateModal && (
            <Card className="research-create-card" style={{ marginBottom: '28px' }}>
              <div className="research-create-card__header">
                <BookOpen size={20} />
                <h3>{tr(lang, 'إطلاق وتسجيل بحث علمي جديد', 'Register New Research Project')}</h3>
              </div>

              <FormGrid
                submit={tr(lang, 'إنشاء البحث', 'Create Research')}
                busy={busy}
                cancel={{
                  label: tr(lang, 'إلغاء', 'Cancel'),
                  onClick: () => setShowCreateModal(false),
                }}
                onSubmit={async (data, form) => {
                  const title = data.get('title') as string;
                  const abstract = data.get('abstract') as string;
                  const supervisorId = data.get('supervisor_id') as string;
                  if (!title || !abstract || !supervisorId) return;

                  setBusy(true);
                  const res = await api.createResearch(
                    {
                      title,
                      abstract,
                      field: (data.get('field') as string) || null,
                      supervisor_id: supervisorId,
                      is_public: data.get('is_public') === 'on',
                      funding_source: (data.get('funding_source') as string) || null,
                      start_date: (data.get('start_date') as string) || null,
                      target_date: (data.get('target_date') as string) || null,
                    },
                    user.id,
                  );
                  setBusy(false);

                  if (res.error) {
                    setMessage({ text: res.error.message[lang], tone: 'danger' });
                  } else if (res.id) {
                    setMessage({ text: tr(lang, 'تم إنشاء البحث بنجاح.', 'Research created.'), tone: 'success' });
                    form.reset();
                    setShowCreateModal(false);
                    await loadList();
                    openResearch(res.id);
                  }
                }}
              >
                <Field label={tr(lang, 'عنوان البحث', 'Research Title')} required wide>
                  <TextInput name="title" required placeholder={tr(lang, 'عنوان دقيق للمشروع البحثي…', 'Title of the research project…')} />
                </Field>
                <Field label={tr(lang, 'المجال التخصصي', 'Field')}>
                  <TextInput name="field" placeholder={tr(lang, 'مثال: معالجة اللغات الطبيعية، الروبوتات…', 'e.g. NLP, Robotics, Computer Vision')} />
                </Field>
                <Field label={tr(lang, 'المشرف الرئيسي على البحث', 'Principal Supervisor')} required>
                  <Select name="supervisor_id" required defaultValue="">
                    <option value="" disabled>{tr(lang, 'اختر المشرف…', 'Select supervisor…')}</option>
                    {people.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={tr(lang, 'الملخص التنفيذي', 'Abstract')} wide required>
                  <TextArea name="abstract" required rows={4} placeholder={tr(lang, 'ملخص أهداف البحث ومخرجاته المتوقعة…', 'Executive summary of goals and deliverables…')} />
                </Field>
                <Field label={tr(lang, 'الجهة الداعمة / التمويل', 'Funding Source')}>
                  <TextInput name="funding_source" placeholder={tr(lang, 'جهة المنحة أو الشريك الاستراتيجي…', 'Granting entity or partner…')} />
                </Field>
                <Field label={tr(lang, 'تاريخ البداية', 'Start Date')}>
                  <TextInput name="start_date" type="date" />
                </Field>
                <Field label={tr(lang, 'الموعد المستهدف للنشر / التسليم', 'Target Date')}>
                  <TextInput name="target_date" type="date" />
                </Field>
                <div style={{ gridColumn: 'span 2' }}>
                  <Checkbox
                    name="is_public"
                    label={tr(lang, 'بحث عام — يظهر لكل موظفي الشركة', 'Public — visible to every employee')}
                  />
                </div>
              </FormGrid>
            </Card>
          )}

          {/* Cards Grid */}
          {filteredList.length === 0 ? (
            <div className="research-empty-state">
              <BookOpen size={40} />
              <p>{tr(lang, 'لا توجد أبحاث متاحة تطابق معايير العرض.', 'No research projects found.')}</p>
            </div>
          ) : (
            <div className="research-cards-grid">
              {filteredList.map(r => {
                const statusOpt = researchStatuses[r.status] || researchStatuses.proposal;
                const initialLetter = (r.field || r.title).slice(0, 1).toUpperCase();

                return (
                  <article
                    key={r.id}
                    className="research-card"
                    onClick={() => openResearch(r.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openResearch(r.id);
                      }
                    }}
                  >
                    <div className="research-card__top">
                      <div className="research-card__icon">{initialLetter}</div>
                      <Badge tone={statusOpt.tone}>{statusOpt.label[lang]}</Badge>
                    </div>

                    <h2 className="research-card__title">{r.title}</h2>
                    <p className="research-card__abstract">{r.abstract || '—'}</p>

                    <div className="research-card__footer">
                      <span className="research-meta-item">
                        <UserIcon size={13} />
                        {personName(r.supervisor_id)}
                      </span>
                      {r.target_date && (
                        <span className="research-meta-item">
                          <Calendar size={13} />
                          {r.target_date}
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        /* DETAIL VIEW */
        <section className="research-detail-view">
          {/* Back button */}
          <div style={{ marginBottom: '16px' }}>
            <Button
              variant="secondary"
              size="sm"
              icon={lang === 'ar' ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
              onClick={backToList}
            >
              {tr(lang, 'العودة لقائمة الأبحاث', 'Back to Research')}
            </Button>
          </div>

          {/* Hero Card */}
          <Card className="research-hero-card">
            <div className="research-hero-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span className="research-chip">{currentItem.field || tr(lang, 'بحث عام', 'General Research')}</span>
                <Badge tone={researchStatuses[currentItem.status]?.tone || 'neutral'}>
                  {researchStatuses[currentItem.status]?.label[lang] || currentItem.status}
                </Badge>
                {currentItem.is_public && (
                  <Badge tone="brand">{tr(lang, 'متاح لجميع الموظفين', 'Public to employees')}</Badge>
                )}
                {currentItem.archived_at && (
                  <Badge tone="danger">
                    <Archive size={12} style={{ marginInlineEnd: '4px' }} />
                    {tr(lang, 'مؤرشف', 'Archived')}
                  </Badge>
                )}
              </div>

              {currentItem.doi && (
                <a
                  href={`https://doi.org/${currentItem.doi}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="research-ext-link"
                >
                  <span>DOI: {currentItem.doi}</span>
                  <ExternalLink size={14} />
                </a>
              )}
            </div>

            <h1 className="research-hero-title">{currentItem.title}</h1>
            {currentItem.abstract && <p className="research-hero-desc">{currentItem.abstract}</p>}

            <div className="research-hero-meta">
              <span className="research-meta-item">
                <UserIcon size={14} />
                <strong>{tr(lang, 'المشرف: ', 'Supervisor: ')}</strong>
                {personName(currentItem.supervisor_id)}
              </span>
              {currentItem.target_date && (
                <span className="research-meta-item">
                  <Calendar size={14} />
                  <strong>{tr(lang, 'الموعد المستهدف: ', 'Target Date: ')}</strong>
                  {currentItem.target_date}
                </span>
              )}
              {currentItem.funding_source && (
                <span className="research-meta-item">
                  <strong>{tr(lang, 'الجهة الداعمة: ', 'Supported by: ')}</strong>
                  {currentItem.funding_source}
                </span>
              )}
            </div>
          </Card>

          {/* Navigation Tabs */}
          <nav className="research-nav-tabs" aria-label={tr(lang, 'تبويبات البحث', 'Research tabs')}>
            {tabs.map(t => (
              <button
                key={t.id}
                type="button"
                className={`research-nav-tab ${currentTab === t.id ? 'active' : ''}`}
                onClick={() => {
                  setCurrentTab(t.id);
                  setMessage(null);
                }}
              >
                {t.label[lang]}
              </button>
            ))}
          </nav>

          {/* Tab Panes */}
          {currentTab === 'overview' && (
            <ResearchOverview
              lang={lang}
              research={currentItem}
              people={people}
              members={detail.members}
              experiments={detail.experiments}
              ethics={detail.ethics}
              publications={detail.publications}
              isSupervisor={isSupervisor}
              busy={busy}
              onRun={runAction}
            />
          )}

          {currentTab === 'tasks' && (
            <ResearchTasks
              lang={lang}
              research={currentItem}
              tasks={detail.tasks}
              people={people}
              members={detail.members}
              currentUserId={user.id}
              isSupervisor={isSupervisor}
              busy={busy}
              onRun={runAction}
            />
          )}

          {currentTab === 'datasets' && (
            <ResearchDatasets
              lang={lang}
              research={currentItem}
              datasets={detail.datasets}
              currentUserId={user.id}
              isSupervisor={isSupervisor}
              busy={busy}
              onRun={runAction}
            />
          )}

          {currentTab === 'experiments' && (
            <ResearchExperiments
              lang={lang}
              research={currentItem}
              experiments={detail.experiments}
              datasets={detail.datasets}
              people={people}
              currentUserId={user.id}
              isSupervisor={isSupervisor}
              isMember={isMember}
              busy={busy}
              onRun={runAction}
            />
          )}

          {currentTab === 'ethics' && (
            <ResearchEthics
              lang={lang}
              research={currentItem}
              ethics={detail.ethics}
              people={people}
              currentUserId={user.id}
              isSupervisor={isSupervisor}
              busy={busy}
              onRun={runAction}
            />
          )}

          {currentTab === 'publications' && (
            <ResearchPublications
              lang={lang}
              research={currentItem}
              publications={detail.publications}
              currentUserId={user.id}
              isSupervisor={isSupervisor}
              busy={busy}
              onRun={runAction}
            />
          )}

          {currentTab === 'documents' && (
            <ResearchDocuments
              lang={lang}
              research={currentItem}
              documents={detail.documents}
              permissions={detail.permissions}
              people={people}
              members={detail.members}
              currentUserId={user.id}
              isSupervisor={isSupervisor}
              busy={busy}
              onRun={runAction}
              setMessage={msg => setMessage({ text: msg, tone: 'danger' })}
            />
          )}

          {currentTab === 'activity' && (
            <ResearchActivity
              lang={lang}
              activity={detail.activity}
              people={people}
            />
          )}
        </section>
      )}
    </main>
  );
}
