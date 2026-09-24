import { getSupabaseAdmin } from './supabase';
import type { ManagedProduct } from './products';

export type ProductPackage = { id: string; product_id: string; name: string; duration: string; price: number; active: boolean; digiflazz_sku?: string | null; requires_customer_no?: boolean; customer_no_label?: string | null };

export async function getProductPackages(product: ManagedProduct): Promise<ProductPackage[]> {
  try {
    const { data, error } = await getSupabaseAdmin().from('product_packages').select('id,product_id,name,duration,price,active,digiflazz_sku,requires_customer_no,customer_no_label').eq('product_id', product.id).order('price');
    if (error) throw error;
    if (data?.length) return data as ProductPackage[];
  } catch (error) { console.error('Packages query error:', error); }
  return [{ id: product.id, product_id: product.id, name: product.duration, duration: product.duration, price: product.price, active: product.active !== false }];
}

export function getDefaultProductPackage(product: ManagedProduct, packages: ProductPackage[]): ProductPackage | undefined {
  const activePackages = packages.filter((item) => item.active);
  return activePackages.find((item) => item.duration.trim().toLowerCase() === product.duration.trim().toLowerCase()) ?? activePackages[0];
}

/**
 * Kumpulan product_id yang punya paket top up Digiflazz (requires_customer_no = true).
 * Dipakai untuk memisahkan etalase/checkout produk top up vs produk akun biasa.
 */
export async function getTopupProductIds(): Promise<Set<string>> {
  try {
    const { data, error } = await getSupabaseAdmin().from('product_packages').select('product_id,requires_customer_no').eq('requires_customer_no', true);
    if (error) throw error;
    return new Set((data ?? []).map((row) => row.product_id as string));
  } catch (error) {
    console.error('Topup product ids query error:', error);
    return new Set();
  }
}