import { getSupabaseAdmin } from './supabase';

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  cover_url: string | null;
  status: 'draft' | 'published';
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getPublishedPosts(): Promise<BlogPost[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('blog_posts')
    .select('id,slug,title,excerpt,content,cover_url,status,published_at,created_at,updated_at')
    .eq('status', 'published')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BlogPost[];
}

export async function getAllPosts(): Promise<BlogPost[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('blog_posts')
    .select('id,slug,title,excerpt,content,cover_url,status,published_at,created_at,updated_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BlogPost[];
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('blog_posts')
    .select('id,slug,title,excerpt,content,cover_url,status,published_at,created_at,updated_at')
    .eq('slug', slug)
    .single();
  if (error) return null;
  return data as BlogPost;
}

export async function getPostById(id: string): Promise<BlogPost | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('blog_posts')
    .select('id,slug,title,excerpt,content,cover_url,status,published_at,created_at,updated_at')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as BlogPost;
}

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
}

export function formatBlogDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function estimateReadTime(content: string): number {
  const words = content.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}
