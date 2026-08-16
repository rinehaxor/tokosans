import type { APIRoute } from 'astro';
import { disconnectWa, getWaStatus } from '../../../../lib/wa-client';

export const POST: APIRoute = async () => {
  await disconnectWa();
  const status = getWaStatus();
  return new Response(JSON.stringify({ ok: true, state: status.state }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
