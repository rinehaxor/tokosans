import React, { useState, useMemo } from 'react';

export type AccountItem = {
  id: string;
  product_id: string;
  product_name: string;
  package_id: string | null;
  package_name: string;
  login: string;
  password: string;
  status: 'available' | 'sold' | 'disabled';
  created_at: string;
};

export type ProductOption = {
  id: string;
  name: string;
};

interface AccountsTableProps {
  accounts: AccountItem[];
  products: ProductOption[];
}

export default function AccountsTable(props: AccountsTableProps) {
  const { accounts: initialAccounts, products } = props;
  const [accounts, setAccounts] = useState<AccountItem[]>(initialAccounts);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        account.login.toLowerCase().includes(q) ||
        account.password.toLowerCase().includes(q) ||
        account.product_name.toLowerCase().includes(q) ||
        account.package_name.toLowerCase().includes(q);

      const matchStatus = statusFilter === 'all' || account.status === statusFilter;
      const matchProduct = productFilter === 'all' || account.product_id === productFilter;

      return matchSearch && matchStatus && matchProduct;
    });
  }, [accounts, search, statusFilter, productFilter]);

  const totalPages = Math.ceil(filteredAccounts.length / pageSize) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const paginatedAccounts = useMemo(() => {
    return filteredAccounts.slice(startIdx, startIdx + pageSize);
  }, [filteredAccounts, startIdx, pageSize]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus stok akun ini?')) return;

    setDeletingId(id);
    try {
      const response = await fetch('/api/admin/accounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      if (!response.ok) throw new Error('Failed delete');

      setAccounts((prev) => prev.filter((acc) => acc.id !== id));
      window.dispatchEvent(
        new CustomEvent('app:toast', {
          detail: { type: 'success', message: 'Akun berhasil dihapus' },
        })
      );
    } catch {
      window.dispatchEvent(
        new CustomEvent('app:toast', {
          detail: { type: 'error', message: 'Gagal menghapus akun' },
        })
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="table-wrapper">
      <div className="table-filter-bar">
        <div className="search-input-wrap">
          <svg className="icon-search" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            type="text"
            placeholder="Cari email / username / paket..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            className="filter-input"
          />
        </div>

        <div className="filter-selects">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="filter-select"
          >
            <option value="all">Semua Status</option>
            <option value="available">Tersedia</option>
            <option value="sold">Terjual</option>
            <option value="disabled">Dinonaktifkan</option>
          </select>

          <select
            value={productFilter}
            onChange={(e) => { setProductFilter(e.target.value); setCurrentPage(1); }}
            className="filter-select"
          >
            <option value="all">Semua Produk</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-scroll font-table">
        <table className="accounts-react-table">
          <thead>
            <tr>
              <th>PRODUK &amp; PAKET</th>
              <th>CREDENTIAL LOGINS</th>
              <th>STATUS</th>
              <th style={{ textAlign: 'right' }}>AKSI</th>
            </tr>
          </thead>
          <tbody>
            {paginatedAccounts.length > 0 ? (
              paginatedAccounts.map((account) => (
                <tr key={account.id}>
                  <td>
                    <div className="prod-title">{account.product_name}</div>
                    <div className="pkg-badge">
                      <span>{account.package_name}</span>
                    </div>
                  </td>
                  <td>
                    <div className="cred-box">
                      <div className="cred-line">
                        <span className="cred-key">Login</span>
                        <span className="cred-val">{account.login}</span>
                      </div>
                      <div className="cred-line border-t">
                        <span className="cred-key">Password</span>
                        <span className="cred-val">{account.password}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`status-pill ${account.status}`}>
                      <span className="pill-dot" />
                      {account.status === 'available' ? 'Tersedia' : account.status === 'sold' ? 'Terjual' : 'Dinonaktifkan'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="actions-flex">
                      <a href={`/dashboard/accounts/${account.id}`} className="btn-edit">
                        Edit
                      </a>
                      {account.status !== 'sold' && (
                        <button
                          type="button"
                          onClick={() => handleDelete(account.id)}
                          disabled={deletingId === account.id}
                          className="btn-delete"
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="empty-td">
                  Tidak ada data stok akun.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#fff', borderTop: '1px solid #eee', fontSize: '13px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ color: '#666', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span>
            Menampilkan {filteredAccounts.length === 0 ? 0 : startIdx + 1}–{Math.min(startIdx + pageSize, filteredAccounts.length)} dari {filteredAccounts.length} akun
          </span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
            style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #ccc', background: '#fff', fontSize: '12px', cursor: 'pointer' }}
          >
            <option value={10}>10 / hal</option>
            <option value={25}>25 / hal</option>
            <option value={50}>50 / hal</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #ddd', background: safePage <= 1 ? '#f5f5f5' : '#fff', cursor: safePage <= 1 ? 'not-allowed' : 'pointer', fontWeight: 600, color: safePage <= 1 ? '#aaa' : '#333' }}
          >
            ← Prev
          </button>
          <span style={{ padding: '0 8px', fontWeight: 600, color: '#555' }}>
            Halaman {safePage} dari {totalPages}
          </span>
          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #ddd', background: safePage >= totalPages ? '#f5f5f5' : '#fff', cursor: safePage >= totalPages ? 'not-allowed' : 'pointer', fontWeight: 600, color: safePage >= totalPages ? '#aaa' : '#333' }}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
