import React from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold, Italic, Heading2, Heading3, List, ListOrdered, Quote,
  Code, Link as LinkIcon, Image as ImageIcon, Minus, Undo, Redo
} from 'lucide-react';

interface Props {
  editor: Editor | null;
  uploadingContentImage: boolean;
  onUploadClick: () => void;
  onSetLink: () => void;
}

export default function BlogEditorToolbar({
  editor,
  uploadingContentImage,
  onUploadClick,
  onSetLink,
}: Props) {
  if (!editor) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        padding: '8px 12px',
        background: '#faf8fe',
        borderBottom: '1px solid #eae3f5',
        alignItems: 'center',
      }}
    >
      <button
        type="button"
        title="Bold (Ctrl+B)"
        onClick={() => editor.chain().focus().toggleBold().run()}
        style={tbBtnStyle(editor.isActive('bold'))}
      >
        <Bold size={16} />
      </button>

      <button
        type="button"
        title="Italic (Ctrl+I)"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        style={tbBtnStyle(editor.isActive('italic'))}
      >
        <Italic size={16} />
      </button>

      <div style={dividerStyle} />

      <button
        type="button"
        title="Heading 2"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        style={tbBtnStyle(editor.isActive('heading', { level: 2 }))}
      >
        <Heading2 size={16} />
      </button>

      <button
        type="button"
        title="Heading 3"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        style={tbBtnStyle(editor.isActive('heading', { level: 3 }))}
      >
        <Heading3 size={16} />
      </button>

      <div style={dividerStyle} />

      <button
        type="button"
        title="Bullet List"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        style={tbBtnStyle(editor.isActive('bulletList'))}
      >
        <List size={16} />
      </button>

      <button
        type="button"
        title="Numbered List"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        style={tbBtnStyle(editor.isActive('orderedList'))}
      >
        <ListOrdered size={16} />
      </button>

      <div style={dividerStyle} />

      <button
        type="button"
        title="Quote"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        style={tbBtnStyle(editor.isActive('blockquote'))}
      >
        <Quote size={16} />
      </button>

      <button
        type="button"
        title="Code Block"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        style={tbBtnStyle(editor.isActive('codeBlock'))}
      >
        <Code size={16} />
      </button>

      <button
        type="button"
        title="Link"
        onClick={onSetLink}
        style={tbBtnStyle(editor.isActive('link'))}
      >
        <LinkIcon size={16} />
      </button>

      <button
        type="button"
        title="Upload Gambar ke Artikel"
        disabled={uploadingContentImage}
        onClick={onUploadClick}
        style={{
          ...tbBtnStyle(false),
          background: '#f3edff',
          color: '#7048e8',
          border: '1px solid #d4c8f5',
          padding: '5px 10px',
          gap: 6,
        }}
      >
        <ImageIcon size={16} />
        <span style={{ fontSize: '.78rem', fontWeight: 700 }}>
          {uploadingContentImage ? 'Mengunggah...' : 'Upload Gambar'}
        </span>
      </button>

      <button
        type="button"
        title="Horizontal Rule"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        style={tbBtnStyle(false)}
      >
        <Minus size={16} />
      </button>

      <div style={dividerStyle} />

      <button
        type="button"
        title="Undo"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
        style={tbBtnStyle(false)}
      >
        <Undo size={16} />
      </button>

      <button
        type="button"
        title="Redo"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
        style={tbBtnStyle(false)}
      >
        <Redo size={16} />
      </button>
    </div>
  );
}

function tbBtnStyle(isActive: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px 8px',
    borderRadius: 6,
    border: isActive ? '1px solid #7048e8' : '1px solid transparent',
    background: isActive ? '#f3edff' : 'transparent',
    color: isActive ? '#7048e8' : '#6b6178',
    cursor: 'pointer',
  };
}

const dividerStyle: React.CSSProperties = {
  width: 1,
  height: 20,
  background: '#eae3f5',
  margin: '0 4px',
};
