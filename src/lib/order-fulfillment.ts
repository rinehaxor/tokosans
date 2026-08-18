import { getSupabaseAdmin } from './supabase';
import { getDefaultProductPackage, getProductPackages } from './packages';
import { getProduct } from './products';
import { sendAccountDeliveryEmail } from './email';
import { notifyAdminOrderPaid, notifyAdminLowStock } from './wa-client';
import { waDebug } from './wa-debug';

export interface AssignedAccountResult {
  id: string;
  login: string;
  password?: string;
  terms?: string;
  emailSent?: boolean;
}

export async function assignAccount(
  db: ReturnType<typeof getSupabaseAdmin>,
  orderId: string
): Promise<AssignedAccountResult | null> {
  const { data: item, error: itemError } = await db
    .from('order_items')
    .select('product_id,product_name')
    .eq('order_id', orderId)
    .limit(1)
    .maybeSingle();
  if (itemError) throw itemError;
  if (!item) return null;

  const { data: productRecord } = await db
    .from('products')
    .select('terms')
    .eq('id', item.product_id)
    .maybeSingle();
  const terms = productRecord?.terms ?? '';

  const { data: existing, error: existingError } = await db
    .from('account_inventory')
    .select('id,login,password,email_sent')
    .eq('assigned_order_id', orderId)
    .eq('status', 'sold')
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    return {
      id: existing.id,
      login: existing.login,
      password: existing.password,
      terms,
      emailSent: existing.email_sent,
    };
  }

  const duration = item.product_name.split(' · ').pop();
  const product = await getProduct(item.product_id);
  const { data: packageRow } = await db
    .from('product_packages')
    .select('id')
    .eq('product_id', item.product_id)
    .eq('duration', duration)
    .maybeSingle();

  let availableQuery = db
    .from('account_inventory')
    .select('id')
    .eq('product_id', item.product_id)
    .eq('status', 'available')
    .is('assigned_order_id', null);

  if (packageRow) {
    const packages = product ? await getProductPackages(product) : [];
    const isDefaultPackage =
      product && getDefaultProductPackage(product, packages)?.id === packageRow.id;
    availableQuery = (
      isDefaultPackage
        ? availableQuery.or(`package_id.eq.${packageRow.id},package_id.is.null`)
        : availableQuery.eq('package_id', packageRow.id)
    ) as typeof availableQuery;
  } else {
    availableQuery = availableQuery.is('package_id', null);
  }

  const { data: available, error: availableError } = await availableQuery
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (availableError) throw availableError;
  if (!available) return null;

  const { data: claimed, error: claimError } = await db
    .from('account_inventory')
    .update({
      status: 'sold',
      assigned_order_id: orderId,
      sold_at: new Date().toISOString(),
    })
    .eq('id', available.id)
    .eq('status', 'available')
    .is('assigned_order_id', null)
    .select('id,login,password')
    .maybeSingle();
  if (claimError) throw claimError;

  return claimed
    ? {
        id: claimed.id,
        login: claimed.login,
        password: claimed.password,
        terms,
        emailSent: false,
      }
    : null;
}

export async function triggerEmailDelivery(
  db: ReturnType<typeof getSupabaseAdmin>,
  orderId: string,
  account: AssignedAccountResult | null
): Promise<void> {
  if (!account || account.emailSent) return;
  const { data: order } = await db
    .from('orders')
    .select('order_number,customer_name,customer_email,order_items(product_name)')
    .eq('id', orderId)
    .maybeSingle();
  if (!order?.customer_email) {
    console.warn('[Email] Tidak ada customer_email untuk order', orderId);
    return;
  }

  const productName =
    (order.order_items as { product_name: string }[] | null)?.[0]?.product_name ??
    'Produk';
  const result = await sendAccountDeliveryEmail({
    toEmail: order.customer_email,
    customerName: order.customer_name ?? 'Pelanggan',
    orderNumber: order.order_number,
    productName,
    login: account.login,
    password: account.password,
    terms: account.terms,
  });

  if (result.success) {
    await db
      .from('account_inventory')
      .update({ email_sent: true })
      .eq('id', account.id);
    account.emailSent = true;
    console.info('[Email] Flag email_sent diset untuk inventory', account.id);
  }
}

export async function triggerOrderNotifications(
  db: ReturnType<typeof getSupabaseAdmin>,
  orderId: string,
  reference?: string
): Promise<void> {
  waDebug('notify-start', `Mempersiapkan notifikasi pesanan ${orderId} (ref: ${reference ?? '-'})`);
  try {
    const [{ data: waOrder }, { data: waItem }] = await Promise.all([
      db
        .from('orders')
        .select('order_number,customer_name,total_amount')
        .eq('id', orderId)
        .maybeSingle(),
      db
        .from('order_items')
        .select('product_id,product_name')
        .eq('order_id', orderId)
        .limit(1)
        .maybeSingle(),
    ]);

    const orderNumber = waOrder?.order_number ?? reference ?? 'N/A';
    const customerName = waOrder?.customer_name ?? 'Pelanggan';
    const productName = waItem?.product_name ?? 'Produk';
    const amount = waOrder?.total_amount ?? 0;

    waDebug('notify-send', `Kirim notifikasi order paid: #${orderNumber}, ${customerName}, ${productName}, Rp ${amount}`);
    await notifyAdminOrderPaid({
      orderNumber,
      customerName,
      productName,
      amount,
    });

    if (waItem?.product_id) {
      const { count } = await db
        .from('account_inventory')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', waItem.product_id)
        .eq('status', 'available');
      const remaining = count ?? 0;
      const threshold = Number(process.env.STOCK_LOW_THRESHOLD) || 2;
      waDebug('notify-stock-check', `Produk ${waItem.product_name} (${waItem.product_id}) sisa stok: ${remaining}, threshold: ${threshold}`);
      if (remaining === 0 || remaining <= threshold) {
        waDebug('notify-low-stock', `Stok menipis/habis (${remaining} akun) — mengirim alert low stock`);
        await notifyAdminLowStock(waItem.product_name ?? waItem.product_id, remaining);
      }
    }
  } catch (err) {
    waDebug('notify-error', `Gagal mengirim notifikasi pesanan ${orderId}:`, err);
    console.error('[Order Fulfillment] Notifikasi error:', err);
  }
}
