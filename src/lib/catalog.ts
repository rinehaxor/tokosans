export type Product = {
  id: string;
  name: string;
  category: string;
  duration: string;
  price: number;
  original_price?: number | null;
  description: string;
  icon: string;
  badge?: string;
  brand?: string;
  sku?: string;
};

export const productCategories = ['Produktivitas', 'Kreativitas', 'Streaming', 'Musik'] as const;

export const products: Product[] = [
  { id: 'canva-pro-1m', name: 'Canva Pro', category: 'Produktivitas', duration: '1 Bulan', price: 1000, original_price: 2000, description: 'Akses fitur premium untuk kebutuhan desainmu.', icon: '✦', badge: 'Terlaris', brand: 'Canva', sku: 'TS-CANVA-1M' },
  { id: 'capcut-pro-1m', name: 'CapCut Pro', category: 'Kreativitas', duration: '1 Bulan', price: 18000, original_price: 29000, description: 'Edit konten lebih maksimal dengan fitur Pro.', icon: '◈', brand: 'CapCut', sku: 'TS-CAPCUT-1M' },
  { id: 'netflix-1m', name: 'Netflix', category: 'Streaming', duration: '1 Bulan', price: 35000, original_price: 56000, description: 'Nikmati film dan serial favorit setiap hari.', icon: 'N', brand: 'Netflix', sku: 'TS-NETFLIX-1M' },
  { id: 'prime-video-1m', name: 'Prime Video', category: 'Streaming', duration: '1 Bulan', price: 22000, original_price: 35000, description: 'Tayangan eksklusif untuk waktu santaimu.', icon: '▶', brand: 'Amazon', sku: 'TS-PRIME-1M' },
  { id: 'wetv-vip-1m', name: 'WeTV VIP', category: 'Streaming', duration: '1 Bulan', price: 17000, original_price: 27000, description: 'Drama Asia tanpa iklan dan episode lebih awal.', icon: 'W', brand: 'Tencent', sku: 'TS-WETV-1M' },
  { id: 'spotify-1m', name: 'Spotify Premium', category: 'Musik', duration: '1 Bulan', price: 20000, original_price: 32000, description: 'Dengarkan musik bebas iklan, kapan pun.', icon: '♫', brand: 'Spotify', sku: 'TS-SPOTIFY-1M' },
];

export const formatRupiah = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
    .format(amount)
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ');

