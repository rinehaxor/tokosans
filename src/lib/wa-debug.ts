import fs from 'node:fs';
import path from 'node:path';

/**
 * Logger diagnostik untuk alur pesan WhatsApp (perintah admin).
 *
 * Menulis ke console (tampil di terminal `astro dev` / dev-out.log) DAN
 * menambahkan baris ke file `wa-debug.log` di root proyek, sehingga jejak
 * lengkap alur pesan masuk dapat diperiksa setelah admin mengirim perintah
 * dari WA.
 *
 * Dipakai untuk membedah kenapa bot kadang tidak membalas perintah admin —
 * sebelumnya semua return-awal di `handleIncomingWaMessage` & listener
 * `messages.upsert` diam-diam (tidak log apa pun), sehingga debugging nyaris
 * mustahil. Dengan `waDebug` di tiap titik keputusan, setiap "skip" terlihat.
 */

const LOG_FILE = path.resolve(process.cwd(), 'wa-debug.log');
const MAX_VAL_LEN = 200;

function fmt(val: unknown): string {
  let s: string;
  if (val === null) s = 'null';
  else if (val === undefined) s = 'undefined';
  else if (typeof val === 'string') s = val;
  else if (typeof val === 'number' || typeof val === 'boolean') s = String(val);
  else if (val instanceof Error) s = `${val.message}\n${val.stack ?? ''}`;
  else {
    try {
      s = JSON.stringify(val);
    } catch {
      s = String(val);
    }
  }
  return s.length > MAX_VAL_LEN ? s.slice(0, MAX_VAL_LEN) + `…(${s.length})` : s;
}

export function waDebug(tag: string, ...args: unknown[]): void {
  const ts = new Date().toISOString();
  const body = args.map(fmt).join(' ');
  const line = `[${ts}] [${tag}] ${body}`;
  console.log(`[WA-debug] ${line}`);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', { encoding: 'utf8' });
  } catch {
    /* abaikan error penulisan log */
  }
}
