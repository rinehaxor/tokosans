type TokopayOrder = { data?: Record<string, unknown>; status?: boolean; msg?: string; message?: string };

type TokopayCheckOrder = {
  status?: number;
  rc?: number;
  message?: string;
  error_msg?: string;
  data?: {
    trx_id?: string;
    reff_id?: string;
    status?: string;
  };
};

export async function createTokopayQris(referenceId: string, amount: number) {
  const merchant = import.meta.env.TOKOPAY_MERCHANT_ID;
  const secret = import.meta.env.TOKOPAY_SECRET_KEY;
  const method = import.meta.env.TOKOPAY_PAYMENT_METHOD;
  if (!merchant || !secret || !method) throw new Error('Konfigurasi Tokopay belum lengkap.');
  const query = new URLSearchParams({ merchant, secret, ref_id: referenceId, nominal: String(amount), metode: method });
  const response = await fetch(`https://api.tokopay.id/v1/order?${query}`, { headers: { Accept: 'application/json' } });
  const result = await response.json() as TokopayOrder;
  if (!response.ok || !result.data) throw new Error(result.msg ?? result.message ?? 'Tokopay gagal membuat pembayaran.');
  return result.data;
}

export async function checkTokopayOrder(referenceId: string) {
  const merchant = import.meta.env.TOKOPAY_MERCHANT_ID;
  const secret = import.meta.env.TOKOPAY_SECRET_KEY;
  if (!merchant || !secret) throw new Error('Konfigurasi Tokopay belum lengkap.');

  const query = new URLSearchParams({ merchant_id: merchant, secret, ref_id: referenceId });
  const response = await fetch(`https://api.tokopay.id/v1/check-order?${query}`, { headers: { Accept: 'application/json' } });
  const result = await response.json() as TokopayCheckOrder;
  if (!response.ok || result.status !== 1 || !result.data) return null;
  return result.data;
}

export function isTokopaySuccessful(status: unknown) {
  return ['success', 'completed', 'paid', 'settlement'].includes(String(status ?? '').toLowerCase());
}

export function isTokopayCancelled(status: unknown) {
  return ['canceled', 'cancelled', 'expired', 'failed', '0'].includes(String(status ?? '').toLowerCase());
}