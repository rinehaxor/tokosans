import { useState, useMemo, useEffect } from 'react';
import type { SavedOrder } from '../lib/orderHistory';
import { updateSavedOrderStatus } from '../lib/orderHistory';
import { OrderItemCard } from './OrderItemCard';

const ITEMS_PER_PAGE = 5;

export function OrderLookupModalContent({ localOrders: initialLocalOrders }: { localOrders: SavedOrder[] }) {
   const [localOrders, setLocalOrders] = useState<SavedOrder[]>(initialLocalOrders);
   const [query, setQuery] = useState('');
   const [searchResults, setSearchResults] = useState<SavedOrder[] | null>(null);
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [tab, setTab] = useState<'local' | 'search'>('local');

   const [localPage, setLocalPage] = useState(1);
   const [searchPage, setSearchPage] = useState(1);

   // Auto-sync status for local orders on mount/tab open
   useEffect(() => {
      setLocalOrders(initialLocalOrders);
      // Background status check for pending orders
      const pendingOrders = initialLocalOrders.filter((o) => !o.status || o.status === 'pending');
      if (pendingOrders.length === 0) return;

      let isMounted = true;
      (async () => {
         for (const order of pendingOrders) {
            try {
               const resp = await fetch(`/api/payments/${order.reference}/status`);
               if (!resp.ok) continue;
               const data = await resp.json();
               if (data && data.status && data.status !== 'pending') {
                  updateSavedOrderStatus(order.reference, data.status);
                  if (isMounted) {
                     setLocalOrders((prev) => prev.map((item) => (item.reference === order.reference ? { ...item, status: data.status } : item)));
                  }
               }
            } catch {
               // ignore background errors
            }
         }
      })();

      return () => {
         isMounted = false;
      };
   }, [initialLocalOrders]);

   const totalLocalPages = Math.ceil(localOrders.length / ITEMS_PER_PAGE) || 1;
   const paginatedLocalOrders = useMemo(() => {
      const start = (localPage - 1) * ITEMS_PER_PAGE;
      return localOrders.slice(start, start + ITEMS_PER_PAGE);
   }, [localOrders, localPage]);

   const totalSearchPages = searchResults ? Math.ceil(searchResults.length / ITEMS_PER_PAGE) || 1 : 1;
   const paginatedSearchResults = useMemo(() => {
      if (!searchResults) return [];
      const start = (searchPage - 1) * ITEMS_PER_PAGE;
      return searchResults.slice(start, start + ITEMS_PER_PAGE);
   }, [searchResults, searchPage]);

   const handleSearch = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!query.trim() || query.trim().length < 3) {
         setError('Masukkan minimal 3 karakter.');
         return;
      }
      setLoading(true);
      setError(null);
      setSearchPage(1);
      try {
         const resp = await fetch(`/api/orders/lookup?q=${encodeURIComponent(query.trim())}`);
         const data = await resp.json();
         if (!resp.ok) {
            setError(data.message || 'Gagal mencari pesanan.');
            setSearchResults(null);
         } else {
            setSearchResults(data.orders || []);
            if ((data.orders || []).length === 0) setError('Pesanan tidak ditemukan.');
         }
      } catch {
         setError('Masalah koneksi.');
      } finally {
         setLoading(false);
      }
   };
   return (
      <>
         <div style={{ display: 'flex', borderBottom: '1px solid #f0ecff', background: '#faf8ff', boxSizing: 'border-box' }}>
            <button
               type="button"
               onClick={() => {
                  setTab('local');
                  setLocalPage(1);
               }}
               style={{
                  flex: 1,
                  padding: '12px 10px',
                  background: 'none',
                  border: 'none',
                  borderBottom: tab === 'local' ? '2.5px solid #7048e8' : '2.5px solid transparent',
                  color: tab === 'local' ? '#7048e8' : '#746b80',
                  fontWeight: tab === 'local' ? 700 : 500,
                  fontSize: '.82rem',
                  cursor: 'pointer',
                  outline: 'none',
                  fontFamily: 'inherit',
                  lineHeight: 1.2,
               }}
            >
               Perangkat Ini {localOrders.length > 0 && `(${localOrders.length})`}
            </button>
            <button
               type="button"
               onClick={() => {
                  setTab('search');
                  setSearchPage(1);
               }}
               style={{
                  flex: 1,
                  padding: '12px 10px',
                  background: 'none',
                  border: 'none',
                  borderBottom: tab === 'search' ? '2.5px solid #7048e8' : '2.5px solid transparent',
                  color: tab === 'search' ? '#7048e8' : '#746b80',
                  fontWeight: tab === 'search' ? 700 : 500,
                  fontSize: '.82rem',
                  cursor: 'pointer',
                  outline: 'none',
                  fontFamily: 'inherit',
                  lineHeight: 1.2,
               }}
            >
               Cari Email / Ref
            </button>
         </div>
         <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1, boxSizing: 'border-box' }}>
            {tab === 'local' ? (
               localOrders.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#8a7aa1', fontSize: '.85rem', padding: '24px 0', margin: 0 }}>Belum ada pesanan tersimpan di browser ini.</p>
               ) : (
                  <div>
                     {paginatedLocalOrders.map((item) => (
                        <OrderItemCard key={item.reference} item={item} />
                     ))}
                     {totalLocalPages > 1 && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: '1px solid #f0ecff', fontSize: '.78rem', color: '#6b6178' }}>
                           <span>
                              Hal {localPage} dari {totalLocalPages} ({localOrders.length} pesanan)
                           </span>
                           <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                 type="button"
                                 disabled={localPage === 1}
                                 onClick={() => setLocalPage((p) => Math.max(1, p - 1))}
                                 style={{
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    border: '1px solid #eae3f5',
                                    background: '#fff',
                                    cursor: localPage === 1 ? 'not-allowed' : 'pointer',
                                    opacity: localPage === 1 ? 0.5 : 1,
                                    fontSize: '.76rem',
                                    fontWeight: 600,
                                 }}
                              >
                                 ← Prev
                              </button>
                              <button
                                 type="button"
                                 disabled={localPage === totalLocalPages}
                                 onClick={() => setLocalPage((p) => Math.min(totalLocalPages, p + 1))}
                                 style={{
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    border: '1px solid #eae3f5',
                                    background: '#fff',
                                    cursor: localPage === totalLocalPages ? 'not-allowed' : 'pointer',
                                    opacity: localPage === totalLocalPages ? 0.5 : 1,
                                    fontSize: '.76rem',
                                    fontWeight: 600,
                                 }}
                              >
                                 Next →
                              </button>
                           </div>
                        </div>
                     )}
                  </div>
               )
            ) : (
               <div>
                  <div
                     style={{
                        padding: '9px 12px',
                        background: '#f6f0ff',
                        border: '1px solid #e4d8f8',
                        borderRadius: '8px',
                        fontSize: '.76rem',
                        color: '#5a4975',
                        marginBottom: '12px',
                        lineHeight: 1.45,
                     }}
                  >
                     💡 Detail pesanan & akun juga dikirim ke email. Jika tidak muncul di utama/inbox, mohon cek folder <strong>Spam</strong>.
                  </div>
                  <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', marginBottom: '14px', alignItems: 'center' }}>
                     <input
                        type="text"
                        placeholder="Email atau Kode Ref (UG-xxx)"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        style={{
                           flex: 1,
                           minWidth: 0,
                           padding: '9px 12px',
                           borderRadius: '8px',
                           border: '1px solid #d8c9fa',
                           fontSize: '.82rem',
                           fontFamily: 'inherit',
                           outline: 'none',
                           boxSizing: 'border-box',
                        }}
                     />
                     <button
                        type="submit"
                        disabled={loading}
                        style={{
                           flexShrink: 0,
                           background: '#7048e8',
                           color: '#fff',
                           border: 'none',
                           borderRadius: '8px',
                           padding: '9px 16px',
                           fontWeight: 700,
                           fontSize: '.8rem',
                           cursor: loading ? 'not-allowed' : 'pointer',
                           outline: 'none',
                           fontFamily: 'inherit',
                        }}
                     >
                        {loading ? '...' : 'Cari'}
                     </button>
                  </form>
                  {error && <div style={{ padding: '8px 12px', background: '#fff0ef', color: '#c23f38', borderRadius: '8px', fontSize: '.76rem', marginBottom: '10px', fontWeight: 600 }}>⚠️ {error}</div>}
                  {searchResults && (
                     <div>
                        {paginatedSearchResults.map((item) => (
                           <OrderItemCard key={item.reference} item={item} />
                        ))}
                        {searchResults.length > 0 && totalSearchPages > 1 && (
                           <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: '1px solid #f0ecff', fontSize: '.78rem', color: '#6b6178' }}>
                              <span>
                                 Hal {searchPage} dari {totalSearchPages} ({searchResults.length} hasil)
                              </span>
                              <div style={{ display: 'flex', gap: 6 }}>
                                 <button
                                    type="button"
                                    disabled={searchPage === 1}
                                    onClick={() => setSearchPage((p) => Math.max(1, p - 1))}
                                    style={{
                                       padding: '4px 10px',
                                       borderRadius: 6,
                                       border: '1px solid #eae3f5',
                                       background: '#fff',
                                       cursor: searchPage === 1 ? 'not-allowed' : 'pointer',
                                       opacity: searchPage === 1 ? 0.5 : 1,
                                       fontSize: '.76rem',
                                       fontWeight: 600,
                                    }}
                                 >
                                    ← Prev
                                 </button>
                                 <button
                                    type="button"
                                    disabled={searchPage === totalSearchPages}
                                    onClick={() => setSearchPage((p) => Math.min(totalSearchPages, p + 1))}
                                    style={{
                                       padding: '4px 10px',
                                       borderRadius: 6,
                                       border: '1px solid #eae3f5',
                                       background: '#fff',
                                       cursor: searchPage === totalSearchPages ? 'not-allowed' : 'pointer',
                                       opacity: searchPage === totalSearchPages ? 0.5 : 1,
                                       fontSize: '.76rem',
                                       fontWeight: 600,
                                    }}
                                 >
                                    Next →
                                 </button>
                              </div>
                           </div>
                        )}
                     </div>
                  )}
               </div>
            )}
         </div>
      </>
   );
}
