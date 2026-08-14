import { productCategories as fallbackCategories } from './catalog';
import { getSupabaseAdmin } from './supabase';

export type Category = { id: string; name: string; description: string };

export async function getCategories(): Promise<Category[]> {
  try {
    const { data, error } = await getSupabaseAdmin().from('categories').select('id,name,description').order('name');
    if (error) throw error;
    if (data?.length) return data as Category[];
  } catch (error) { console.error('Categories query error:', error); }
  return fallbackCategories.map((name, index) => ({ id: String(index + 1), name, description: '' }));
}