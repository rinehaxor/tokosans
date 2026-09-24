import type { APIRoute } from 'astro';
import { getProduct } from '../../lib/products';
import { getProductPackages } from '../../lib/packages';
import { getSupabaseAdmin } from '../../lib/supabase';
import { createTokopayQris } from '../../lib/tokopay';

export const POST: APIRoute = async ({ request, redirect }) => {
  try {
    const form = await request.formData();
    const baseProduct = await getProduct(String(form.get('productId') ?? ''));
    const packageId = String(form.get('packageId') ?? '');
    const name = String(form.get('name') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();
    if (!baseProduct || baseProduct.active === false || !name || !email.includes('@')) return new Response('Data checkout tidak valid.', { status: 400 });
    const productPackages = await getProductPackages(baseProduct);
    const selected = productPackages.find((item) => item.id === packageId && item.active);
    if (!selected) return new Response('Paket tidak tersedia.', { status: 400 });

    // Produk top up Digiflazz: tanpa stok akun, wajib punya nomor tujuan (User ID game)
    const isTopup = Boolean(selected.digiflazz_sku);
    const customerNo = String(form.get('customer_no') ?? '').replace(/\s+/g, '');
    if (isTopup) {
      if (!customerNo) return new Response(`${selected.customer_no_label || 'User ID'} wajib diisi untuk paket ini.`, { status: 400 });
      // Terima format "12345678", "12345678(2345)" (Mobile Legends: user(zone)), "GID-123" dsb.
      if (!/^[A-Za-z0-9()._-]{4,32}$/.test(customerNo)) return new Response('Format nomor tujuan tidak valid. Isi User ID game tanpa spasi (contoh Mobile Legends: 12345678(2345)).', { status: 400 });
    }

    const db = getSupabaseAdmin();
    if (!isTopup) {
      const accountQuery = db.from('account_inventory').select('status,package_id,assigned_order_id').eq('product_id', baseProduct.id).eq('status', 'available').is('assigned_order_id', null);
      const [{ data: inventory }, { data: accounts, error: accountError }] = await Promise.all([db.from('inventory').select('active').eq('product_id', baseProduct.id).maybeSingle(), accountQuery]);
      if (accountError) throw accountError;
      if (inventory && !inventory.active) return new Response('Produk sedang tidak tersedia.', { status: 409 });
      const defaultPackage = productPackages.find((item) => item.active) ?? selected;
      const isLegacyDefaultPackage = defaultPackage.id === packageId;
      const matchingAccounts = (accounts ?? []).filter((account) => account.package_id === packageId || (isLegacyDefaultPackage && account.package_id === null));
      if (matchingAccounts.length < 1) {
        console.warn('Checkout package unavailable', {
          productId: baseProduct.id,
          packageId,
          packageCount: productPackages.filter((item) => item.active).length,
          availableAccounts: accounts ?? [],
        });
        return new Response('Paket sedang tidak tersedia.', { status: 409 });
      }
    }

    const reference = `UG-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const { data: order, error: orderError } = await db.from('orders').insert({ order_number: reference, customer_name: name, customer_email: email, total_amount: selected.price }).select('id').single();
    if (orderError || !order) throw orderError ?? new Error('Order gagal dibuat.');

    const orderItemPayload: Record<string, unknown> = { order_id: order.id, product_id: baseProduct.id, product_name: `${baseProduct.name} · ${selected.duration}`, price: selected.price, quantity: 1 };
    if (selected.digiflazz_sku) orderItemPayload.digiflazz_sku = selected.digiflazz_sku;
    if (customerNo) orderItemPayload.customer_no = customerNo;
    const { error: itemError } = await db.from('order_items').insert(orderItemPayload);
    if (itemError) {
      if (isTopup) console.error('[Topup] Gagal simpan data top up — pastikan migrasi supabase/migrations/digiflazz-topup.sql sudah dijalankan di Supabase:', itemError.message ?? itemError);
      throw itemError;
    }

    // Pembayaran selalu via Tokopay QRIS.
    // Order Digiflazz TIDAK dikirim di sini — baru setelah pembayaran lunas
    // (dipicu webhook Tokopay / polling status, lihat src/lib/topup.ts).
    const paymentResponse = await createTokopayQris(reference, selected.price);
    const qrString = paymentResponse.qr_string ?? paymentResponse.qr_content ?? null;
    const qrImageUrl = paymentResponse.qr_url ?? paymentResponse.qr_image ?? null;
    const { error: paymentError } = await db.from('payments').insert({ order_id: order.id, reference_id: reference, provider: 'tokopay', amount: selected.price, raw_response: paymentResponse, qr_string: qrString, qr_image_url: qrImageUrl });
    if (paymentError) throw paymentError;
    return redirect(`/payment/${reference}`);
  } catch (error) {
    console.error('Checkout error:', error);
    return new Response('Gagal membuat pembayaran. Periksa konfigurasi server.', { status: 500 });
  }
};
