import { createHash } from 'crypto';

export type DigiflazzOrder = {
  status?: string;
  message?: string;
  code?: number;
  data?: {
    ref_id?: string;
    customer_no?: string;
    buyer_sku_code?: string;
    message?: string;
    status?: string;
    rc?: string;
    sn?: string;
    buyer_last_saldo?: number;
    price?: number;
    tele?: string;
    wa?: string;
  };
};

export type DigiflazzDeposit = {
  deposit: number;
};

export type DigiflazzCheckOrder = {
  status?: number;
  code?: number;
  message?: string;
  data?: {
    ref_id?: string;
    status?: string;
    rc?: string;
    sn?: string;
  };
};

export type DigiflazzProduct = {
  product_name: string;
  category: string;
  brand: string;
  type?: string;
  seller_name: string;
  price?: number;
  admin?: number;
  commission?: number;
  buyer_sku_code: string;
  buyer_product_status: boolean;
  seller_product_status: boolean;
  unlimited_stock?: boolean;
  stock?: number;
  multi?: boolean;
  start_cut_off?: string;
  end_cut_off?: string;
  desc: string;
};

const BASE_URL = 'https://api.digiflazz.com';

/** Cek sisa deposit - hanya butuh username dan signature */
export async function cekSaldoDigiflazz(username: string, apiKey: string) {
  // Signature: md5(username + apiKey + "depo")
  const sign = createHash('md5').update(`${username}${apiKey}depo`).digest('hex');

  const body = {
    cmd: 'deposit',
    username,
    sign,
  };

  const response = await fetch(`${BASE_URL}/v1/cek-saldo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const result = (await response.json()) as any;

  // Log raw response untuk debugging
  console.log('[Digiflazz cek-saldo] status:', response.status, '| body:', JSON.stringify(result));

  // Cek apakah ada deposit di response (bisa bernilai 0)
  if (result?.data && typeof result.data.deposit === 'number') {
    return result.data.deposit as number;
  }

  // Ambil pesan error dari berbagai kemungkinan lokasi di response Digiflazz
  const errMsg =
    result?.data?.message ??
    result?.data?.rc ??
    result?.message ??
    result?.rc ??
    `HTTP ${response.status}: Gagal cek saldo Digiflazz.`;

  throw new Error(String(errMsg));
}

export async function createDigiflazzOrder(referenceId: string, buyerSkuCode: string, customerNo: string, opts: { testing?: boolean } = {}) {
  const username = import.meta.env.DIGIFLAZZ_USERNAME;
  const key = import.meta.env.DIGIFLAZZ_API_KEY;

  if (!username || !key) throw new Error('Konfigurasi Digiflazz belum lengkap (DIGIFLAZZ_USERNAME / DIGIFLAZZ_API_KEY).');

  // Signature resmi Digiflazz: md5(username + apiKey + ref_id)
  const sign = createHash('md5').update(`${username}${key}${referenceId}`).digest('hex');

  // Mode testing: default true saat dev (kecuali DIGIFLAZZ_TESTING=false),
  // atau dipaksa lewat DIGIFLAZZ_TESTING=true di produksi untuk uji coba.
  const testingRaw = String(import.meta.env.DIGIFLAZZ_TESTING ?? '').trim().toLowerCase();
  const testing = opts.testing ?? (testingRaw ? testingRaw === 'true' : Boolean(import.meta.env.DEV));

  const body: Record<string, unknown> = {
    username,
    buyer_sku_code: buyerSkuCode,
    customer_no: customerNo,
    ref_id: referenceId,
    sign,
  };
  if (testing) body.testing = true;

  const response = await fetch(`${BASE_URL}/v1/transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const result = (await response.json()) as DigiflazzOrder;

  console.log('[Digiflazz transaction] status:', response.status, '| body:', JSON.stringify(result));

  if (!response.ok || !result.data) {
    const errMsg =
      result.data?.message ??
      result.data?.rc ??
      result.message ??
      result.code ??
      `HTTP ${response.status}: Digiflazz gagal memproses transaksi.`;
    throw new Error(String(errMsg));
  }

  return result.data;
}

export async function checkDigiflazzOrder(referenceId: string) {
  const username = import.meta.env.DIGIFLAZZ_USERNAME;
  const key = import.meta.env.DIGIFLAZZ_API_KEY;

  if (!username || !key) throw new Error('Konfigurasi Digiflazz belum lengkap (DIGIFLAZZ_USERNAME / DIGIFLAZZ_API_KEY).');

  // Signature resmi Digiflazz: md5(username + apiKey + ref_id)
  const sign = createHash('md5').update(`${username}${key}${referenceId}`).digest('hex');

  // Cek status transaksi prepaid memakai endpoint transaction yang sama dengan commands: "status"
  const body = {
    commands: 'status',
    username,
    ref_id: referenceId,
    sign,
  };

  const response = await fetch(`${BASE_URL}/v1/transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const result = (await response.json()) as DigiflazzCheckOrder;

  if (!response.ok || result.code !== 0 || !result.data) return null;

  return result.data;
}

export function isDigiflazzSuccessful(status: unknown) {
  return ['success', 'paid', 'completed', 'finished'].includes(String(status ?? '').toLowerCase());
}

export function isDigiflazzCancelled(status: unknown) {
  return ['cancelled', 'expired', 'failed', '0', 'timeout'].includes(String(status ?? '').toLowerCase());
}

/**
 * Ambil daftar harga produk dari Digiflazz.
 * @param cmd   'prepaid' (default) atau 'pasca'
 * @param opts  Filter opsional: category, brand, type, code
 */
export async function getPriceList(
  username: string,
  apiKey: string,
  cmd: 'prepaid' | 'pasca' = 'prepaid',
  opts: { category?: string; brand?: string; type?: string; code?: string } = {}
): Promise<DigiflazzProduct[]> {
  // Signature: md5(username + apiKey + "pricelist")
  const sign = createHash('md5').update(`${username}${apiKey}pricelist`).digest('hex');

  const body: Record<string, string> = { cmd, username, sign };
  if (opts.category) body.category = opts.category;
  if (opts.brand)    body.brand    = opts.brand;
  if (opts.type)     body.type     = opts.type;
  if (opts.code)     body.code     = opts.code;

  const response = await fetch(`${BASE_URL}/v1/price-list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const result = (await response.json()) as any;

  if (!Array.isArray(result?.data)) {
    const errMsg =
      result?.data?.message ??
      result?.message ??
      `HTTP ${response.status}: Gagal ambil price list.`;
    throw new Error(String(errMsg));
  }

  return result.data as DigiflazzProduct[];
}

// ---------------------------------------------------------------------------
// Cache pricelist — Digiflazz membatasi endpoint /price-list, jadi JANGAN
// memanggilnya setiap kali halaman dibuka. Cache in-memory + TTL + throttle.
// ---------------------------------------------------------------------------

const PL_TTL_MS = 6 * 60 * 60 * 1000;              // cache segar: 6 jam
const PL_MIN_INTERVAL_MS = 60 * 1000;              // min. jeda 60 dtk antar panggilan upstream per cmd
const PL_STALE_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // cache basi masih dipakai s/d 7 hari saat upstream gagal

type PriceListEntry = { data: DigiflazzProduct[]; fetchedAt: number };
const priceListCache = new Map<string, PriceListEntry>();
const priceListLastFetch = new Map<string, number>();
const priceListInflight = new Map<string, Promise<PriceListEntry>>();

function priceListKey(cmd: 'prepaid' | 'pasca', opts: { category?: string; brand?: string; type?: string; code?: string }) {
  return [cmd, opts.category ?? '', opts.brand ?? '', opts.type ?? '', opts.code ?? ''].join('|');
}

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

export type PriceListResult = {
  data: DigiflazzProduct[];
  cached: boolean;      // true = bukan dari upstream (cache segar/basi / request duplikat)
  stale: boolean;       // true = cache sudah lewat TTL
  ageMinutes: number;
};

/**
 * Ambil price list dengan cache (endpoint Digiflazz di-rate-limit):
 * 1. cache segar (< TTL)                -> langsung dipakai, tanpa hit upstream
 * 2. request duplikat sedang berjalan   -> ikut hasilnya (dedupe)
 * 3. cache basi                         -> fetch, tapi throttle: tunggu sisa jeda min. antar panggilan
 * 4. upstream gagal / kena limit        -> fallback ke cache basi (bila ada), kalau tidak lempar error
 */
export async function getPriceListCached(
  username: string,
  apiKey: string,
  cmd: 'prepaid' | 'pasca' = 'prepaid',
  opts: { category?: string; brand?: string; type?: string; code?: string; force?: boolean } = {}
): Promise<PriceListResult> {
  const { force, ...filters } = opts;
  const key = priceListKey(cmd, filters);
  const hit = priceListCache.get(key);

  if (!force && hit && Date.now() - hit.fetchedAt < PL_TTL_MS) {
    return { data: hit.data, cached: true, stale: false, ageMinutes: Math.floor((Date.now() - hit.fetchedAt) / 60000) };
  }

  const inflight = priceListInflight.get(key);
  if (inflight) {
    const entry = await inflight;
    return { data: entry.data, cached: true, stale: false, ageMinutes: Math.floor((Date.now() - entry.fetchedAt) / 60000) };
  }

  const fetchUpstream = async (): Promise<PriceListEntry> => {
    const last = priceListLastFetch.get(key);
    if (last) {
      const wait = PL_MIN_INTERVAL_MS - (Date.now() - last);
      if (wait > 0) await sleep(wait);
    }
    const data = await getPriceList(username, apiKey, cmd, filters);
    priceListLastFetch.set(key, Date.now());
    const entry: PriceListEntry = { data, fetchedAt: Date.now() };
    priceListCache.set(key, entry);
    return entry;
  };

  const task = fetchUpstream();
  priceListInflight.set(key, task);
  try {
    const entry = await task;
    return { data: entry.data, cached: false, stale: false, ageMinutes: 0 };
  } catch (err) {
    // Upstream gagal (mis. kena limitasi) -> pakai cache basi bila masih ada
    if (hit && Date.now() - hit.fetchedAt < PL_STALE_GRACE_MS) {
      console.warn('[digiflazz] price-list gagal, fallback ke cache basi:', (err as Error)?.message);
      return { data: hit.data, cached: true, stale: true, ageMinutes: Math.floor((Date.now() - hit.fetchedAt) / 60000) };
    }
    throw err;
  } finally {
    priceListInflight.delete(key);
  }
}
