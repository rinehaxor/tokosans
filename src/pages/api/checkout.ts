import type { APIRoute } from 'astro';
import { getProduct } from '../../lib/products';
import { getDefaultProductPackage, getProductPackages } from '../../lib/packages';
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
    const db = getSupabaseAdmin();
    const accountQuery = db.from('account_inventory').select('status,package_id,assigned_order_id').eq('product_id', baseProduct.id).eq('status', 'available').is('assigned_order_id', null);
    const [{ data: inventory }, { data: accounts, error: accountError }] = await Promise.all([db.from('inventory').select('active').eq('product_id', baseProduct.id).maybeSingle(), accountQuery]);
    if (accountError) throw accountError;
    if (inventory && !inventory.active) return new Response('Produk sedang tidak tersedia.', { status: 409 });
    const activePackages = productPackages.filter((item) => item.active);
    const defaultPackage = getDefaultProductPackage(baseProduct, productPackages);
    const isLegacyDefaultPackage = defaultPackage?.id === packageId;
    const matchingAccounts = (accounts ?? []).filter((account) => account.package_id === packageId || (isLegacyDefaultPackage && account.package_id === null));
    if (matchingAccounts.length < 1) {
      console.warn('Checkout package unavailable', {
        productId: baseProduct.id,
        packageId,
        packageCount: activePackages.length,
        availableAccounts: accounts ?? [],
      });
      return new Response('Paket sedang tidak tersedia.', { status: 409 });
    }
    const reference = `UG-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const { data: order, error: orderError } = await db.from('orders').insert({ order_number: reference, customer_name: name, customer_email: email, total_amount: selected.price }).select('id').single();
    if (orderError || !order) throw orderError ?? new Error('Order gagal dibuat.');
    const { error: itemError } = await db.from('order_items').insert({ order_id: order.id, product_id: baseProduct.id, product_name: `${baseProduct.name} · ${selected.duration}`, price: selected.price, quantity: 1 });
    if (itemError) throw itemError;
    const payment = await createTokopayQris(reference, selected.price);
    const { error: paymentError } = await db.from('payments').insert({ order_id: order.id, reference_id: reference, amount: selected.price, raw_response: payment, qr_string: payment.qr_string ?? payment.qr_content ?? null, qr_image_url: payment.qr_url ?? payment.qr_image ?? null });
    if (paymentError) throw paymentError;
    return redirect(`/payment/${reference}`);
  } catch (error) {
    console.error('Checkout error:', error);
    return new Response('Gagal membuat pembayaran. Periksa konfigurasi server.', { status: 500 });
  }
};