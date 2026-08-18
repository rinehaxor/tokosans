import type { WASocket } from '@whiskeysockets/baileys';
import { getProducts, type ManagedProduct } from './products';
import { getProductPackages, getDefaultProductPackage } from './packages';
import { getSupabaseAdmin } from './supabase';
import { waDebug } from './wa-debug';
import { getRuntime } from './wa-client';

/**
 * Kirim balasan WhatsApp dengan fallback ke socket runtime aktif jika socket awal stale.
 */
async function sendReplyWithFallback(initialSocket: WASocket, jid: string, text: string): Promise<void> {
  try {
    await initialSocket.sendMessage(jid, { text });
    waDebug('handler', 'balasan terkirim via initial socket ke', jid);
    return;
  } catch (initialErr) {
    waDebug('handler', 'Gagal kirim balasan via initial socket, mencoba runtime socket fallback...', initialErr);
  }

  // Fallback: ambil socket terbaru dari global runtime
  const startTime = Date.now();
  while (Date.now() - startTime < 8000) {
    const rt = getRuntime();
    if (rt.state === 'open' && rt.socket) {
      try {
        await rt.socket.sendMessage(jid, { text });
        waDebug('handler', 'balasan terkirim via fallback runtime socket ke', jid);
        return;
      } catch (retryErr) {
        waDebug('handler', 'Retry kirim balasan fallback error:', retryErr);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Gagal mengirim balasan ke ${jid} setelah retry fallback.`);
}

/**
 * Modul perintah stok via WhatsApp.
 *
 * Hanya admin yang berwenang (DM 1:1) yang mengirim pesan teks ke nomor WA bot
 * (Baileys di wa-client.ts) untuk menambah / mengambil stok akun tanpa membuka
 * dashboard — berguna untuk order manual. Pengirim divalidasi via whitelist:
 * nomor HP (ADMIN_WA_COMMAND_NUMBERS) untuk pesan @s.whatsapp.net, atau LID
 * (ADMIN_WA_LIDS) untuk pesan @lid (mode privasi WhatsApp). Pesan dari nomor
 * bot sendiri (fromMe) diabaikan demi mencegah loop balasan, grup/broadcast ditolak.
 *
 * Perintah (tidak case-sensitive):
 *   menu | help | bantuan | ?            → daftar perintah
 *   stok | stok <produk>                 → cek sisa stok
 *   tambah <produk> <login>|<password>   → tambah 1 akun (boleh beberapa baris)
 *   ambil <produk> [jumlah]              → ambil N akun (dibalas dgn kredensial)
 *
 * Catatan desain:
 * - Tidak ada import runtime baileys (hanya `import type`) supaya modul ini aman
 *   dievaluasi tanpa membebani build/waktu-muat.
 * - Akun yang "diambil" ditandai status='sold' + sold_at=now + assigned_order_id=null
 *   (aman terhadap FK orders(id), keluar dari stok available, & tetap tersimpan
 *   sebagai audit "terjual manual").
 */

const ADD_CMDS = new Set(['tambah', 'add', 'nambah', 'isi', 'tambahin']);
const TAKE_CMDS = new Set(['ambil', 'take', 'tarik', 'ngambil', 'ambilin']);
const STOCK_CMDS = new Set(['stok', 'stock', 'cek', 'list', 'sisa']);
const HELP_CMDS = new Set(['menu', 'help', 'bantuan', '?', 'helpme']);

/** Maksimal akun yang dapat diambil dalam satu perintah (cegah spam / lupa angka). */
const MAX_TAKE = 50;

/** Nomor WhatsApp admin yang berwenang mengirim perintah (format internasional tanpa "+"). */
export function getAdminCommandNumbers(): string[] {
  const raw = (process.env.ADMIN_WA_COMMAND_NUMBERS || (import.meta as any).env?.ADMIN_WA_COMMAND_NUMBERS || '').trim();
  const nums = raw
    ? raw.split(/[\s,;]+/).map((s: string) => s.replace(/[^0-9]/g, '')).filter((s: string) => s.length >= 8)
    : [];
  if (nums.length) return nums;
  // Fallback ke ADMIN_WA_NUMBER (notifikasi) bila var perintah belum diisi.
  const single = (process.env.ADMIN_WA_NUMBER || (import.meta as any).env?.ADMIN_WA_NUMBER || '').trim();
  const d = single.replace(/[^0-9]/g, '');
  return d.length >= 8 ? [d] : [];
}

/**
 * Daftar LID admin yang berwenang mengirim perintah (identifier WhatsApp privacy,
 * tanpa "@lid" — mis. "133994389749823,8091819098185"). Dipakai untuk memvalidasi
 * pesan DM yang masuk berbentuk @lid. Bila kosong, semua DM @lid diterima (fallback
 * open-DM agar tidak mengunci admin saat env belum diset).
 */
export function getAdminCommandLids(): string[] {
  const raw = (process.env.ADMIN_WA_LIDS || (import.meta as any).env?.ADMIN_WA_LIDS || '').trim();
  if (!raw) return [];
  return raw
    .split(/[\s,;]+/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0);
}

/**
 * Apakah pengirim (DM 1:1) termasuk admin yang berwenang?
 *
 * Pesan DM masuk dalam dua bentuk tergantung mode privasi WhatsApp pengirim:
 *  - `@s.whatsapp.net` → cocokkan nomor HP terhadap ADMIN_WA_COMMAND_NUMBERS.
 *  - `@lid`            → cocokkan LID terhadap ADMIN_WA_LIDS (identifier stabil
 *                        per pasangan pengirim–penerima).
 * Grup (`@g.us`) & broadcast selalu ditolak. Bila daftar terkait kosong, DM bentuk
 * itu tetap diterima (fallback open-DM agar tidak mengunci admin saat env belum diset).
 */
export function isAuthorizedSender(remoteJid: string | undefined | null): boolean {
  if (!remoteJid) return false;
  if (remoteJid.endsWith('@s.whatsapp.net')) {
    const num = remoteJid.split('@')[0].replace(/[^0-9]/g, '');
    if (!num) return false;
    const auth = getAdminCommandNumbers();
    if (!auth.length) return true; // fallback open-DM bila belum dikonfigurasi
    if (auth.includes(num)) return true;
    // Toleransi perbedaan kode negara (bandingkan 11 digit terakhir).
    const tail = num.slice(-11);
    return auth.some((a) => a.slice(-11) === tail);
  }
  if (remoteJid.endsWith('@lid')) {
    const lid = remoteJid.split('@')[0];
    const lids = getAdminCommandLids();
    if (!lids.length) return true; // fallback open-DM bila belum dikonfigurasi
    return lids.includes(lid);
  }
  return false; // grup (@g.us) / broadcast / format lain
}

function extractText(msg: any): string | null {
  if (!msg?.message) return null;
  const m = msg.message;
  if (typeof m.conversation === 'string' && m.conversation.trim()) return m.conversation;
  const ext = m.extendedTextMessage;
  if (ext && typeof ext.text === 'string' && ext.text.trim()) return ext.text;
  return null;
}

/** Entry point — dipanggil dari listener `messages.upsert` di wa-client.ts. */
export async function handleIncomingWaMessage(socket: WASocket, msg: any): Promise<void> {
  try {
    const fromMe = msg?.key?.fromMe;
    const jid: string | undefined = msg?.key?.remoteJid;
    waDebug('handler', 'masuk — fromMe=', fromMe, 'jid=', jid);
    if (fromMe) {
      // WAJIB: cegah loop — bot tidak boleh memproses balasannya sendiri
      waDebug('handler', 'SKIP — fromMe (pesan dari bot sendiri, cegah loop)');
      return;
    }
    // Hanya DM admin yang berwenang (HP @s.whatsapp.net atau LID @lid); tolak grup/broadcast.
    if (!jid || !(jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid'))) {
      waDebug('handler', 'SKIP — jid bukan DM (@s.whatsapp.net / @lid):', jid);
      return;
    }
    const authed = isAuthorizedSender(jid);
    waDebug(
      'handler',
      'isAuthorizedSender=',
      authed,
      '| ADMIN_WA_COMMAND_NUMBERS=',
      getAdminCommandNumbers().join(','),
      '| ADMIN_WA_LIDS=',
      getAdminCommandLids().join(','),
    );
    if (!authed) {
      waDebug('handler', 'SKIP — pengirim tidak terdaftar sebagai admin');
      return;
    }

    // Hindari memproses back-log pesan lama saat reconnect.
    const ts = msg.messageTimestamp as number | undefined;
    const ageMs = typeof ts === 'number' && ts > 0 ? Date.now() - ts * 1000 : 0;
    waDebug('handler', 'messageTimestamp=', ts, 'ageMs=', ageMs);
    if (ageMs > 5 * 60 * 1000) {
      waDebug('handler', 'SKIP — pesan lebih dari 5 menit lalu (back-log reconnect)');
      return;
    }

    const text = extractText(msg)?.trim();
    waDebug('handler', 'text=', text ? text.slice(0, 100) : null);
    if (!text) {
      waDebug('handler', 'SKIP — tidak ada teks bisa diekstrak. contentKeys=', Object.keys(msg?.message ?? {}));
      return;
    }

    const reply = await runCommand(text);
    waDebug('handler', 'runCommand reply length=', reply ? reply.length : 0);
    if (reply) {
      await sendReplyWithFallback(socket, jid as string, reply);
    } else {
      waDebug('handler', 'tidak ada balasan (runCommand return kosong)');
    }
  } catch (err) {
    waDebug('handler', 'ERROR:', err);
    console.error('[WA] handleIncomingWaMessage error:', err);
  }
}

/**
 * Normalisasi kata perintah: buang awalan prefix populer (/, !, ., #) lalu
 * lowercasing, sehingga "/stok", "!menu", ".cek" diperlakukan sama dengan
 * "stok", "menu", "cek". Hanya dijatuhkan pada token perintah (parts[0]),
 * argumen setelahnya tidak tersentuh.
 */
function normalizeCmd(raw: string): string {
  return raw.replace(/^[\/!#.]+/, '').toLowerCase();
}

async function runCommand(text: string): Promise<string> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return '';
  const cmd = normalizeCmd(lines[0].split(/\s+/)[0] || '');

  if (HELP_CMDS.has(cmd)) return buildHelp();
  if (STOCK_CMDS.has(cmd)) return await cmdStock(lines[0]);
  if (ADD_CMDS.has(cmd)) return await cmdTambah(lines);
  if (TAKE_CMDS.has(cmd)) return await cmdAmbil(lines[0]);
  return buildHelp(`Perintah tidak dikenali: "${cmd}".`);
}

function matchProducts(products: ManagedProduct[], query: string): ManagedProduct[] {
  const q = query.toLowerCase().trim();
  if (!q) return products;
  let m = products.filter((p) => p.id.toLowerCase() === q);
  if (m.length) return m;
  m = products.filter((p) => p.name.toLowerCase().includes(q));
  if (m.length) return m;
  return products.filter((p) => p.id.toLowerCase().includes(q));
}

function matchSingleProduct(products: ManagedProduct[], query: string): { product?: ManagedProduct; error?: string } {
  const m = matchProducts(products, query);
  if (m.length === 1) return { product: m[0] };
  if (m.length === 0) return { error: `Produk "${query}" tidak ditemukan. Ketik "stok" untuk lihat daftar.` };
  return { error: `Banyak produk cocok: ${m.map((p) => p.name).join(', ')} — tulis lebih spesifik.` };
}

async function getAvailableCounts(productIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!productIds.length) return map;
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('account_inventory')
      .select('product_id')
      .in('product_id', productIds)
      .eq('status', 'available');
    if (error) throw error;
    for (const row of data ?? []) map.set(row.product_id, (map.get(row.product_id) ?? 0) + 1);
  } catch (e) {
    console.error('[WA] getAvailableCounts error:', e);
  }
  return map;
}

async function getAvailableCount(productId: string): Promise<number> {
  try {
    const db = getSupabaseAdmin();
    const { count, error } = await db
      .from('account_inventory')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', productId)
      .eq('status', 'available');
    if (error) throw error;
    return count ?? 0;
  } catch (e) {
    console.error('[WA] getAvailableCount error:', e);
    return 0;
  }
}

/** Sinkronkan kolom stock di tabel inventory (sama dgn logika syncStock di accounts.ts). */
async function syncProductStock(productId: string): Promise<void> {
  const db = getSupabaseAdmin();
  const { count, error } = await db
    .from('account_inventory')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId)
    .eq('status', 'available');
  if (error) throw error;
  const { error: syncError } = await db
    .from('inventory')
    .update({ stock: count ?? 0, updated_at: new Date().toISOString() })
    .eq('product_id', productId);
  if (syncError) throw syncError;
}

// ---------------------- stok ----------------------

async function cmdStock(firstLine: string): Promise<string> {
  const arg = firstLine.split(/\s+/).slice(1).join(' ').trim();
  const products = await getProducts();
  const matched = arg ? matchProducts(products, arg) : products;
  if (!matched.length) return `❌ Produk "${arg}" tidak ditemukan.\n\nKetik: stok\n(untuk lihat semua produk)`;
  const counts = await getAvailableCounts(matched.map((p) => p.id));
  const rows = matched.map((p) => {
    const c = counts.get(p.id) ?? 0;
    const tag = c === 0 ? ' ⚠️ habis' : c <= 2 ? ' ⚠️ menipis' : '';
    return `• ${p.name} — ${c} akun${tag}`;
  });
  return [
    '📦 *Daftar Stok*',
    '',
    ...rows,
    '',
    '_Ketik: tambah <produk> <login>|<password>_',
    '_atau: ambil <produk> [jumlah]_',
  ].join('\n');
}

// ---------------------- tambah ----------------------

function parseCredential(s: string): { login: string; password: string } | null {
  const str = s.trim();
  if (!str) return null;
  let sep: string | null = null;
  if (str.includes('\t')) sep = '\t';
  else if (str.includes('|')) sep = '|';
  else if (str.includes(':')) sep = ':';
  else if (str.includes(',')) sep = ',';
  if (sep) {
    const idx = str.indexOf(sep);
    const login = str.slice(0, idx).trim();
    const password = str.slice(idx + 1).trim();
    return login && password ? { login, password } : null;
  }
  // Tidak ada delimiter: pisah 2 token spasi.
  const tokens = str.split(/\s+/);
  return tokens.length === 2 ? { login: tokens[0], password: tokens[1] } : null;
}

async function cmdTambah(lines: string[]): Promise<string> {
  const products = await getProducts();
  const byProduct = new Map<string, { login: string; password: string }[]>();
  const notFound = new Set<string>();
  let invalid = 0;

  for (const line of lines) {
    const parts = line.split(/\s+/);
    const cmd = normalizeCmd(parts[0] || '');
    if (!ADD_CMDS.has(cmd)) continue;
    if (parts.length < 3) { invalid++; continue; }
    const query = parts[1];
    const credStr = parts.slice(2).join(' ');
    const cred = parseCredential(credStr);
    if (!cred) { invalid++; continue; }
    const match = matchSingleProduct(products, query);
    if (!match.product) { notFound.add(`${query} → ${match.error ?? 'tidak ditemukan'}`); continue; }
    const pid = match.product.id;
    if (!byProduct.has(pid)) byProduct.set(pid, []);
    byProduct.get(pid)!.push(cred);
  }

  if (!byProduct.size) {
    const extra = invalid ? `\n\nBaris tidak valid: ${invalid}` : '';
    const nf = notFound.size ? `\n\nProduk tidak ditemukan:\n${[...notFound].map((s) => '• ' + s).join('\n')}` : '';
    return `❌ Tidak ada akun valid untuk ditambahkan.${extra}${nf}\n\nContoh:\ntambah canva user@gmail.com|pass123`;
  }

  const db = getSupabaseAdmin();
  const summaries: string[] = [];
  let totalAdded = 0;

  for (const [pid, creds] of byProduct) {
    const product = products.find((p) => p.id === pid)!;
    const packages = await getProductPackages(product);
    const defaultPkg = getDefaultProductPackage(product, packages);
    // Paket default (uuid) bila produk punya paket eksplisit; null untuk produk legacy.
    const packageId = defaultPkg && defaultPkg.id !== product.id ? defaultPkg.id : null;
    const rows = creds.map((c) => ({
      product_id: pid,
      package_id: packageId,
      login: c.login,
      password: c.password,
      status: 'available' as const,
    }));
    const { data, error } = await db.from('account_inventory').insert(rows).select('login');
    if (error) {
      summaries.push(`❌ ${product.name}: gagal — ${error.message}`);
      continue;
    }
    await syncProductStock(pid);
    const count = data?.length ?? rows.length;
    totalAdded += count;
    const remaining = await getAvailableCount(pid);
    summaries.push(`✅ ${product.name}: +${count} akun (sisa ${remaining})`);
  }

  const nf = notFound.size ? `\n\nProduk tidak ditemukan:\n${[...notFound].map((s) => '• ' + s).join('\n')}` : '';
  const skip = invalid ? `\nBaris dilewati: ${invalid}` : '';
  return [`📝 *Stok ditambahkan* (${totalAdded} akun)`, '', ...summaries, skip, nf]
    .filter(Boolean)
    .join('\n')
    .trim();
}

// ---------------------- ambil ----------------------

async function cmdAmbil(firstLine: string): Promise<string> {
  const parts = firstLine.split(/\s+/);
  if (parts.length < 2) return '❌ Format: ambil <produk> [jumlah]\nContoh: ambil netflix 2';
  const query = parts[1];
  let qty = 1;
  if (parts[2]) {
    const n = parseInt(parts[2], 10);
    if (!Number.isFinite(n) || n < 1) return `❌ Jumlah tidak valid: "${parts[2]}".`;
    if (n > MAX_TAKE) return `❌ Maksimal ambil ${MAX_TAKE} akun sekaligus. Untuk lebih, lakukan bertahap.`;
    qty = n;
  }
  const products = await getProducts();
  const match = matchSingleProduct(products, query);
  if (!match.product) return `❌ ${match.error}`;

  const product = match.product;
  const db = getSupabaseAdmin();
  const { data: avail, error: availErr } = await db
    .from('account_inventory')
    .select('id,login,password')
    .eq('product_id', product.id)
    .eq('status', 'available')
    .is('assigned_order_id', null)
    .order('created_at', { ascending: true })
    .limit(qty);
  if (availErr) throw availErr;
  const ids = (avail ?? []).map((a: any) => a.id);
  if (!ids.length) return `❌ Stok ${product.name} habis (sisa 0).`;

  const now = new Date().toISOString();
  const { data: claimed, error: claimErr } = await db
    .from('account_inventory')
    .update({ status: 'sold', sold_at: now })
    .in('id', ids)
    .eq('status', 'available')
    .select('login,password');
  if (claimErr) throw claimErr;
  const taken = claimed ?? [];
  await syncProductStock(product.id);
  const remaining = await getAvailableCount(product.id);

  if (!taken.length) return `⚠️ Stok ${product.name} baru saja habis (diambil transaksi lain). Sisa 0.`;

  const list = taken.map((a: any, i: number) => `${i + 1}. ${a.login} | ${a.password}`).join('\n');
  const more = taken.length < qty ? `\n\n⚠️ Hanya ${taken.length} akun tersedia (diminta ${qty}).` : '';
  return [
    '📤 *Stok diambil (manual)*',
    '',
    `Produk: ${product.name}`,
    `Jumlah: ${taken.length}`,
    `Sisa stok: ${remaining} akun`,
    '',
    'Akun:',
    list,
    more,
  ]
    .join('\n')
    .trim();
}

// ---------------------- help ----------------------

function buildHelp(prefix?: string): string {
  const head = prefix ? `⚠️ ${prefix}\n\n` : '';
  return [
    `${head}🤖 *Perintah Stok via WA*`,
    '',
    'Kelola stok akun langsung dari WA — tanpa buka web.',
    '',
    '• tambah <produk> <login>|<password>',
    '  Tambah 1 akun. Bisa kirim beberapa baris sekaligus.',
    '   Contoh:',
    '   tambah canva user@gmail.com|pass123',
    '',
    '• ambil <produk> [jumlah]',
    '   Ambil akun untuk order manual. Bot balas dgn kredensial.',
    '   Contoh: ambil netflix 2',
    '   (ambil 1 bila jumlah dikosongkan)',
    '',
    '• stok',
    '   Lihat sisa stok semua produk.',
    '',
    '• stok <produk>',
    '   Lihat stok produk tertentu.',
    '',
    'Nama produk boleh ditulis sebagian (mis. "canva", "netflix").',
    '— tokosans',
  ].join('\n');
}