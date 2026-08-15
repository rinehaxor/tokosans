import React, { useState, useRef } from 'react';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import ImageExtension from '@tiptap/extension-image';
import LinkExtension from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import BlogEditorFormFields from './BlogEditorFormFields';
import BlogTipTapContainer from './BlogTipTapContainer';
import BlogEditorActions from './BlogEditorActions';
import { useBlogSave, slugify } from './useBlogEditor';
import '../styles/tiptap.css';

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

export default function BlogEditor({ post, isNew }: { post?: BlogPost; isNew: boolean }) {
  const [title, setTitle] = useState(post?.title ?? '');
  const [category, setCategory] = useState(post?.category ?? 'Umum');
  const [slug, setSlug] = useState(post?.slug ?? '');
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? '');
  const [coverUrl, setCoverUrl] = useState(post?.cover_url ?? '');
  const [status] = useState(post?.status ?? 'draft');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingContentImage, setUploadingContentImage] = useState(false);
  const [slugManual, setSlugManual] = useState(false);

  const { saving, msg, setMsg, save } = useBlogSave(post, isNew);
  const contentImageInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      ImageExtension.configure({
        HTMLAttributes: {
          class: 'editor-image',
          style: 'max-width:100%; border-radius:12px; margin:16px 0; display:block;',
        },
      }),
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: { style: 'color:#7048e8; font-weight:600; text-decoration:underline;' },
      }),
      Placeholder.configure({ placeholder: 'Tulis konten artikel Anda di sini...' }),
    ],
    content: post?.content ?? '',
  });

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!slugManual) setSlug(slugify(val));
  };

  const handleUploadFile = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/admin/blog/upload', { method: 'POST', body: fd });
    const j = await r.json();
    if (!r.ok || !j.url) throw new Error(j.message || 'Gagal mengunggah file gambar.');
    return j.url;
  };

  const onCoverFileSelected = async (file: File) => {
    setUploadingCover(true);
    setMsg(null);
    try {
      const url = await handleUploadFile(file);
      setCoverUrl(url);
      setMsg({ t: 'Gambar cover berhasil diunggah!', s: true });
    } catch (err) {
      setMsg({ t: err instanceof Error ? err.message : 'Gagal mengunggah cover.', s: false });
    } finally {
      setUploadingCover(false);
    }
  };

  const onContentImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    setUploadingContentImage(true);
    setMsg(null);
    try {
      const url = await handleUploadFile(file);
      editor.chain().focus().setImage({ src: url, alt: file.name }).run();
      setMsg({ t: 'Gambar disisipkan ke dalam artikel!', s: true });
    } catch (err) {
      setMsg({ t: err instanceof Error ? err.message : 'Gagal mengunggah gambar.', s: false });
    } finally {
      setUploadingContentImage(false);
      if (contentImageInputRef.current) contentImageInputRef.current.value = '';
    }
  };

  const setLink = () => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Masukkan URL link:', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const handleSave = (targetStatus: 'draft' | 'published') => {
    save(title, category, slug, excerpt, coverUrl, targetStatus, editor);
  };

  const wordCount = editor
    ? editor.getText().split(/\s+/).filter(Boolean).length
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <input ref={contentImageInputRef} type="file" accept="image/*" onChange={onContentImageChange} style={{ display: 'none' }} />

      <BlogEditorFormFields
        title={title}
        category={category}
        slug={slug}
        coverUrl={coverUrl}
        excerpt={excerpt}
        uploadingCover={uploadingCover}
        onTitleChange={handleTitleChange}
        onCategoryChange={setCategory}
        onSlugChange={(val) => { setSlugManual(true); setSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, '')); }}
        onCoverUrlChange={setCoverUrl}
        onExcerptChange={setExcerpt}
        onCoverFileSelected={onCoverFileSelected}
      />

      <BlogTipTapContainer
        editor={editor}
        wordCount={wordCount}
        uploadingContentImage={uploadingContentImage}
        onUploadClick={() => contentImageInputRef.current?.click()}
        onSetLink={setLink}
      />

      {msg && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 10,
            fontSize: '.88rem',
            fontWeight: 600,
            background: msg.s ? '#ecfdf5' : '#fef2f2',
            color: msg.s ? '#059669' : '#ef4444',
            border: `1px solid ${msg.s ? '#a7f3d0' : '#fca5a5'}`,
          }}
        >
          {msg.t}
        </div>
      )}

      <BlogEditorActions
        saving={saving}
        uploadingCover={uploadingCover}
        uploadingContentImage={uploadingContentImage}
        status={status}
        onSave={handleSave}
      />
    </div>
  );
}
