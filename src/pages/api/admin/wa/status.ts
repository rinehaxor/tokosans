import type { APIRoute } from 'astro';
import { ensureWaClient, getWaStatus, getQrDataUrl } from '../../../../lib/wa-client';

export const GET: APIRoute = async () => {
  await ensureWaClient();
  const status = getWaStatus();
  const qr = await getQrDataUrl();
  const effectiveState = qr ? 'qr' : status.state;
  return new Response(
    JSON.stringify({
      state: effectiveState,
      qr,
      lastConnected: status.lastConnected,
      adminNumber: status.adminNumber,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
