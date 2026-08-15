import { useState } from 'react';
import type { Editor } from '@tiptap/react';

type BlogPost = {
  id?: string;
  slug: string;
  title: string;
  category?: string;
  excerpt: string;
  content: string;
  cover_url: string;
  status: 'draft' | 'published';
};

export function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
}

export function useBlogSave(post?: BlogPost, isNew?: boolean) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ t: string; s: boolean } | null>(null);

  const save = async (
    title: string,
    category: string,
    slug: string,
    excerpt: string,
    coverUrl: string,
    targetStatus: 'draft' | 'published',
    editor: Editor | null
  ) => {
    if (!title.trim()) {
      setMsg({ t: 'Judul wajib diisi.', s: false });
      return;
    }
    const htmlContent = editor ? editor.getHTML() : '';
    if (!htmlContent.trim() || htmlContent === '<p></p>') {
      setMsg({ t: 'Konten artikel wajib diisi.', s: false });
      return;
    }

    setSaving(true);
    setMsg(null);

    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        category: category.trim() || 'Umum',
        slug: slug.trim() || slugify(title),
        excerpt: excerpt.trim(),
        content: htmlContent,
        cover_url: coverUrl.trim() || null,
        status: targetStatus,
      };

      if (!isNew && post?.id) body.id = post.id;

      const r = await fetch('/api/admin/blog', {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'Gagal menyimpan.');

      setMsg({
        t: targetStatus === 'published' ? 'Artikel dipublikasikan!' : 'Draft disimpan!',
        s: true,
      });

      window.dispatchEvent(
        new CustomEvent('app:toast', {
          detail: {
            type: 'success',
            message: targetStatus === 'published' ? 'Artikel dipublikasikan!' : 'Draft disimpan!',
          },
        })
      );

      if (isNew && j.post?.id) {
        setTimeout(() => {
          window.location.href = `/dashboard/blog/${j.post.id}`;
        }, 800);
      }
    } catch (err) {
      setMsg({ t: err instanceof Error ? err.message : 'Gagal menyimpan.', s: false });
    } finally {
      setSaving(false);
    }
  };

  return { saving, msg, setMsg, save };
}
