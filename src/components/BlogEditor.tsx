import { useState, useRef, useCallback } from 'react';

type BlogPost = { id?: string; slug: string; title: string; excerpt: string; content: string; cover_url: string; status: 'draft' | 'published' };

const TOOLBAR = [
  { label: 'Bold', icon: 'B', action: 'bold' },
  { label: 'Italic', icon: 'I', action: 'italic' },
  { label: 'H2', icon: 'H2', action: 'h2' },
  { label: 'H3', icon: 'H3', action: 'h3' },
  { label: 'Quote', icon: '\u275D', action: 'quote' },
  { label: 'List', icon: '\u2022', action: 'ul' },
  { label: 'Link', icon: '\uD83D\uDD17', action: 'link' },
  { label: 'Upload Gambar', icon: '🖼️ Upload Gambar', action: 'upload-image' },
  { label: 'Code', icon: '<>', action: 'code' },
  { label: 'Divider', icon: '\u2014', action: 'hr' },
];

function slugify(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 80);
}

function md2html(md: string) {
  let h = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  h = h.replace(/```([\s\S]*?)```/g, '<pre style="background:#f8f5ff;padding:16px;border-radius:10px;font-size:.88rem;border:1px solid #eae3f5"><code>$1</code></pre>');
  h = h.replace(/`([^`]+)`/g, '<code style="background:#f3edff;padding:2px 7px;border-radius:5px;font-size:.85rem;color:#7048e8">$1</code>');
  h = h.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:12px;margin:12px 0"/>');
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#7048e8;font-weight:600" target="_blank">$1</a>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
  h = h.replace(/^### (.+)$/gm, '<h3 style="font-size:1.1rem;margin:20px 0 8px;font-weight:800">$1</h3>');
  h = h.replace(/^## (.+)$/gm, '<h2 style="font-size:1.3rem;margin:24px 0 10px;font-weight:800">$1</h2>');
  h = h.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #eae3f5;margin:24px 0"/>');
  h = h.replace(/^&gt; (.+)$/gm, '<blockquote style="border-left:3px solid #7048e8;padding:8px 16px;margin:12px 0;color:#6b6178;background:#faf8fe;border-radius:0 8px 8px 0">$1</blockquote>');
  h = h.replace(/^- (.+)$/gm, '<li style="margin:4px 0;list-style:disc;margin-left:20px">$1</li>');
  h = h.replace(/^\d+\. (.+)$/gm, '<li style="margin:4px 0;list-style:decimal;margin-left:20px">$1</li>');
  h = h.replace(/\n\n/g, '</p><p style="margin:12px 0">');
  return '<p style="margin:12px 0">' + h + '</p>';
}

const iS: React.CSSProperties = { border: '1px solid #eae3f5', borderRadius: 12, padding: '12px 16px', fontSize: '.92rem', fontFamily: "'DM Sans',sans-serif", color: '#191026', background: '#fff', width: '100%', outline: 'none' };

export default function BlogEditor({ post, isNew }: { post?: BlogPost; isNew: boolean }) {
  const [title, setTitle] = useState(post?.title ?? '');
  const [slug, setSlug] = useState(post?.slug ?? '');
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? '');
  const [content, setContent] = useState(post?.content ?? '');
  const [coverUrl, setCoverUrl] = useState(post?.cover_url ?? '');
  const [status] = useState(post?.status ?? 'draft');
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingContent, setUploadingContent] = useState(false);
  const [msg, setMsg] = useState<{ t: string; s: boolean } | null>(null);
  const [slugM, setSlugM] = useState(false);
  const [prev, setPrev] = useState(false);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const contentImageInputRef = useRef<HTMLInputElement>(null);
  const chTitle = (v: string) => { setTitle(v); if (!slugM) setSlug(slugify(v)); };

  const handleUploadFile = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/admin/blog/upload', { method: 'POST', body: fd });
    const j = await r.json();
    if (!r.ok || !j.url) throw new Error(j.message || 'Gagal mengunggah file gambar.');
    return j.url;
  };

  const onCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
      if (coverInputRef.current) coverInputRef.current.value = '';
    }
  };

  const onContentImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingContent(true);
    setMsg(null);
    try {
      const url = await handleUploadFile(file);
      const ta = taRef.current;
      const alt = file.name.split('.')[0].replace(/[^a-zA-Z0-9\s]/g, '');
      const markdownImage = "\n![" + (alt || 'gambar') + "](" + url + ")\n";
      
      if (ta) {
        const s = ta.selectionStart;
        const e = ta.selectionEnd;
        setContent(content.substring(0, s) + markdownImage + content.substring(e));
        setTimeout(() => {
          ta.focus();
          const c = s + markdownImage.length;
          ta.setSelectionRange(c, c);
        }, 0);
      } else {
        setContent(prevContent => prevContent + markdownImage);
      }
      setMsg({ t: 'Gambar disisipkan ke dalam artikel!', s: true });
    } catch (err) {
      setMsg({ t: err instanceof Error ? err.message : 'Gagal mengunggah gambar ke artikel.', s: false });
    } finally {
      setUploadingContent(false);
      if (contentImageInputRef.current) contentImageInputRef.current.value = '';
    }
  };

  const ins = useCallback((a: string) => {
    if (a === 'upload-image') {
      contentImageInputRef.current?.click();
      return;
    }
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd, sel = content.substring(s, e);
    let i = '';
    if (a === 'bold') i = `**${sel || 'teks tebal'}**`;
    else if (a === 'italic') i = `*${sel || 'teks miring'}*`;
    else if (a === 'h2') i = '\n## ' + (sel || 'Heading 2') + '\n';
    else if (a === 'h3') i = '\n### ' + (sel || 'Heading 3') + '\n';
    else if (a === 'quote') i = '\n> ' + (sel || 'kutipan') + '\n';
    else if (a === 'ul') i = '\n- ' + (sel || 'item') + '\n';
    else if (a === 'code') i = sel.includes('\n') ? '\n```\n' + sel + '\n```\n' : '`' + (sel || 'kode') + '`';
    else if (a === 'link') i = `[${sel || 'teks'}](https://)`;
    else if (a === 'image') i = '\n![' + (sel || 'alt') + '](url)\n';
    else if (a === 'hr') i = '\n---\n';
    else return;
    setContent(content.substring(0, s) + i + content.substring(e));
    setTimeout(() => { ta.focus(); const c = s + i.length; ta.setSelectionRange(c, c); }, 0);
  }, [content]);

  const save = async (ps: 'draft' | 'published') => {
    if (!title.trim()) { setMsg({ t: 'Judul wajib diisi.', s: false }); return; }
    if (!content.trim()) { setMsg({ t: 'Konten wajib diisi.', s: false }); return; }
    setSaving(true); setMsg(null);
    try {
      const b: Record<string, unknown> = { title: title.trim(), slug: slug.trim() || slugify(title), excerpt: excerpt.trim(), content, cover_url: coverUrl.trim() || null, status: ps };
      if (!isNew && post?.id) b.id = post.id;
      const r = await fetch('/api/admin/blog', { method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'Gagal menyimpan.');
      setMsg({ t: ps === 'published' ? 'Artikel dipublikasikan!' : 'Draft disimpan!', s: true });
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { type: 'success', message: ps === 'published' ? 'Artikel dipublikasikan!' : 'Draft disimpan!' } }));
      if (isNew && j.post?.id) setTimeout(() => { window.location.href = `/dashboard/blog/${j.post.id}`; }, 800);
    } catch (err) { setMsg({ t: err instanceof Error ? err.message : 'Gagal menyimpan.', s: false }); }
    finally { setSaving(false); }
  };

  const wc = content.split(/\s+/).filter(Boolean).length;

  return (<div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Hidden file inputs */}
      <input ref={coverInputRef} type="file" accept="image/*" onChange={onCoverFileChange} style={{ display: 'none' }} />
      <input ref={contentImageInputRef} type="file" accept="image/*" onChange={onContentImageChange} style={{ display: 'none' }} />
    <div className="field"><label className="field-label">Judul Artikel</label><input type="text" value={title} onChange={e => chTitle(e.target.value)} placeholder="Judul artikel..." maxLength={200} style={iS}/></div>
    <div className="field"><label className="field-label">Slug URL <span style={{ fontWeight: 400, fontSize: '.75rem', color: '#6b6178' }}>/blog/{slug || '...'}</span></label><input type="text" value={slug} onChange={e => { setSlugM(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); }} placeholder="slug-artikel" style={iS}/></div>
    <div className="field">
        <label className="field-label">Gambar Cover Artikel</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={uploadingCover}
              onClick={() => coverInputRef.current?.click()}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: '1px solid #7048e8',
                background: '#7048e8',
                color: '#fff',
                fontWeight: 700,
                fontSize: '.85rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                opacity: uploadingCover ? 0.6 : 1
              }}
            >
              📁 {uploadingCover ? 'Mengunggah...' : coverUrl ? 'Ganti File Gambar' : 'Upload File Gambar'}
            </button>

            {coverUrl && (
              <button
                type="button"
                onClick={() => setCoverUrl('')}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid #fee2e2',
                  background: '#fef2f2',
                  color: '#ef4444',
                  fontWeight: 700,
                  fontSize: '.85rem',
                  cursor: 'pointer'
                }}
              >
                🗑️ Hapus Cover
              </button>
            )}
          </div>

          <div style={{ fontSize: '.78rem', color: '#6b6178' }}>
            Atau masukan URL gambar secara langsung:
          </div>
          <input
            type="text"
            value={coverUrl}
            onChange={e => setCoverUrl(e.target.value)}
            placeholder="https://example.com/gambar.jpg"
            style={iS}
          />

          {coverUrl && (
            <div style={{ marginTop: 6, borderRadius: 12, overflow: 'hidden', border: '1px solid #eae3f5', position: 'relative' }}>
              <img
                src={coverUrl}
                alt="Cover Preview"
                style={{ width: '100%', maxHeight: 240, objectFit: 'cover' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}
        </div>
      </div>
    <div className="field"><label className="field-label">Ringkasan <span style={{ fontWeight: 400, fontSize: '.75rem', color: '#6b6178' }}>(tampil di daftar blog)</span></label><textarea value={excerpt} onChange={e => setExcerpt(e.target.value)} placeholder="Ringkasan singkat artikel..." rows={2} maxLength={300} style={{ ...iS, resize: 'vertical' as const }}/></div>
    <div className="field">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <label className="field-label" style={{ margin: 0 }}>Konten Artikel</label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: '.75rem', color: '#6b6178' }}>{wc} kata · {Math.max(1, Math.ceil(wc / 200))} mnt baca</span>
          <button type="button" onClick={() => setPrev(!prev)} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid #eae3f5', background: prev ? '#7048e8' : '#fff', color: prev ? '#fff' : '#6b6178', fontSize: '.78rem', fontWeight: 700, cursor: 'pointer' }}>{prev ? 'Edit' : 'Preview'}</button>
        </div>
      </div>
      {!prev && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 10px', background: '#faf8fe', border: '1px solid #eae3f5', borderBottom: 'none', borderRadius: '12px 12px 0 0', alignItems: 'center' }}>
            {TOOLBAR.map(i => (
              <button
                key={i.action}
                type="button"
                title={i.label}
                disabled={i.action === 'upload-image' && uploadingContent}
                onClick={() => ins(i.action)}
                style={{
                  padding: '5px 10px',
                  border: i.action === 'upload-image' ? '1px solid #7048e8' : 'none',
                  borderRadius: 6,
                  background: i.action === 'upload-image' ? '#f3edff' : 'transparent',
                  cursor: 'pointer',
                  fontSize: '.82rem',
                  fontWeight: 700,
                  color: i.action === 'upload-image' ? '#7048e8' : '#6b6178'
                }}
              >
                {i.action === 'upload-image' && uploadingContent ? 'Mengunggah Gambar...' : i.icon}
              </button>
            ))}
          </div>
        )}
      {prev ? <div style={{ padding: 24, border: '1px solid #eae3f5', borderRadius: 12, background: '#fff', minHeight: 300, fontSize: '.95rem', lineHeight: 1.8 }} dangerouslySetInnerHTML={{ __html: md2html(content) }}/> : <textarea ref={taRef} value={content} onChange={e => setContent(e.target.value)} onKeyDown={e => { if (e.ctrlKey && e.key === 'b') { e.preventDefault(); ins('bold'); } if (e.ctrlKey && e.key === 'i') { e.preventDefault(); ins('italic'); } }} placeholder={'Tulis konten (Markdown)...\n\n## Heading\n**Bold** dan *italic*\n- Bullet list\n> Quote\n\nKlik tombol "🖼️ Upload Gambar" di atas untuk memasukkan gambar langsung dari file.'} style={{ ...iS, minHeight: 400, resize: 'vertical' as const, fontFamily: "'SF Mono','Fira Code',monospace", fontSize: '.88rem', lineHeight: 1.7, borderRadius: '0 0 12px 12px' }}/>}
    </div>
    {msg && <div style={{ padding: '12px 16px', borderRadius: 10, fontSize: '.88rem', fontWeight: 600, background: msg.s ? '#ecfdf5' : '#fef2f2', color: msg.s ? '#059669' : '#ef4444', border: `1px solid ${msg.s ? '#a7f3d0' : '#fca5a5'}` }}>{msg.t}</div>}
    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      <a href="/dashboard/blog" style={{ padding: '13px 24px', borderRadius: 12, border: '1px solid #eae3f5', background: '#fff', color: '#6b6178', fontWeight: 700, fontSize: '.9rem', textDecoration: 'none' }}>Batal</a>
      <button type="button" disabled={saving || uploadingCover || uploadingContent} onClick={() => save('draft')} style={{ padding: '13px 24px', borderRadius: 12, border: '1px solid #eae3f5', background: '#fff', color: '#191026', fontWeight: 700, fontSize: '.9rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Menyimpan...' : 'Simpan Draft'}</button>
      <button type="button" disabled={saving || uploadingCover || uploadingContent} onClick={() => save('published')} style={{ padding: '13px 24px', borderRadius: 12, border: 0, background: '#7048e8', color: '#fff', fontWeight: 700, fontSize: '.9rem', cursor: 'pointer', boxShadow: '0 4px 16px rgba(112,72,232,0.25)', opacity: saving ? 0.6 : 1 }}>{saving ? 'Menyimpan...' : status === 'published' ? 'Update & Publish' : 'Publish'}</button>
    </div>
  </div>);
}
