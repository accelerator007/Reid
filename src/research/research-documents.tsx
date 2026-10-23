import React from 'react';
import { FileText, ShieldAlert, Download, Lock, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Field,
  FormGrid,
  Select,
  TextInput,
  Checkbox,
} from '../ui';
import {
  type Lang,
  type Research,
  type Person,
  type Member,
  type DocumentRow,
  type DocumentPermission,
  appRoles,
  tr,
} from './model';
import * as api from './api';

export function ResearchDocuments({
  lang,
  research,
  documents,
  permissions,
  people,
  members,
  currentUserId,
  isSupervisor,
  busy,
  onRun,
  setMessage,
}: {
  lang: Lang;
  research: Research;
  documents: DocumentRow[];
  permissions: DocumentPermission[];
  people: Person[];
  members: Member[];
  currentUserId: string;
  isSupervisor: boolean;
  busy: boolean;
  onRun: (fn: () => Promise<{ error?: any }>) => Promise<void>;
  setMessage: (msg: string) => void;
}) {
  const personName = (id: string | null) => people.find(p => p.id === id)?.full_name || '—';

  return (
    <div className="research-tab-content">
      <div className="research-items-grid">
        {documents.length === 0 ? (
          <div className="research-empty-state">
            <FileText size={32} />
            <p>{tr(lang, 'لا توجد وثائق أو ملفات مرفوعة لهذا البحث بعد.', 'No documents or files uploaded yet.')}</p>
          </div>
        ) : (
          documents.map(doc => {
            const docPerms = permissions.filter(p => p.document_id === doc.id);

            return (
              <Card key={doc.id} className="research-item-card">
                <div className="research-item-card__header">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong className="research-item-card__title">{doc.title}</strong>
                      {doc.restricted && (
                        <Badge tone="danger">
                          <Lock size={11} style={{ marginInlineEnd: '4px' }} />
                          {tr(lang, 'مقيدة الصلاحية', 'Restricted')}
                        </Badge>
                      )}
                    </div>
                    <div className="research-item-card__tags">
                      <span className="research-chip">{doc.category}</span>
                      <span className="research-chip">
                        {tr(lang, 'رُفع بواسطة: ', 'Uploaded by: ')}
                        {personName(doc.uploaded_by)}
                      </span>
                      <span className="research-chip">{doc.created_at.slice(0, 10)}</span>
                    </div>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Download size={14} />}
                    onClick={async () => {
                      const res = await api.getDocumentSignedUrl(doc.storage_path);
                      if (res.error) {
                        setMessage(res.error.message[lang]);
                      } else if (res.signedUrl) {
                        window.open(res.signedUrl, '_blank', 'noopener,noreferrer');
                      }
                    }}
                  >
                    {tr(lang, 'فتح آمن', 'Secure Open')}
                  </Button>
                </div>

                {/* Restricted Permissions Management */}
                {doc.restricted && (
                  <div className="research-doc-permissions">
                    <div className="research-doc-permissions__title">
                      <Lock size={13} />
                      <small>{tr(lang, 'المصرح لهم بالوصول لهذه الوثيقة:', 'Authorized entities:')}</small>
                    </div>

                    <div className="research-doc-permissions__list">
                      {docPerms.length === 0 ? (
                        <small className="text-muted">{tr(lang, 'المشرف وإدارة النظام فقط.', 'Supervisor and admins only.')}</small>
                      ) : (
                        docPerms.map(p => (
                          <span key={p.id} className="research-perm-tag">
                            <span>
                              {p.user_id ? personName(p.user_id) : `Role: ${p.role}`} · {p.can_write ? 'read/write' : 'read'}
                            </span>
                            {isSupervisor && (
                              <button
                                type="button"
                                aria-label={tr(lang, 'إزالة الصلاحية', 'Remove permission')}
                                onClick={() => onRun(() => api.removeDocumentPermission(p.id))}
                              >
                                ×
                              </button>
                            )}
                          </span>
                        ))
                      )}
                    </div>

                    {isSupervisor && (
                      <div className="research-grant-select">
                        <Select
                          aria-label={tr(lang, 'منح صلاحية وثيقة', 'Grant permission')}
                          defaultValue=""
                          disabled={busy}
                          onChange={async e => {
                            const [kind, val, mode] = e.target.value.split(':');
                            if (!val) return;
                            await onRun(() =>
                              api.addDocumentPermission(
                                doc.id,
                                kind as 'user' | 'role',
                                val,
                                mode as 'read' | 'write',
                                currentUserId,
                              ),
                            );
                            e.target.value = '';
                          }}
                        >
                          <option value="">{tr(lang, '+ منح صلاحية لفرد أو دور…', '+ Grant access to member or role…')}</option>
                          <optgroup label={tr(lang, 'أعضاء الفريق', 'Team Members')}>
                            {members.map(m => (
                              <React.Fragment key={m.user_id}>
                                <option value={`user:${m.user_id}:read`}>
                                  {personName(m.user_id)} — {tr(lang, 'قراءة فقط', 'Read only')}
                                </option>
                                <option value={`user:${m.user_id}:write`}>
                                  {personName(m.user_id)} — {tr(lang, 'قراءة وتعديل', 'Read & write')}
                                </option>
                              </React.Fragment>
                            ))}
                          </optgroup>
                          <optgroup label={tr(lang, 'أدوار النظام', 'System Roles')}>
                            {appRoles.map(r => (
                              <option key={r} value={`role:${r}:read`}>
                                Role: {r} — {tr(lang, 'قراءة', 'Read')}
                              </option>
                            ))}
                          </optgroup>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* Upload Document Form (Supervisor only) */}
      {isSupervisor && (
        <Card className="research-create-card">
          <div className="research-create-card__header">
            <FileText size={18} />
            <h3>{tr(lang, 'رفع وثيقة أو مستند جديد', 'Upload Research Document')}</h3>
          </div>

          <form
            className="ui-form"
            onSubmit={async e => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const file = formData.get('file') as File;
              const title = formData.get('title') as string;
              const category = formData.get('category') as string;
              const restricted = formData.get('restricted') === 'on';

              if (!file?.size || !title || !category) return;

              await onRun(() =>
                api.uploadResearchDocument(research.id, file, title, category, restricted, currentUserId),
              );
              e.currentTarget.reset();
            }}
          >
            <div className="ui-form__grid">
              <Field label={tr(lang, 'اسم أو عنوان الوثيقة', 'Document Title')} required wide>
                <TextInput name="title" required placeholder={tr(lang, 'مثال: تقرير النتائج الميدانية المرحلة الأولى…', 'e.g. Field Results Report Phase 1')} />
              </Field>
              <Field label={tr(lang, 'التصنيف', 'Category')} required>
                <TextInput name="category" required placeholder={tr(lang, 'مثال: تقرير / مسودة / عقد…', 'e.g. Report, Contract, Protocol…')} />
              </Field>
              <Field label={tr(lang, 'الملف المرفق', 'File')} required>
                <input
                  name="file"
                  type="file"
                  required
                  className="ui-input"
                  style={{ padding: '8px' }}
                />
              </Field>
              <div style={{ gridColumn: 'span 2' }}>
                <Checkbox
                  name="restricted"
                  label={tr(lang, 'وثيقة مقيدة — لا يمكن الوصول لها إلا بتصريح صريح', 'Restricted document — explicit permission required to read')}
                />
              </div>
            </div>

            <div className="ui-form__actions">
              <Button type="submit" variant="primary" disabled={busy}>
                {tr(lang, 'رفع وتأمين الوثيقة', 'Upload & Secure Document')}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
