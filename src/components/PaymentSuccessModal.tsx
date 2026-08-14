import { useState, useEffect } from 'react';
import type React from 'react';

interface AccountInfo {
  login: string;
  password?: string;
  terms?: string;
}

interface PaymentSuccessData {
  productName?: string;
  amount?: number;
  reference?: string;
  account?: AccountInfo;
}

function CheckCircleIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="32" fill="#e7f8ee" />
      <circle cx="32" cy="32" r="24" fill="#d0f5e2" />
      <path d="M20 32.5L28 40.5L44 24" stroke="#17834e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button onClick={handleCopy} title={`Salin ${label}`} style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '5px 10px', border: '1px solid #c3adf5', borderRadius: '8px',
      background: copied ? '#e7f8ee' : '#f5f0ff',
      color: copied ? '#17834e' : '#6840d6',
      fontSize: '.72rem', fontWeight: 700, cursor: 'pointer',
      flexShrink: 0, transition: 'all .2s', whiteSpace: 'nowrap',
    }}>
      {copied ? '✓ Tersalin' : '⎘ Salin'}
    </button>
  );
}

function ModalHeader({ account }: { account?: { login: string } }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: '24px' }}>
      <div style={{ marginBottom: '16px' }}><CheckCircleIcon /></div>
      <h2 id="pm-title" style={{ margin: '0 0 8px', fontSize: '1.45rem', fontWeight: 800, color: '#191026', letterSpacing: '-.02em' }}>
        Pembayaran Berhasil! 🎉
      </h2>
      <p style={{ margin: 0, color: '#756788', fontSize: '.9rem', lineHeight: 1.5 }}>
        {account ? 'Transaksi dikonfirmasi. Detail akun kamu ada di bawah ini.' : 'Transaksi dikonfirmasi. Pesananmu sedang diproses.'}
      </p>
    </div>
  );
}

function TransactionInfo({ productName, fmt, reference, hasAccount }: { productName?: string; fmt: string | null; reference?: string; hasAccount: boolean }) {
  const rowStyle = (last: boolean): React.CSSProperties => ({
    display: 'flex', justifyContent: 'space-between', gap: '12px',
    marginBottom: last ? 0 : '10px', paddingBottom: last ? 0 : '10px',
    borderBottom: last ? 'none' : '1px solid #ede7f8',
  });
  return (
    <div style={{ background: '#faf8ff', border: '1px solid #e8e1f2', borderRadius: '14px', padding: '16px', marginBottom: hasAccount ? '16px' : '24px' }}>
      {productName && (
        <div style={rowStyle(!fmt && !reference)}>
          <span style={{ color: '#756788', fontSize: '.8rem', fontWeight: 600 }}>Produk</span>
          <span style={{ color: '#191026', fontSize: '.85rem', fontWeight: 700, textAlign: 'right' }}>{productName}</span>
        </div>
      )}
      {fmt && (
        <div style={rowStyle(!reference)}>
          <span style={{ color: '#756788', fontSize: '.8rem', fontWeight: 600 }}>Jumlah</span>
          <span style={{ color: '#17834e', fontSize: '.95rem', fontWeight: 800 }}>{fmt}</span>
        </div>
      )}
      {reference && (
        <div style={rowStyle(true)}>
          <span style={{ color: '#756788', fontSize: '.8rem', fontWeight: 600 }}>Referensi</span>
          <span style={{ color: '#191026', fontSize: '.78rem', fontWeight: 700, fontFamily: 'monospace' }}>{reference}</span>
        </div>
      )}
    </div>
  );
}

