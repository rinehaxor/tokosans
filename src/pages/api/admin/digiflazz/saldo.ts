import type { APIRoute } from 'astro';
import { cekSaldoDigiflazz } from '../../../../lib/digiflazz';

export const GET: APIRoute = async () => {
  const username = import.meta.env.DIGIFLAZZ_USERNAME;
  const apiKey = import.meta.env.DIGIFLAZZ_API_KEY;

  if (!username || !apiKey) {
    return new Response(JSON.stringify({ error: 'DIGIFLAZZ_USERNAME atau DIGIFLAZZ_API_KEY belum dikonfigurasi.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const deposit = await cekSaldoDigiflazz(username, apiKey);
    return new Response(JSON.stringify({ deposit }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[/api/admin/digiflazz/saldo] Error:', e.message);
    return new Response(JSON.stringify({ error: e.message ?? 'Gagal cek saldo Digiflazz.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
