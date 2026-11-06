-- Read-only; compatible with SQLite and PostgreSQL.
-- All mismatch queries below should return zero rows.
SELECT 'customers' AS entity, COUNT(*) AS total FROM crm_customer
UNION ALL SELECT 'products', COUNT(*) FROM crm_product
UNION ALL SELECT 'orders', COUNT(*) FROM crm_order
UNION ALL SELECT 'samples', COUNT(*) FROM crm_samplerequest
UNION ALL SELECT 'purchase_orders', COUNT(*) FROM crm_purchaseorder;

SELECT status, COUNT(*) AS orders, SUM(total_rupiah) AS value_rupiah
FROM crm_order GROUP BY status ORDER BY status;

SELECT o.id, o.total_rupiah, COALESCE(SUM(l.quantity * l.unit_price_rupiah), 0) AS line_total
FROM crm_order o LEFT JOIN crm_orderline l ON l.order_id = o.id
GROUP BY o.id, o.total_rupiah
HAVING o.total_rupiah <> COALESCE(SUM(l.quantity * l.unit_price_rupiah), 0);

SELECT p.sku, i.on_hand, i.reserved,
       COALESCE(b.physical, 0) AS batch_physical, COALESCE(b.reserved, 0) AS batch_reserved
FROM crm_product p JOIN crm_inventorybalance i ON i.product_id = p.id
LEFT JOIN (SELECT product_id, SUM(on_hand) AS physical, SUM(reserved) AS reserved
           FROM crm_stockbatch GROUP BY product_id) b ON b.product_id = p.id
WHERE i.on_hand <> COALESCE(b.physical, 0) OR i.reserved <> COALESCE(b.reserved, 0);

SELECT b.id, b.code, b.on_hand, COALESCE(m.physical, 0) AS ledger_physical
FROM crm_stockbatch b
LEFT JOIN (SELECT batch_id, SUM(delta) AS physical FROM crm_stockmovement GROUP BY batch_id) m ON m.batch_id = b.id
WHERE b.on_hand <> COALESCE(m.physical, 0);

SELECT b.id, b.code, b.reserved,
       COALESCE(o.qty, 0) + COALESCE(s.qty, 0) AS allocated
FROM crm_stockbatch b
LEFT JOIN (SELECT batch_id, SUM(quantity) AS qty FROM crm_batchallocation GROUP BY batch_id) o ON o.batch_id = b.id
LEFT JOIN (SELECT batch_id, SUM(quantity) AS qty FROM crm_sampleallocation GROUP BY batch_id) s ON s.batch_id = b.id
WHERE b.reserved <> COALESCE(o.qty, 0) + COALESCE(s.qty, 0) OR b.reserved > b.on_hand;

-- Current stock overview: physical availability differs from eligible FEFO stock.
SELECT p.sku, p.name, i.on_hand, i.reserved, i.on_hand - i.reserved AS available, p.min_stock
FROM crm_product p JOIN crm_inventorybalance i ON i.product_id = p.id ORDER BY p.sku;
