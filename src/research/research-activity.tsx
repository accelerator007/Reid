import React from 'react';
import { History, Activity as ActivityIcon } from 'lucide-react';
import { Card } from '../ui';
import { type Lang, type Person, type Activity, tr } from './model';

export function ResearchActivity({
  lang,
  activity,
  people,
}: {
  lang: Lang;
  activity: Activity[];
  people: Person[];
}) {
  const personName = (id: string | null) => people.find(p => p.id === id)?.full_name || '—';

  return (
    <div className="research-tab-content">
      {activity.length === 0 ? (
        <div className="research-empty-state">
          <History size={32} />
          <p>{tr(lang, 'لا توجد سجلات نشاط حديثة لهذا البحث.', 'No recent activity records found.')}</p>
        </div>
      ) : (
        <div className="research-activity-feed">
          {activity.map(item => (
            <Card key={item.id} className="research-activity-item">
              <div className="research-activity-item__icon">
                <ActivityIcon size={16} />
              </div>

              <div className="research-activity-item__body">
                <div className="research-activity-item__title">
                  <strong>{item.action}</strong>
                  <span className="research-chip">{item.entity_type}</span>
                </div>

                <div className="research-activity-item__meta">
                  <span>{personName(item.actor_id)}</span>
                  <span>·</span>
                  <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
                  {item.entity_id && (
                    <>
                      <span>·</span>
                      <code>{item.entity_id}</code>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
