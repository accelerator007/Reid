import React from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  MessageCircle,
  QrCode,
} from 'lucide-react';
import { localApi, localError } from '../local-api';
import type { Page } from '../routes';
import {
  Button,
  Card,
  InlineAlert,
  PageHeader,
  StatCard,
} from '../ui';
import {
  type Lang,
  type Status,
} from './model';
import './connections.css';

const tr = (lang: Lang, ar: string, en: string) => (lang === 'ar' ? ar : en);
export function Connections({ lang, go }: { lang: Lang; go: (page: Page) => void }) {
  const [status, setStatus] = React.useState<Status | null>(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(async () => {
    try {
      const nextStatus = await localApi<Status>('whatsapp/status');
      setStatus(nextStatus);
      setError('');
    } catch (e) {
      setError(localError(e, lang));
    }
  }, [lang]);

  React.useEffect(() => {
    void load();
    const timer = setInterval(() => { if(document.visibilityState==='visible')void load(); }, 30000);
    return () => clearInterval(timer);
  }, [load]);

  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      await localApi('whatsapp/connect', {});
      await load();
    } catch (e) {
      setError(localError(e, lang));
    } finally {
      setBusy(false);
    }
  };

  const connected = status?.connection === 'connected';

  return (
    <main className="connections-page">
      <PageHeader
        eyebrow="REID / CONNECTIONS"
        title={tr(lang, 'الربط والتكاملات', 'Connections & Integrations')}
        description={tr(lang, 'اربط رقم الشركة، ثم أدر الردود والأعضاء من لوحة واتساب.', 'Connect the company number, then manage replies and members in WhatsApp control.')}
      />

      {error && <InlineAlert tone="danger">{error}</InlineAlert>}

      <div className="connections-status-strip">
        <StatCard
          icon={<MessageCircle />}
          label="WhatsApp"
          value={connected ? `+${status?.number}` : tr(lang, 'غير متصل', 'Disconnected')}
          hint={connected ? tr(lang, 'الجلسة نشطة ومستقرة', 'Session active') : tr(lang, 'يحتاج مسح رمز QR', 'Scan QR to connect')}
        />
      </div>
      <Card className="connections-qr-container">
          {connected ? (
            <div className="connections-qr-success">
              <CheckCircle2 />
              <h3>{tr(lang, 'رقم ريّد متصل بنجاح', 'Reid is connected successfully')}</h3>
              <b dir="ltr">+{status?.number}</b>
              <p style={{ color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto' }}>
                {tr(lang, 'يستقبل ريّد الرسائل النصية والصوتية والمستندات ويتعامل معها وفق القواعد المعتمدة.', 'Reid is listening for messages, voice notes and documents according to governed rules.')}
              </p>
              <Button variant="primary" onClick={() => go('inbox')}>
                {tr(lang, 'فتح صندوق المحادثات', 'Open inbox')} <ArrowUpRight />
              </Button>
            </div>
          ) : (
            <div>
              <div className="connections-qr-box">
                {status?.qr ? (
                  <img src={status.qr} alt={tr(lang, 'رمز الاستجابة السريعة للربط', 'Scan this QR code')} />
                ) : (
                  <div style={{ display: 'grid', placeItems: 'center', gap: '12px' }}>
                    <QrCode size={64} style={{ color: 'var(--text-muted)' }} />
                    <Button variant="primary" busy={busy || status?.connection === 'connecting'} onClick={() => void connect()}>
                      {busy || status?.connection === 'connecting' ? tr(lang, 'جارٍ التجهيز…', 'Preparing QR…') : tr(lang, 'إظهار رمز QR', 'Show QR code')}
                    </Button>
                  </div>
                )}
              </div>
              <ol className="connections-steps-list">
                <li>{tr(lang, '1. افتح واتساب في هاتف رقم ريّد.', '1. Open WhatsApp on the Reid phone.')}</li>
                <li>{tr(lang, '2. الإعدادات ← الأجهزة المرتبطة ← ربط جهاز.', '2. Settings → Linked devices → Link a device.')}</li>
                <li>{tr(lang, '3. امسح الرمز، وستبدأ المزامنة فوراً.', '3. Scan the code to start syncing.')}</li>
              </ol>
            </div>
          )}
      </Card>

    </main>
  );
}
