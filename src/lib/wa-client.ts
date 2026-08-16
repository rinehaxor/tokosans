import path from 'node:path';
import type { WASocket } from '@whiskeysockets/baileys';

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

function adminJid(): string | null {
  const num = getAdminWaNumber();
  return num ? `${num}@s.whatsapp.net` : null;
}

/** Kirim pesan teks ke nomor admin. Aman dipanggil walau belum terhubung (no-op). */
export async function sendAdminNotification(text: string): Promise<boolean> {
  const rt = getRuntime();
  const jid = adminJid();
  if (!jid) {
    console.warn('[WA] ADMIN_WA_NUMBER belum dikonfigurasi — notifikasi dilewati.');
    return false;
  }
  if (rt.state !== 'open' || !rt.socket) {
    await ensureWaClient();
    if (rt.state !== 'open' || !rt.socket) return false;
  }
  try {
    await rt.socket.sendMessage(jid, { text });
    return true;
  } catch (err) {
    console.error('[WA] sendAdminNotification error:', err);
    return false;
  }
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
