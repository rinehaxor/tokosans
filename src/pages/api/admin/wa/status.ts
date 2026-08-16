import type { APIRoute } from 'astro';
import { ensureWaClient, getWaStatus, getQrDataUrl } from '../../../../lib/wa-client';

export const GET: APIRoute = async () => {
  await ensureWaClient();
  const status = getWaStatus();
  const qr = status.state === 'qr' ? await getQrDataUrl() : null;
  return new Response(
    JSON.stringify({
      state: status.state,
      qr,
      lastConnected: status.lastConnected,
      adminNumber: status.adminNumber,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
