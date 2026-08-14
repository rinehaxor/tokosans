import { getSupabaseAdmin } from './supabase';
import type { ManagedProduct } from './products';

export type ProductPackage = { id: string; product_id: string; name: string; duration: string; price: number; active: boolean };

export async function getProductPackages(product: ManagedProduct): Promise<ProductPackage[]> {
  try {
    const { data, error } = await getSupabaseAdmin().from('product_packages').select('id,product_id,name,duration,price,active').eq('product_id', product.id).order('price');
    if (error) throw error;
    if (data?.length) return data as ProductPackage[];
  } catch (error) { console.error('Packages query error:', error); }
  return [{ id: product.id, product_id: product.id, name: product.duration, duration: product.duration, price: product.price, active: product.active !== false }];
}

export function getDefaultProductPackage(product: ManagedProduct, packages: ProductPackage[]): ProductPackage | undefined {
  const activePackages = packages.filter((item) => item.active);
  return activePackages.find((item) => item.duration.trim().toLowerCase() === product.duration.trim().toLowerCase()) ?? activePackages[0];
}