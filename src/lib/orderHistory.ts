export interface SavedOrder {
  reference: string;
  productName: string;
  amount: number;
  createdAt: string;
  status?: string;
}

const STORAGE_KEY = 'tokosans_order_history';

export function getSavedOrders(): SavedOrder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveOrderToHistory(order: SavedOrder): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getSavedOrders();
    // Filter jika sudah ada (cegah duplikat)
    const filtered = current.filter((o) => o.reference !== order.reference);
    // Masukkan ke posisi paling awal dengan default status pending jika tidak diisi
    const newOrder: SavedOrder = {
      status: 'pending',
      ...order,
    };
    const updated = [newOrder, ...filtered].slice(0, 15);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

export function updateSavedOrderStatus(reference: string, status: string): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getSavedOrders();
    const index = current.findIndex((o) => o.reference === reference);
    if (index !== -1) {
      current[index].status = status;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    }
  } catch {
    // Ignore storage errors
  }
}

