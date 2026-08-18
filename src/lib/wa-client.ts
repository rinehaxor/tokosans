import path from 'node:path';
import type { WASocket } from '@whiskeysockets/baileys';
import { handleIncomingWaMessage } from './wa-commands';
import { waDebug } from './wa-debug';

/**
 * Singleton WhatsApp client (Baileys) untuk notifikasi admin.
 *
 * Catatan desain:
 * - State dipasang di `globalThis` agar tahan HMR saat `astro dev` (tidak membuat
 *   banyak koneksi WebSocket duplikat).
 * - Modul `baileys` & `qrcode` di-import dinamis (lazy) sehingga TIDAK dievaluasi
 *   saat `astro build` — koneksi WA hanya dibuat saat runtime membutuhkannya.
 * - Session disimpan di folder `wa-auth/` (lihat .gitignore) sehingga setelah scan
 *   QR sekali, server restart tetap terhubung tanpa scan ulang (sampai sesi kadaluarsa).
 */

export type WaState = 'disconnected' | 'connecting' | 'qr' | 'open' | 'closed';

export interface WaStatus {
  state: WaState;
  /** Data-URL gambar QR (hanya saat state === 'qr'), atau null. */
  qr: string | null;
  lastConnected: string | null;
  adminNumber: string | null;
}

const AUTH_DIR = path.resolve(process.cwd(), 'wa-auth');

interface WaRuntime {
  socket: WASocket | null;
  state: WaState;
  qr: string | null;
  lastConnected: string | null;
  starting: boolean;
  reconnectTimer: NodeJS.Timeout | null;
}

function getRuntime(): WaRuntime {
  const g = globalThis as Record<string, unknown>;
  if (!g.__tokosansWa) {
    g.__tokosansWa = {
      socket: null,
      state: 'disconnected',
      qr: null,
      lastConnected: null,
      starting: false,
      reconnectTimer: null,
    } as WaRuntime;
  }
  return g.__tokosansWa as WaRuntime;
}

/** Logger no-op agar Baileys tidak membanjiri stdout (menggantikan pino). */
const silentLogger = {
  level: 'silent' as const,
  info() {},
  debug() {},
  warn() {},
  error() {},
  trace() {},
  fatal() {},
  child() {
    return silentLogger;
  },
};

/** Nomor WhatsApp admin dari env (format internasional tanpa "+", mis. 6281234567890). */
export function getAdminWaNumber(): string | null {
  const raw = (process.env.ADMIN_WA_NUMBER || (import.meta as any).env?.ADMIN_WA_NUMBER || '').trim();
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, '');
  return digits.length >= 8 ? digits : null;
}

