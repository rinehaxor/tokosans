import React from 'react';

interface Props {
  saving: boolean;
  uploadingCover: boolean;
  uploadingContentImage: boolean;
  status: 'draft' | 'published';
  onSave: (targetStatus: 'draft' | 'published') => void;
}

export default function BlogEditorActions({
  saving,
  uploadingCover,
  uploadingContentImage,
  status,
  onSave,
}: Props) {
  const disabled = saving || uploadingCover || uploadingContentImage;

  return (
    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      <a
        href="/dashboard/blog"
        style={{
          padding: '13px 24px',
          borderRadius: 12,
          border: '1px solid #eae3f5',
          background: '#fff',
          color: '#6b6178',
          fontWeight: 700,
          fontSize: '.9rem',
          textDecoration: 'none',
        }}
      >
        Batal
      </a>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onSave('draft')}
        style={{
          padding: '13px 24px',
          borderRadius: 12,
          border: '1px solid #eae3f5',
          background: '#fff',
          color: '#191026',
          fontWeight: 700,
          fontSize: '.9rem',
          cursor: 'pointer',
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? 'Menyimpan...' : 'Simpan Draft'}
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onSave('published')}
        style={{
          padding: '13px 24px',
          borderRadius: 12,
          border: 0,
          background: '#7048e8',
          color: '#fff',
          fontWeight: 700,
          fontSize: '.9rem',
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(112,72,232,0.25)',
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? 'Menyimpan...' : status === 'published' ? 'Update & Publish' : 'Publish'}
      </button>
    </div>
  );
}
