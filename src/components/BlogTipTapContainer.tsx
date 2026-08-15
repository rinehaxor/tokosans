import React from 'react';
import { EditorContent, type Editor } from '@tiptap/react';
import BlogEditorToolbar from './BlogEditorToolbar';


interface Props {
  editor: Editor | null;
  wordCount: number;
  uploadingContentImage: boolean;
  onUploadClick: () => void;
  onSetLink: () => void;
}

export default function BlogTipTapContainer({
  editor,
  wordCount,
  uploadingContentImage,
  onUploadClick,
  onSetLink,
}: Props) {
  return (
    <div className="field">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <label className="field-label" style={{ margin: 0 }}>Konten Artikel</label>
        <span style={{ fontSize: '.75rem', color: '#6b6178' }}>
          {wordCount} kata · {Math.max(1, Math.ceil(wordCount / 200))} mnt baca
        </span>
      </div>

      <div style={{ border: '1px solid #eae3f5', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
        <BlogEditorToolbar
          editor={editor}
          uploadingContentImage={uploadingContentImage}
          onUploadClick={onUploadClick}
          onSetLink={onSetLink}
        />
        <div className="tiptap-wrapper" style={{ padding: '16px 20px', minHeight: 350 }}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
