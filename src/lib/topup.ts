import { getSupabaseAdmin } from './supabase';
import { createDigiflazzOrder, isDigiflazzSuccessful } from './digiflazz';

export type TopupResult = {
  attempted: boolean;
  success: boolean;
  status?: string;
  message?: string;
  sn?: string;
};

/**
 * Forward order top up game yang sudah LUNAS ke Digiflazz.
 * - Hanya berlaku untuk order_items yang punya digiflazz_sku + customer_no.
 * - Idempoten: transaksi hanya dikirim sekali per order (dicek lewat digiflazz_ref_id).
 * - ref_id = order_number (unik), sehingga retry Digiflazz dengan ref sama tidak
 *   akan diproses ganda oleh Digiflazz.
 */
export async function processTopupFulfillment(
  db: ReturnType<typeof getSupabaseAdmin>,
  orderId: string
): Promise<TopupResult | null> {
  // Hanya proses order yang sudah LUNAS (atau sedang diproses) — jangan pernah
  // kirim ke Digiflazz untuk order pending/cancelled/expired.
  const { data: orderRow, error: orderError } = await db
    .from('orders')
    .select('status,order_number')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!orderRow) return null;
  if (!['paid', 'processing', 'completed'].includes(String(orderRow.status))) return null;
  const reference = orderRow.order_number;
  if (!reference) return null;

  const { data: item, error: itemError } = await db
    .from('order_items')
    .select('id,digiflazz_sku,customer_no,digiflazz_ref_id,digiflazz_status,digiflazz_sn')
    .eq('order_id', orderId)
    .limit(1)
    .maybeSingle();
  if (itemError) {
    // Kolom top up belum ada (migrasi SQL belum dijalankan) — lewati tanpa merusak alur pembayaran
    console.warn('[Topup] Kolom top up belum tersedia, lewati fulfillment (jalankan supabase/migrations/digiflazz-topup.sql):', itemError.message ?? itemError);
    return null;
  }
  if (!item?.digiflazz_sku || !item.customer_no) return null; // bukan produk top up / data kurang

  // Sudah pernah diproses -> jangan kirim ulang
  if (item.digiflazz_ref_id) {
    return { attempted: true, success: isDigiflazzSuccessful(item.digiflazz_status), status: item.digiflazz_status ?? undefined, sn: item.digiflazz_sn ?? undefined };
  }

  // Klaim atomik: tandai ref_id hanya jika masih kosong, mencegah double-send dari webhook + polling
  const { data: claimed, error: claimError } = await db
    .from('order_items')
    .update({ digiflazz_ref_id: reference, digiflazz_status: 'pending' })
    .eq('id', item.id)
    .is('digiflazz_ref_id', null)
    .select('id');
  if (claimError) throw claimError;
  if (!claimed || claimed.length === 0) return null; // sudah diklaim proses lain

  try {
    const result = await createDigiflazzOrder(reference, item.digiflazz_sku, item.customer_no);
    const status = String(result.status ?? '');
    const success = isDigiflazzSuccessful(status) || status === 'pending' || ['03', '39', '58'].includes(String(result.rc ?? ''));
    await db
      .from('order_items')
      .update({ digiflazz_status: status || 'pending', digiflazz_sn: result.sn ?? null })
      .eq('id', item.id);
    return { attempted: true, success, status: status || 'pending', message: result.message, sn: result.sn };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Topup] Gagal forward ke Digiflazz:', message);
    // Kosongkan ref_id agar bisa dicoba ulang (webhook/polling berikutnya)
    await db.from('order_items').update({ digiflazz_ref_id: null, digiflazz_status: `error: ${message}`.slice(0, 250) }).eq('id', item.id);
    return { attempted: true, success: false, message };
  }
}
