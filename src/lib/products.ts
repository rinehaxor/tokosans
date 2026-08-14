import { products as catalogProducts, type Product } from './catalog';
import { getSupabaseAdmin } from './supabase';

export type ManagedProduct = Product & { terms?: string; image_url?: string | null; active?: boolean; stock?: number };

export async function getProducts(): Promise<ManagedProduct[]> {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from('products').select('id,name,category,duration,price,original_price,description,terms,icon,badge,active');
    if (error) throw error;
    if (data?.length) {
      const { data: inventory } = await db.from('inventory').select('product_id,stock,image_url');
      const managed = data.map((product) => ({ ...product, ...(inventory?.find((item) => item.product_id === product.id) ? { stock: inventory.find((item) => item.product_id === product.id)?.stock, image_url: inventory.find((item) => item.product_id === product.id)?.image_url } : {}) }));
      const customIds = new Set(managed.map((product) => product.id));
      return [...catalogProducts.filter((product) => !customIds.has(product.id)), ...managed] as ManagedProduct[];
    }
  } catch (error) { console.error('Products query error:', error); }
  return catalogProducts;
}

export async function getProduct(id: string) {
  return (await getProducts()).find((product) => product.id === id);
}