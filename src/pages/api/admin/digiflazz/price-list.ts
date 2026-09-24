import type { APIRoute } from 'astro';
import { getPriceListCached } from '../../../../lib/digiflazz';

export const GET: APIRoute = async ({ url }) => {
  const username = import.meta.env.DIGIFLAZZ_USERNAME;
  const apiKey   = import.meta.env.DIGIFLAZZ_API_KEY;

  if (!username || !apiKey) {
    return new Response(JSON.stringify({ error: 'DIGIFLAZZ_USERNAME atau DIGIFLAZZ_API_KEY belum dikonfigurasi.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cmd      = (url.searchParams.get('cmd') ?? 'prepaid') as 'prepaid' | 'pasca';
  const category = url.searchParams.get('category') ?? undefined;
  const brand    = url.searchParams.get('brand')    ?? undefined;
  const type     = url.searchParams.get('type')     ?? undefined;
  const code     = url.searchParams.get('code')     ?? undefined;
  const force    = url.searchParams.get('force') === '1';

  try {
    const result = await getPriceListCached(username, apiKey, cmd, { category, brand, type, code, force });
    return new Response(JSON.stringify({
      data: result.data,
      meta: { cached: result.cached, stale: result.stale, ageMinutes: result.ageMinutes, total: result.data.length },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[/api/admin/digiflazz/price-list]', e.message);
    return new Response(JSON.stringify({ error: e.message ?? 'Gagal ambil price list.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
