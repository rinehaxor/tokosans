import React, { useRef } from 'react';

const BLOG_CATEGORIES = ['Umum', 'Panduan', 'Tutorial', 'Berita', 'Promo', 'Tips & Trik', 'Edukasi', 'Update'];

const inputStyle: React.CSSProperties = {
  border: '1px solid #eae3f5',
  borderRadius: 12,
  padding: '12px 16px',
  fontSize: '.92rem',
  fontFamily: "'DM Sans', sans-serif",
  color: '#191026',
  background: '#fff',
  width: '100%',
  outline: 'none',
};

interface Props {
  title: string;
  category: string;
  slug: string;
  coverUrl: string;
  excerpt: string;
  uploadingCover: boolean;
  onTitleChange: (val: string) => void;
  onCategoryChange: (val: string) => void;
  onSlugChange: (val: string) => void;
  onCoverUrlChange: (val: string) => void;
  onExcerptChange: (val: string) => void;
  onCoverFileSelected: (file: File) => void;
}

export default function BlogEditorFormFields({
  title,
  category,
  slug,
  coverUrl,
  excerpt,
  uploadingCover,
  onTitleChange,
  onCategoryChange,
  onSlugChange,
  onCoverUrlChange,
  onExcerptChange,
  onCoverFileSelected,
}: Props) {
  const coverInputRef = useRef<HTMLInputElement>(null);
  const categoryList = Array.from(new Set(['Umum', ...BLOG_CATEGORIES, category].filter(Boolean)));

  return (
    <>
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onCoverFileSelected(file);
          if (coverInputRef.current) coverInputRef.current.value = '';
        }}
        style={{ display: 'none' }}
      />

      <div className="field">
        <label className="field-label">Judul Artikel</label>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Judul artikel..."
          maxLength={200}
          style={inputStyle}
        />
      </div>

      <div className="field">
        <label className="field-label">Kategori Artikel</label>
        <select value={category} onChange={(e) => onCategoryChange(e.target.value)} style={inputStyle}>
          {categoryList.map((catName) => (
            <option key={catName} value={catName}>{catName}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="field-label">
          Slug URL <span style={{ fontWeight: 400, fontSize: '.75rem', color: '#6b6178' }}>/blog/{slug || '...'}</span>
        </label>
        <input
          type="text"
          value={slug}
          onChange={(e) => onSlugChange(e.target.value)}
          placeholder="slug-artikel"
          style={inputStyle}
        />
      </div>

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
                opacity: uploadingCover ? 0.6 : 1,
              }}
            >
              📁 {uploadingCover ? 'Mengunggah...' : coverUrl ? 'Ganti File Gambar' : 'Upload File Gambar'}
            </button>

            {coverUrl && (
              <button
                type="button"
                onClick={() => onCoverUrlChange('')}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid #fee2e2',
                  background: '#fef2f2',
                  color: '#ef4444',
                  fontWeight: 700,
                  fontSize: '.85rem',
                  cursor: 'pointer',
                }}
              >
                🗑️ Hapus Cover
              </button>
            )}
          </div>

          <div style={{ fontSize: '.78rem', color: '#6b6178' }}>Atau masukkan URL gambar secara langsung:</div>
          <input
            type="text"
            value={coverUrl}
            onChange={(e) => onCoverUrlChange(e.target.value)}
            placeholder="https://example.com/gambar.jpg"
            style={inputStyle}
          />

          {coverUrl && (
            <div style={{ marginTop: 6, borderRadius: 12, overflow: 'hidden', border: '1px solid #eae3f5' }}>
              <img
                src={coverUrl}
                alt="Cover Preview"
                style={{ width: '100%', maxHeight: 240, objectFit: 'cover' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="field">
        <label className="field-label">
          Ringkasan <span style={{ fontWeight: 400, fontSize: '.75rem', color: '#6b6178' }}>(tampil di daftar blog)</span>
        </label>
        <textarea
          value={excerpt}
          onChange={(e) => onExcerptChange(e.target.value)}
          placeholder="Ringkasan singkat artikel..."
          rows={2}
          maxLength={300}
          style={{ ...inputStyle, resize: 'vertical' as const }}
        />
      </div>
    </>
  );
}