/** Mulai koneksi WA (idempoten — aman dipanggil berulang). */
export async function ensureWaClient(): Promise<void> {
  const rt = getRuntime();
  if (rt.socket || rt.starting) return;
  rt.starting = true;
  try {
    const baileys = await import('@whiskeysockets/baileys');
    const makeWASocket = baileys.default;
    const { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = baileys;

    const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    rt.state = 'connecting';
    rt.qr = null;

    const socket = makeWASocket({
      version,
      auth: authState,
      logger: silentLogger as any,
      printQRInTerminal: false,
      browser: ['tokosans-admin', 'Chrome', '1.0.0'],
      connectTimeoutMs: 20_000,
      markOnlineOnConnect: false,
    });

    rt.socket = socket;

    socket.ev.on('creds.update', saveCreds);

    // Dengarkan pesan masuk untuk perintah stok admin via WA (tambah/ambil stok).
    socket.ev.on('messages.upsert', async (evt: any) => {
      try {
        const { messages, type } = evt ?? {};
        waDebug('upsert', 'event type=', type, 'count=', Array.isArray(messages) ? messages.length : 'n/a');
        if (type !== 'notify' || !Array.isArray(messages)) {
          waDebug('upsert', 'SKIP — type bukan notify atau tidak ada messages');
          return;
        }
        for (const m of messages) {
          const k = m?.key;
          waDebug('upsert', 'msg jid=', k?.remoteJid, 'fromMe=', k?.fromMe, 'contentKeys=', Object.keys(m?.message ?? {}));
          await handleIncomingWaMessage(socket, m).catch((e) => waDebug('upsert', 'handler error:', e));
        }
      } catch (e) {
        waDebug('upsert', 'listener error:', e);
        console.error('[WA] messages.upsert error:', e);
      }
    });

    socket.ev.on('connection.update', (update: any) => {
      const { connection, qr, lastDisconnect } = update ?? {};
      if (qr) {
        rt.qr = qr;
        rt.state = 'qr';
      }
      if (connection === 'connecting') {
        rt.state = 'connecting';
        rt.qr = null;
      }
      if (connection === 'open') {
        rt.qr = null;
        rt.state = 'open';
        rt.lastConnected = new Date().toISOString();
        waDebug('conn', 'OPEN — listener messages.upsert aktif, bot siap menerima pesan admin');
      }
      if (connection === 'close') {
        rt.socket = null;
        rt.qr = null;
        const code: number | undefined = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        rt.state = loggedOut ? 'disconnected' : 'closed';
        rt.starting = false;

        if (rt.reconnectTimer) clearTimeout(rt.reconnectTimer);
        // Reconnect otomatis untuk penutupan transien (bukan logout manual).
        if (!loggedOut) {
          rt.reconnectTimer = setTimeout(() => {
            rt.reconnectTimer = null;
            ensureWaClient().catch((e) => console.error('[WA] auto-reconnect error:', e));
          }, 4000);
        }
      }
    });
  } catch (err) {
    console.error('[WA] ensureWaClient error:', err);
    rt.state = 'disconnected';
    rt.starting = false;
  }
}

export function getWaStatus(): WaStatus {
  const rt = getRuntime();
  return {
    state: rt.state,
    qr: null,
    lastConnected: rt.lastConnected,
    adminNumber: getAdminWaNumber(),
  };
}

let cachedQr: string | null = null;
let cachedQrDataUrl: string | null = null;

/** Konversi QR string terbaru menjadi data-URL gambar PNG (dengan cache). */
export async function getQrDataUrl(): Promise<string | null> {
  const rt = getRuntime();
  if (!rt.qr) {
    cachedQr = null;
    cachedQrDataUrl = null;
    return null;
  }
  if (rt.qr === cachedQr && cachedQrDataUrl) return cachedQrDataUrl;
  try {
    const QRCode = (await import('qrcode')).default;
    cachedQrDataUrl = await QRCode.toDataURL(rt.qr, { margin: 1, width: 360 });
    cachedQr = rt.qr;
    return cachedQrDataUrl;
  } catch (err) {
    console.error('[WA] QR render error:', err);
    return null;
  }
}

/** Putuskan socket TANPA logout (untuk reconnect pakai session lama). */
export async function reconnectWa(): Promise<void> {
  const rt = getRuntime();
  if (rt.reconnectTimer) {
    clearTimeout(rt.reconnectTimer);
    rt.reconnectTimer = null;
  }
  if (rt.socket) {
    try {
      rt.socket.end(undefined as any);
    } catch {
      /* ignore */
    }
    rt.socket = null;
  }
  rt.starting = false;
  rt.qr = null;
  rt.state = 'disconnected';
  await ensureWaClient();
}

/** Logout penuh — invalidate session (admin harus scan QR lagi untuk connect). */
export async function disconnectWa(): Promise<void> {
  const rt = getRuntime();
  if (rt.reconnectTimer) {
    clearTimeout(rt.reconnectTimer);
    rt.reconnectTimer = null;
  }
  rt.starting = false;
  if (rt.socket) {
    try {
      await rt.socket.logout();
    } catch {
      /* ignore */
    }
    try {
      rt.socket.end(undefined as any);
    } catch {
      /* ignore */
    }
    rt.socket = null;
  }
  rt.qr = null;
  rt.state = 'disconnected';
}

/**
 * Daftar JID tujuan notifikasi admin, dibaca dari env `ADMIN_WA_NOTIFY_JIDS`
 * (dipisah koma). Mendukung campuran `@s.whatsapp.net` (nomer HP) dan `@lid`
 * (LID privasi WhatsApp) — penting karena sebagian admin hanya LID-nya yang
 * diketahui. Bila env kosong, fallback ke `ADMIN_WA_NUMBER@s.whatsapp.net`
 * (kompatibilitas lama).
 *
 * CATATAN PENTING: jangan mengisi target dengan nomer bot sendiri — WhatsApp
 * tidak mengantar pesan ke akun sendiri, sehingga notifikasi tak sampai ke
 * admin mana pun (ini akar masalah lama: ADMIN_WA_NUMBER = nomer bot).
 */
export function getAdminNotifyJids(): string[] {
  const raw = (process.env.ADMIN_WA_NOTIFY_JIDS || (import.meta as any).env?.ADMIN_WA_NOTIFY_JIDS || '').trim();
  const jids = raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  if (jids.length) return jids;
  const num = getAdminWaNumber();
  return num ? [`${num}@s.whatsapp.net`] : [];
}

/**
 * Kirim pesan teks ke SEMUA admin (daftar JID dari `getAdminNotifyJids`).
 * Aman dipanggil walau belum terhubung (akan memicu `ensureWaClient`); bila
 * masih belum open setelah upaya, dikembalikan false. Mengirim berurutan ke
 * tiap JID; mengembalikan true bila minimal satu terkirim.
 */
export async function sendAdminNotification(text: string): Promise<boolean> {
  const rt = getRuntime();
  const jids = getAdminNotifyJids();
  if (!jids.length) {
    console.warn('[WA] ADMIN_WA_NOTIFY_JIDS belum dikonfigurasi — notifikasi dilewati.');
    return false;
  }
  if (rt.state !== 'open' || !rt.socket) {
    await ensureWaClient();
    if (rt.state !== 'open' || !rt.socket) return false;
  }
  let anySent = false;
  for (const jid of jids) {
    try {
      await rt.socket.sendMessage(jid, { text });
      anySent = true;
    } catch (err) {
      console.error(`[WA] sendAdminNotification error ke ${jid}:`, err);
    }
  }
  return anySent;
}

export interface OrderPaidDetails {
  orderNumber: string;
  customerName: string;
  productName: string;
  amount: number;
}

/** Kirim notifikasi penjualan baru ke admin. Fire-and-forget friendly. */
export async function notifyAdminOrderPaid(details: OrderPaidDetails): Promise<boolean> {
  const rupiah = Number(details.amount || 0).toLocaleString('id-ID');
  const text = [
    '🛒 *PENJUALAN BARU*',
    '',
    `No. Pesanan: ${details.orderNumber}`,
    `Pelanggan: ${details.customerName || '-'}`,
    `Produk: ${details.productName || '-'}`,
    `Total: Rp ${rupiah}`,
    '',
    '✅ Akun sedang diproses & dikirim via email otomatis.',
    '— tokosans',
  ].join('\n');
  return sendAdminNotification(text);
}

/**
 * Kirim notifikasi stok menipis / habis ke admin.
 *
 * Logika "kapan kirim" ada di caller (webhook) — fungsi ini hanya memformat &
 * mengirim pesan. `remainingStock` = jumlah akun available tersisa.
 */
export async function notifyAdminLowStock(productName: string, remainingStock: number): Promise<boolean> {
  const isOutOfStock = remainingStock === 0;
  const title = isOutOfStock ? '🚨 *STOK HABIS*' : '📉 *STOK MENIPIS*';
  const stockLine = isOutOfStock
    ? 'Stok tersedia: 0 akun'
    : `Sisa stok: ${remainingStock} akun`;
  const action = isOutOfStock
    ? '⚠️ Produk ini tidak dapat dibeli sampai stok ditambahkan!'
    : 'Segera tambah stok akun untuk produk ini.';
  const text = [
    title,
    '',
    `Produk: ${productName}`,
    stockLine,
    '',
    action,
    '— tokosans',
  ].join('\n');
  return sendAdminNotification(text);
}
