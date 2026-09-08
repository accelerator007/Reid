const digits = (value = '') => String(value).replace(/\D/g, '');

export class CompanyClient {
  constructor({ url, token }) {
    this.url = String(url || '').replace(/\/$/, '');
    this.token = String(token || '');
  }

  get enabled() { return Boolean(this.url && this.token); }

  async call(sender, operation, args = {}, chatId = '') {
    if (!this.enabled) throw new Error('company_gateway_not_configured');
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'bridge', sender: digits(sender), chatId, operation, args }),
      signal: AbortSignal.timeout(180_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error(payload.error || `company_gateway_${response.status}`);
    return payload.result;
  }
}