function AccountDetail({ account }: { account: { login: string; password?: string; terms?: string } }) {
  const fieldStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: '10px', background: '#fff', padding: '10px 12px',
    borderRadius: '10px', border: '1px solid #dcd2f2',
  };
  const labelStyle: React.CSSProperties = {
    margin: '0 0 5px', fontSize: '.72rem', color: '#756788',
    fontWeight: 600, textTransform: 'uppercase' as const,
  };
  return (
    <div style={{ background: '#f0edff', border: '1px solid #d4c8f7', borderRadius: '14px', padding: '18px', marginBottom: '24px' }}>
      <p style={{ margin: '0 0 14px', fontSize: '.72rem', fontWeight: 700, color: '#5b34d1', textTransform: 'uppercase', letterSpacing: '.5px' }}>
        Detail Akun
      </p>
      <div style={{ marginBottom: account.password ? '12px' : 0 }}>
        <p style={labelStyle}>Username / Email</p>
        <div style={fieldStyle}>
          <code style={{ fontSize: '.9rem', fontWeight: 700, color: '#191026', wordBreak: 'break-all', flex: 1 }}>{account.login}</code>
          <CopyButton text={account.login} label="username" />
        </div>
      </div>
      {account.password && (
        <div>
          <p style={labelStyle}>Password / License Key</p>
          <div style={fieldStyle}>
            <code style={{ fontSize: '.9rem', fontWeight: 700, color: '#7048e8', wordBreak: 'break-all', flex: 1 }}>{account.password}</code>
            <CopyButton text={account.password} label="password" />
          </div>
        </div>
      )}
      {account.terms && (
        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #dcd2f2' }}>
          <p style={{ margin: '0 0 6px', fontSize: '.72rem', fontWeight: 700, color: '#756788', textTransform: 'uppercase' }}>Syarat & Ketentuan</p>
          <p style={{ margin: 0, fontSize: '.82rem', color: '#5f5470', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{account.terms}</p>
        </div>
      )}
    </div>
  );
}

function ActionButtons({ onClose, hasAccount }: { onClose: () => void; hasAccount: boolean }) {
  const handleView = () => {
    onClose();
    document.getElementById('account')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  return (
    <div style={{ display: 'flex', gap: '10px' }}>
      <button onClick={onClose} style={{
        flex: 1, padding: '13px', border: '1px solid #e8e1f2', borderRadius: '12px',
        background: '#faf8ff', color: '#776d83', fontSize: '.88rem', fontWeight: 700, cursor: 'pointer',
      }}>
        Tutup
      </button>
      <button onClick={hasAccount ? handleView : onClose} style={{
        flex: 2, padding: '13px', border: 'none', borderRadius: '12px',
        background: 'linear-gradient(135deg,#7048e8,#5b34d1)', color: '#fff',
        fontSize: '.88rem', fontWeight: 800, cursor: 'pointer',
        boxShadow: '0 6px 20px #7048e830',
      }}>
        {hasAccount ? '👁 Lihat Detail Akun' : '✓ Oke, Mengerti'}
      </button>
    </div>
  );
}

export default function PaymentSuccessModal() {
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [data, setData] = useState<PaymentSuccessData>({});

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<PaymentSuccessData>).detail ?? {};
      setData(detail);
      setVisible(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)));
    };
    window.addEventListener('payment:success', handler);
    return () => window.removeEventListener('payment:success', handler);
  }, []);

  const handleClose = () => {
    setAnimating(false);
    setTimeout(() => setVisible(false), 300);
  };

  if (!visible) return null;

  const fmt = data.amount
    ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(data.amount)
    : null;

  return (
    <>
      <div onClick={handleClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(17,10,34,0.55)',
        backdropFilter: 'blur(4px)', zIndex: 9998,
        opacity: animating ? 1 : 0, transition: 'opacity .3s ease',
      }} />
      <div role="dialog" aria-modal="true" aria-labelledby="pm-title" style={{
        position: 'fixed', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: '16px', pointerEvents: 'none',
      }}>
        <div style={{
          background: '#fff', borderRadius: '24px', padding: '36px 32px 32px',
          maxWidth: '460px', width: '100%', pointerEvents: 'auto',
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 32px 80px rgba(112,72,232,0.18),0 4px 16px rgba(0,0,0,0.08)',
          transform: animating ? 'translateY(0) scale(1)' : 'translateY(32px) scale(0.95)',
          opacity: animating ? 1 : 0,
          transition: 'transform .35s cubic-bezier(.34,1.56,.64,1),opacity .3s ease',
        }}>
          <ModalHeader account={data.account} />
          <TransactionInfo productName={data.productName} fmt={fmt} reference={data.reference} hasAccount={!!data.account} />
          {data.account && <AccountDetail account={data.account} />}
          <ActionButtons onClose={handleClose} hasAccount={!!data.account} />
          <p style={{ margin: '16px 0 0', textAlign: 'center', fontSize: '.75rem', color: '#a094b5', lineHeight: 1.5 }}>
            📬 Detail akun juga dikirim ke email kamu. Cek folder spam jika tidak ada di inbox.
          </p>
        </div>
      </div>
    </>
  );
}
