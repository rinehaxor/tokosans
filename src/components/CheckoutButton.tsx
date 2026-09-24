import { useState, useEffect, useRef } from 'react';
import { saveOrderToHistory } from '../lib/orderHistory';

const spinKeyframes = `
@keyframes ck-spin {
  to { transform: rotate(360deg); }
}
`;

export default function CheckoutButton({ disabled }: { disabled?: boolean } = {}) {
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const styleInjected = useRef(false);

   useEffect(() => {
      if (styleInjected.current) return;
      styleInjected.current = true;
      const style = document.createElement('style');
      style.textContent = spinKeyframes;
      document.head.appendChild(style);
   }, []);

   const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (disabled) return;
      setError(null);

      const form = (e.currentTarget as HTMLButtonElement).closest('form') as HTMLFormElement | null;
      if (!form || !form.checkValidity()) {
         form?.reportValidity();
         return;
      }

      setLoading(true);

      try {
         const formData = new FormData(form);
         const params = new URLSearchParams();
         formData.forEach((value, key) => params.append(key, String(value)));

         // Ambil nama produk dari UI atau form jika ada
         const packageLabel = form.querySelector<HTMLElement>('[data-package-name]')?.dataset.packageName || '';
         const productTitle = form.querySelector<HTMLElement>('[data-product-title]')?.dataset.productTitle || 'Produk Digital';
         const priceText = form.querySelector<HTMLElement>('[data-package-price]')?.dataset.packagePrice || '0';

         const resp = await fetch(form.action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
            redirect: 'follow',
         });

         const targetUrl = resp.redirected ? resp.url : resp.headers.get('Location');

         if (targetUrl) {
            // Extract reference ID dari URL /payment/UG-xxx
            const match = targetUrl.match(/\/payment\/([^\/\?]+)/);
            if (match && match[1]) {
               const ref = match[1];
               saveOrderToHistory({
                  reference: ref,
                  productName: packageLabel ? `${productTitle} · ${packageLabel}` : productTitle,
                  amount: parseInt(priceText, 10) || 0,
                  createdAt: new Date().toISOString(),
                  status: 'pending',
               });
            }
            window.location.href = targetUrl;
            return;
         }

         if (!resp.ok) {
            const text = await resp.text();
            setError(text || 'Checkout gagal. Silakan coba lagi.');
            setLoading(false);
            return;
         }

         setError('Respons tidak dikenali. Silakan coba lagi.');
         setLoading(false);
      } catch {
         setError('Koneksi bermasalah. Periksa internet dan coba lagi.');
         setLoading(false);
      }
   };

   return (
      <>
         {error && (
            <div
               style={{
                  background: '#fff0ef',
                  border: '1px solid #f5c6c4',
                  borderRadius: '12px',
                  color: '#c23f38',
                  fontSize: '.86rem',
                  fontWeight: 600,
                  padding: '12px 16px',
                  marginBottom: '12px',
                  lineHeight: 1.5,
               }}
               role="alert"
            >
               ⚠️ {error}
            </div>
         )}
         <button className={loading ? 'pay loading' : 'pay'} type="button" disabled={loading || disabled} onClick={handleClick}>
            {loading ? (
               <>
                  <span
                     aria-hidden="true"
                     style={{
                        display: 'inline-block',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        border: '2.5px solid rgba(255,255,255,0.35)',
                        borderTopColor: '#fff',
                        flexShrink: 0,
                        animation: 'ck-spin .75s linear infinite',
                     }}
                  />
                  <span style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '.2px' }}>Memproses…</span>
               </>
            ) : (
               <>
                  BUAT PEMBAYARAN QRIS
                  <small>Pesanan aman · lanjut ke halaman pembayaran</small>
               </>
            )}
         </button>
      </>
   );
}
