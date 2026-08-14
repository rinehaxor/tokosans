-- =============================================================================
-- Seed Transactions: Inject dummy completed orders agar "Terjual" terlihat ramai
-- Jalankan di Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- =============================================================================
-- Script ini membuat order + order_items dummy dengan status 'completed'.
-- Jumlah terjual per produk bervariasi (tidak seragam) supaya natural.
-- Semua data dummy pakai email dummy@tokosans.local agar mudah dibedakan.
-- =============================================================================

DO $$
DECLARE
  v_product RECORD;
  v_order_id uuid;
  v_count int;
  v_i int;
  v_ref text;
  v_name text;
  v_ts timestamptz;
  v_names text[] := ARRAY[
    'Andi Wijaya', 'Budi Santoso', 'Citra Dewi', 'Dian Purnama', 'Eka Saputra',
    'Faisal Rahman', 'Gita Nuraini', 'Hendra Kusuma', 'Indah Lestari', 'Joko Prasetyo',
    'Kartika Sari', 'Lukman Hakim', 'Maya Anggraini', 'Nanda Permata', 'Omar Farhan',
    'Putri Handayani', 'Qori Maulana', 'Rina Marlina', 'Surya Dharma', 'Tania Safitri',
    'Umar Hidayat', 'Vina Oktavia', 'Wawan Hermawan', 'Xena Fitriani', 'Yusuf Ramadhan',
    'Zahra Amelia', 'Agus Firmansyah', 'Bunga Cempaka', 'Cahya Nugraha', 'Dewi Fortuna',
    'Erwin Pratama', 'Fitri Rahmawati', 'Guntur Prabowo', 'Hana Safira', 'Irfan Maulidi',
    'Jasmine Putri', 'Kevin Setiawan', 'Laras Wulandari', 'Miftah Ardiansyah', 'Nabila Azzahra'
  ];
BEGIN
  -- Loop setiap produk aktif
  FOR v_product IN
    SELECT id, name, price FROM products WHERE active = true
  LOOP
    -- Jumlah order per produk bervariasi: hash product id untuk seed
    v_count := 500 + (abs(hashtext(v_product.id)) % 1001);
    -- Ini menghasilkan 500–1500 orders per produk, bervariasi tiap produk

    FOR v_i IN 1..v_count LOOP
      -- Random timestamp dalam 90 hari terakhir
      v_ts := now() - (random() * interval '90 days');
      -- Random customer name
      v_name := v_names[1 + (floor(random() * array_length(v_names, 1)))::int];
      -- Unique reference
      v_ref := 'SEED-' || v_product.id || '-' || v_i || '-' || substr(gen_random_uuid()::text, 1, 6);

      -- Insert order
      INSERT INTO orders (order_number, customer_name, customer_email, total_amount, status, created_at)
      VALUES (v_ref, v_name, 'dummy@tokosans.local', v_product.price, 'completed', v_ts)
      RETURNING id INTO v_order_id;

      -- Insert order item
      INSERT INTO order_items (order_id, product_id, product_name, price, quantity)
      VALUES (v_order_id, v_product.id, v_product.name, v_product.price, 1);
    END LOOP;

    RAISE NOTICE 'Seeded % orders for product: % (%)', v_count, v_product.name, v_product.id;
  END LOOP;
END $$;

-- =============================================================================
-- Verifikasi: cek jumlah terjual per produk
-- =============================================================================
SELECT
  oi.product_id,
  oi.product_name,
  count(*) AS total_terjual
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE o.status IN ('paid', 'completed')
GROUP BY oi.product_id, oi.product_name
ORDER BY total_terjual DESC;

-- =============================================================================
-- CLEANUP (opsional): hapus semua seed data dummy jika perlu
-- Uncomment baris di bawah untuk menghapus:
-- =============================================================================
-- DELETE FROM orders WHERE customer_email = 'dummy@tokosans.local';
