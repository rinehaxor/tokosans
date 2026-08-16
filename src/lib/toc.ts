export type TocItem = { id: string; text: string; level: 2 | 3 };

export type TocNode = TocItem & { children: TocNode[] };

/**
 * Menyusun daftar isi rata menjadi pohon bertingkat untuk penomoran desimal
 * (mis. "2.1" di bawah bab "2"). h3 digabung ke h2 terdekat sebelumnya;
 * h3 yang muncul sebelum h2 pertama diperlakukan sebagai item akar.
 */
export function buildTocTree(items: TocItem[]): TocNode[] {
  const roots: TocNode[] = [];
  let current: TocNode | null = null;
  for (const item of items) {
    const node: TocNode = { ...item, children: [] };
    if (item.level === 2) {
      roots.push(node);
      current = node;
    } else if (current) {
      current.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/**
 * Menyisipkan atribut id pada setiap heading h2/h3 dalam HTML konten artikel
 * dan mengembalikan daftar isi yang bisa dirender sebagai TOC.
 * Id diduplikasi diberi akhiran -2, -3, dst agar tetap unik.
 */
export function injectHeadingIds(html: string): { html: string; toc: TocItem[] } {
  const toc: TocItem[] = [];
  const used = new Map<string, number>();

  const withIds = html.replace(/<h([23])([^>]*)>([\s\S]*?)<\/h\1>/gi, (match, level: string, attrs: string, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    if (!text) return match;

    const base =
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-') || 'bagian';
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    const id = seen === 0 ? base : `${base}-${seen}`;

    toc.push({ id, text, level: level === '3' ? 3 : 2 });
    const cleanAttrs = attrs.replace(/\s*id\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    return `<h${level} id="${id}"${cleanAttrs}>${inner}</h${level}>`;
  });

  return { html: withIds, toc };
}