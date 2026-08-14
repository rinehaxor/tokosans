import type { SavedOrder } from '../lib/orderHistory';

export function OrderItemCard({ item }: { item: SavedOrder }) {
  const fmt = (num: number) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(num);

  const renderBadge = (st?: string) => {
    if (st === 'paid' || st === 'completed')
      return <span style={{ background: '#e7f8ee', color: '#17834e', padding: '2px 8px', borderRadius: '100px', fontSize: '.7rem', fontWeight: 700 }}>✓ Berhasil</span>;
    if (st === 'expired' || st === 'cancelled' || st === 'failed')
      return <span style={{ background: '#fff0ef', color: '#c23f38', padding: '2px 8px', borderRadius: '100px', fontSize: '.7rem', fontWeight: 700 }}>Expired</span>;
    return <span style={{ background: '#f0edff', color: '#603bc7', padding: '2px 8px', borderRadius: '100px', fontSize: '.7rem', fontWeight: 700 }}>◷ Pending</span>;
  };

  return (
    <a
      href={`/payment/${item.reference}`}
      style={{
        display: 'block',
        padding: '12px 14px',
        borderRadius: '12px',
        border: '1px solid #e8e2f2',
        background: '#fff',
        textDecoration: 'none',
        color: 'inherit',
        marginBottom: '8px',
        transition: 'border-color .18s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontWeight: 700, fontSize: '.86rem', color: '#201630' }}>{item.productName}</span>
        {renderBadge(item.status)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.76rem', color: '#746b80' }}>
        <span>
          Ref: <strong style={{ color: '#7048e8' }}>{item.reference}</strong>
        </span>
        {item.amount > 0 && <span style={{ fontWeight: 700, color: '#201630' }}>{fmt(item.amount)}</span>}
      </div>
    </a>
  );
}
