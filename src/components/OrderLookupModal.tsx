import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getSavedOrders, type SavedOrder } from '../lib/orderHistory';
import { OrderLookupModalContent } from './OrderLookupModalContent';

export default function OrderLookupModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [localOrders, setLocalOrders] = useState<SavedOrder[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setLocalOrders(getSavedOrders());
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const modalContent = isOpen ? (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        background: 'rgba(32, 22, 48, 0.65)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        boxSizing: 'border-box',
      }}
      onClick={(e) => e.target === e.currentTarget && setIsOpen(false)}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '440px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(32, 22, 48, 0.4)',
          border: '1px solid #e8e2f2',
          overflow: 'hidden',
          fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #f0ecff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#ffffff',
            boxSizing: 'border-box',
            width: '100%',
            position: 'relative',
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: '1.1rem',
              fontWeight: 800,
              color: '#201630',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              letterSpacing: '-0.02em',
            }}
          >
            Cek Pesanan
          </h3>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            style={{
              position: 'absolute',
              right: '16px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: '#f7f4ff',
              border: '1px solid #e8e2f2',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#746b80',
              fontSize: '1rem',
              fontWeight: 700,
              outline: 'none',
              lineHeight: 1,
              padding: 0,
              boxSizing: 'border-box',
            }}
            aria-label="Tutup modal"
          >
            ✕
          </button>
        </div>

        <OrderLookupModalContent localOrders={localOrders} />
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          background: '#ffffff',
          border: '1.5px solid #7048e8',
          borderRadius: '10px',
          padding: '7px 13px',
          color: '#7048e8',
          fontSize: '.8rem',
          fontWeight: 700,
          cursor: 'pointer',
          outline: 'none',
          whiteSpace: 'nowrap',
          fontFamily: 'inherit',
          boxShadow: '0 2px 8px rgba(112, 72, 232, 0.1)',
          transition: 'all 0.18s ease',
        }}
      >
        <span>Cek Pesanan</span>
      </button>

      {mounted && modalContent && createPortal(modalContent, document.body)}
    </>
  );
}
