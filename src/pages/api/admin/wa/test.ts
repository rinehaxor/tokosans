import type { APIRoute } from 'astro';
import { sendAdminNotification, getAdminNotifyJids } from '../../../../lib/wa-client';

export const POST: APIRoute = async () => {
  const jids = getAdminNotifyJids();
  if (!jids.length) {
    return new Response(
      JSON.stringify({ ok: false, message: 'ADMIN_WA_NOTIFY_JIDS (atau ADMIN_WA_NUMBER) belum dikonfigurasi di server.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  const sent = await sendAdminNotification(
    '✅ Tes notifikasi dari tokosans.\n\nJika pesan ini sampai, berarti notifikasi WhatsApp admin sudah berfungsi.',
  );
  return new Response(
    JSON.stringify(
      sent
        ? { ok: true, message: `Pesan tes dikirim ke ${jids.length} admin: ${jids.join(', ')}.` }
        : { ok: false, message: 'Gagal mengirim. Pastikan WhatsApp sudah terhubung (scan QR).' },
    ),
    { status: sent ? 200 : 400, headers: { 'Content-Type': 'application/json' } },
  );
};
