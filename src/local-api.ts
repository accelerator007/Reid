import { supabase } from './supabase';

export async function localApi<T>(path: string, body?: unknown): Promise<T> {
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error('sign_in_required');
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => ({ error: 'service_unavailable' }));
  if (!response.ok) throw new Error(data.error || 'service_unavailable');
  return data as T;
}

export function localError(error: unknown, lang: 'ar' | 'en') {
  const key = error instanceof Error ? error.message : '';
  const errors: Record<string, [string,string]> = {
    sign_in_required: ['سجّل الدخول للمتابعة.', 'Sign in to continue.'],
    owner_required: ['هذه الخدمة مخصصة للمالك.', 'This service is available to the Owner.'],
    whatsapp_disconnected: ['اربط الهاتف أولًا من صفحة الاتصالات.', 'Link the phone in Connections first.'],
    rate_limited: ['طلبات كثيرة. انتظر قليلًا ثم حاول مجددًا.', 'Too many requests. Wait a moment and retry.'],
  };
  return (errors[key] || ['تعذّر الوصول للخدمة. حاول مجددًا؛ لم يتم تأكيد الإجراء.', 'The service could not be reached. Retry; the action has not been confirmed.'])[lang === 'ar' ? 0 : 1];
}
