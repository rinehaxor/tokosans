-- === Migrasi: Top Up Game via Digiflazz ===
-- Jalankan di Supabase SQL Editor.

alter table product_packages add column if not exists digiflazz_sku text;
alter table product_packages add column if not exists requires_customer_no boolean not null default false;
alter table product_packages add column if not exists customer_no_label text not null default 'User ID';

alter table order_items add column if not exists digiflazz_sku text;
alter table order_items add column if not exists customer_no text;
alter table order_items add column if not exists digiflazz_ref_id text;
alter table order_items add column if not exists digiflazz_status text;
alter table order_items add column if not exists digiflazz_sn text;

create index if not exists order_items_order_idx on order_items(order_id);
