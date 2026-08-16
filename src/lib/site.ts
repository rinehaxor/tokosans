const DEFAULT_SITE_URL = 'https://tokosans.id';

/** Mendeteksi URL development lokal (localhost / 127.0.0.1 / [::1]) agar tidak bocor ke produksi. */
function isLocalPlaceholder(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/?$/i.test(url);
}

/**
 * Mengembalikan base URL situs tanpa trailing slash.
 * Prioritas:
 *   1. process.env.PUBLIC_SITE_URL (override eksplisit saat runtime)
 *   2. import.meta.env.PUBLIC_SITE_URL (di-bake saat build) — diabaikan bila berupa localhost
 *   3. Origin dari request — diabaikan bila berupa localhost
 *   4. Default domain produksi (tokosans.id)
 */
export function getSiteUrl(origin?: string): string {
  const fromProcess = (process.env.PUBLIC_SITE_URL || '').trim();
  if (fromProcess) return fromProcess.replace(/\/+$/, '');

  const fromBuild = (import.meta.env.PUBLIC_SITE_URL || '').trim();
  if (fromBuild && !isLocalPlaceholder(fromBuild)) return fromBuild.replace(/\/+$/, '');

  const fromRequest = (origin || '').trim();
  if (fromRequest && !isLocalPlaceholder(fromRequest)) return fromRequest.replace(/\/+$/, '');

  return DEFAULT_SITE_URL;
}