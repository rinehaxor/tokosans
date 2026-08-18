import path from 'node:path';
import fs from 'node:fs';
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

function clearAuthDir(): void {
  try {
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      waDebug('auth', 'Folder wa-auth berhasil dibersihkan');
    }
  } catch (err) {
    console.error('[WA] Gagal membersihkan folder wa-auth:', err);
  }
}

export interface WaRuntime {
  socket: WASocket | null;
  state: WaState;
  qr: string | null;
  lastConnected: string | null;
  connectingPromise: Promise<void> | null;
  reconnectTimer: NodeJS.Timeout | null;
  lastCloseCode: number | null;
}

export function getRuntime(): WaRuntime {
  const g = globalThis as Record<string, unknown>;
  if (!g.__tokosansWa) {
    g.__tokosansWa = {
      socket: null,
      state: 'disconnected',
      qr: null,
      lastConnected: null,
      connectingPromise: null,
      reconnectTimer: null,
      lastCloseCode: null,
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

/** Bersihkan socket yang sedang aktif atau dangling */
function cleanupExistingSocket(rt: WaRuntime): void {
  if (rt.reconnectTimer) {
    clearTimeout(rt.reconnectTimer);
    rt.reconnectTimer = null;
  }
  if (rt.socket) {
    try {
      rt.socket.ev.removeAllListeners('connection.update');
      rt.socket.ev.removeAllListeners('creds.update');
      rt.socket.ev.removeAllListeners('messages.upsert');
      rt.socket.end(undefined);
    } catch (_) {}
    rt.socket = null;
  }
}

/** Mulai koneksi WA (idempoten — single flight). */
export async function ensureWaClient(): Promise<void> {
  const rt = getRuntime();

  if (rt.state === 'open' && rt.socket) return;
  if (rt.connectingPromise) return rt.connectingPromise;

  if (rt.reconnectTimer) {
    clearTimeout(rt.reconnectTimer);
    rt.reconnectTimer = null;
  }

  rt.connectingPromise = (async () => {
    try {
      cleanupExistingSocket(rt);

      const baileys = await import('@whiskeysockets/baileys');
      const makeWASocket = baileys.default;
      const { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, Browsers } = baileys;

      const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] as any }));

      rt.state = 'connecting';
      rt.qr = null;

    const socket = makeWASocket({
      version,
      auth: authState,
      logger: silentLogger as any,
      printQRInTerminal: false,
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      keepAliveIntervalMs: 25_000,
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
        rt.starting = false;
        waDebug('conn', 'QR Code baru di-generate');
      }
      if (connection === 'connecting') {
        rt.state = rt.qr ? 'qr' : 'connecting';
      }
      if (connection === 'open') {
        rt.qr = null;
        rt.state = 'open';
        rt.lastConnected = new Date().toISOString();
        rt.lastCloseCode = null;
        waDebug('conn', 'OPEN — listener messages.upsert aktif, bot siap menerima pesan admin');
      }
      if (connection === 'close') {
        const code: number | undefined = lastDisconnect?.error?.output?.statusCode;
        rt.lastCloseCode = code ?? null;
        const loggedOut = code === DisconnectReason.loggedOut || code === 401 || code === 403;
        const isConflict = code === DisconnectReason.connectionReplaced || code === 440;

        waDebug('conn', `CLOSE code=${code ?? 'unknown'}, loggedOut=${loggedOut}, isConflict=${isConflict}`);

        if (rt.socket === socket) {
          rt.socket = null;
        }
        rt.qr = null;
        rt.state = loggedOut ? 'disconnected' : 'closed';

        if (rt.reconnectTimer) clearTimeout(rt.reconnectTimer);

        if (loggedOut) {
          clearAuthDir();
          rt.reconnectTimer = setTimeout(() => {
            rt.reconnectTimer = null;
            ensureWaClient().catch((e) => console.error('[WA] reset-after-logout error:', e));
          }, 1000);
        } else if (isConflict) {
          waDebug('conn', 'Connection conflict (440) — menahan auto-reconnect cepat');
          rt.reconnectTimer = setTimeout(() => {
            rt.reconnectTimer = null;
            ensureWaClient().catch((e) => console.error('[WA] conflict-reconnect error:', e));
          }, 10000);
        } else {
          rt.reconnectTimer = setTimeout(() => {
            rt.reconnectTimer = null;
            ensureWaClient().catch((e) => console.error('[WA] auto-reconnect error:', e));
          }, 5000);
        }
      }
    });
  } catch (err) {
    console.error('[WA] ensureWaClient error:', err);
    rt.state = 'disconnected';
  } finally {
    rt.connectingPromise = null;
  }
  })();

  return rt.connectingPromise;
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
  cleanupExistingSocket(rt);
  rt.qr = null;
  rt.state = 'disconnected';
  await ensureWaClient();
}

/** Logout penuh — invalidate session (admin harus scan QR lagi untuk connect). */
export async function disconnectWa(): Promise<void> {
  const rt = getRuntime();
  if (rt.socket) {
    try {
      await rt.socket.logout();
    } catch {
      /* ignore */
    }
  }
  cleanupExistingSocket(rt);
  clearAuthDir();
  rt.qr = null;
  rt.lastConnected = null;
  rt.state = 'disconnected';
  // Langsung inisialisasi sesi baru yang bersih sehingga QR code langsung ter-generate untuk dashboard
  await ensureWaClient();
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
  waDebug('send-notif-start', `Mempersiapkan kirim ke ${jids.length} jid: ${jids.join(', ')}`);
  if (!jids.length) {
    console.warn('[WA] ADMIN_WA_NOTIFY_JIDS belum dikonfigurasi — notifikasi dilewati.');
    waDebug('send-notif-skip', 'ADMIN_WA_NOTIFY_JIDS kosong');
    return false;
  }

  // Jika koneksi belum 'open', coba pastikan client aktif & tunggu sebentar
  if (rt.state !== 'open' || !rt.socket) {
    waDebug('send-notif-wait', `State saat ini: ${rt.state}. Memastikan socket aktif...`);
    ensureWaClient().catch((e) => waDebug('send-notif-ensure-err', e));

    const startTime = Date.now();
    while ((rt.state !== 'open' || !rt.socket) && Date.now() - startTime < 12000) {
      if (rt.state === 'qr') {
        waDebug('send-notif-stop', 'Sesi WA membutuhkan scan QR ulang');
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    if (rt.state !== 'open' || !rt.socket) {
      waDebug('send-notif-failed', `Koneksi WA belum open setelah menunggu (state=${rt.state})`);
      return false;
    }
  }

  let anySent = false;
  for (const jid of jids) {
    try {
      waDebug('send-notif-dispatch', `Mengirim notifikasi ke ${jid}...`);
      await rt.socket.sendMessage(jid, { text });
      waDebug('send-notif-success', `Notifikasi berhasil dikirim ke ${jid}`);
      anySent = true;
    } catch (err) {
      waDebug('send-notif-error', `Gagal kirim ke ${jid}:`, err);
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
