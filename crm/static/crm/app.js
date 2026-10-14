 'use strict';
const money = value => 'Rp ' + new Intl.NumberFormat('id-ID').format(value);
const catalogData = document.getElementById('product-catalog-data');
const catalog = catalogData ? JSON.parse(catalogData.textContent) : [];
const products = new Map(catalog.map(product => [product.id, product]));
const container = document.getElementById('order-lines');
const addButton = document.getElementById('add-line');
const totalField = document.getElementById('id_lines-TOTAL_FORMS');
const template = document.getElementById('empty-order-line');
const activeRows = () => [...container.querySelectorAll('.order-line')].filter(row => !row.hidden);
const validInteger = value => /^\d+$/.test(value) && BigInt(value) <= 9223372036854775807n;
function updateOrder() {
  if (!container) return;
  let total = 0n, count = 0, invalid = false;
  const requested = new Map();
  activeRows().forEach(row => {
    const product = products.get(row.querySelector('select').value);
    const raw = row.querySelector('input[name$="-quantity"]').value;
    const stock = row.querySelector('.line-stock');
    const subtotal = row.querySelector('.line-subtotal');
    row.querySelector('.remove-line').disabled = activeRows().length <= 1;
    stock.classList.remove('text-danger');
    if (!product) { stock.textContent = 'Pilih produk untuk melihat harga dan stok.'; subtotal.textContent = '—'; if (raw) invalid = true; return; }
    stock.textContent = `${money(BigInt(product.price))} / ${product.unit} · tersedia ${product.available} ${product.unit}`;
    if (!validInteger(raw) || BigInt(raw) < 1n) { subtotal.textContent = '—'; invalid = true; return; }
    const quantity = BigInt(raw);
    const amount = BigInt(product.price) * quantity;
    requested.set(product.id, (requested.get(product.id) || 0n) + quantity);
    total += amount; count++;
    subtotal.textContent = money(amount);
  });
  let short = false;
  activeRows().forEach(row => {
    const product = products.get(row.querySelector('select').value);
    if (product && (requested.get(product.id) || 0n) > BigInt(product.available)) {
      short = true;
      row.querySelector('.line-stock').classList.add('text-danger');
      row.querySelector('.line-stock').textContent += ' · stok belum cukup';
    }
  });
  document.getElementById('summary-count').textContent = String(count);
  document.getElementById('summary-total').textContent = invalid ? 'Lengkapi produk' : money(total);
  const warning = document.getElementById('summary-warning');
  warning.hidden = !short;
  warning.textContent = 'Jumlah pesanan melebihi stok tersedia. Draft dapat disimpan; stok perlu dicukupi sebelum konfirmasi.';
  const customer = document.getElementById('id_customer');
  document.getElementById('summary-customer').textContent = customer.value ? customer.selectedOptions[0].textContent : 'Pilih pelanggan';
  addButton.disabled = Number(totalField.value) >= 50;
}
function addOrderRow() {
  if (Number(totalField.value) >= 50) return null;
  const index = Number(totalField.value);
  container.insertAdjacentHTML('beforeend', template.innerHTML.replaceAll('__prefix__', String(index)));
  totalField.value = String(index + 1);
  updateOrder();
  return container.lastElementChild;
}
if (container && addButton && totalField && template) {
  addButton.addEventListener('click', () => addOrderRow()?.querySelector('select').focus());
  container.addEventListener('input', updateOrder);
  container.addEventListener('change', updateOrder);
  container.addEventListener('click', event => {
    const button = event.target.closest('.remove-line');
    if (!button || activeRows().length <= 1) return;
    const row = button.closest('.order-line');
    row.querySelector('input[name$="-DELETE"]').checked = true;
    row.hidden = true;
    row.querySelectorAll('[required]').forEach(field => field.removeAttribute('required'));
    updateOrder();
    activeRows().at(-1)?.querySelector('select').focus();
  });
  document.getElementById('id_customer').addEventListener('change', updateOrder);
  updateOrder();
  const dialog = document.getElementById('product-dialog');
  const browse = document.getElementById('browse-products');
  const search = document.getElementById('catalog-search');
  const list = document.getElementById('catalog-list');
  if (dialog && typeof dialog.showModal === 'function') {
    browse.hidden = false;
    function renderCatalog() {
      list.replaceChildren();
      const query = search.value.trim().toLocaleLowerCase('id-ID');
      const matches = catalog.filter(product => `${product.name} ${product.sku}`.toLocaleLowerCase('id-ID').includes(query));
      matches.forEach(product => {
        const option = document.createElement('button');
        option.type = 'button'; option.className = 'catalog-option';
        const identity = document.createElement('span');
        const name = document.createElement('strong'); name.textContent = product.name;
        const sku = document.createElement('small'); sku.textContent = `${product.sku} · ${product.unit}`;
        identity.append(name, sku);
        const value = document.createElement('span'); value.textContent = money(BigInt(product.price));
        const stock = document.createElement('small'); stock.textContent = `Tersedia ${product.available}`; value.append(stock);
        const plus = document.createElement('b'); plus.textContent = '+';
        option.append(identity, value, plus);
        option.addEventListener('click', () => {
          const row = activeRows().find(row => !row.querySelector('select').value) || addOrderRow();
          if (!row) { search.value = ''; list.textContent = 'Maksimal 50 baris produk. Tutup pemilih untuk mengubah baris yang ada.'; return; }
          row.querySelector('select').value = product.id;
          const quantity = row.querySelector('input[name$="-quantity"]');
          if (!quantity.value) quantity.value = '1';
          quantity.dispatchEvent(new Event('input', {bubbles:true}));
          dialog.close(); quantity.focus(); quantity.select();
        });
        list.append(option);
      });
      if (!matches.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'Tidak ada produk yang cocok. Coba nama atau SKU lain.'; list.append(empty); }
    }
    browse.addEventListener('click', () => { search.value = ''; renderCatalog(); dialog.showModal(); search.focus(); });
    search.addEventListener('input', renderCatalog);
  }
}
// Confirm consequential transactions without losing the submitted form or CSRF token.
const confirmDialog = document.getElementById('confirm-dialog');
let pendingForm = null;
if (confirmDialog) {
  document.getElementById('confirm-back').addEventListener('click', () => confirmDialog.close());
  document.getElementById('confirm-proceed').addEventListener('click', () => {
    const form = pendingForm;
    confirmDialog.close();
    if (form) { form.dataset.confirmed = 'yes'; form.requestSubmit(); }
  });
  confirmDialog.addEventListener('close', () => { pendingForm = null; });
}
let dirty = false;
const editedForms = document.querySelectorAll('.form-panel form, .edit-form, #order-form');
editedForms.forEach(form => form.addEventListener('input', () => { dirty = true; }));
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('submit', event => {
  const form = event.target;
  if (event.defaultPrevented || form.method === 'dialog') return;
  if (form.dataset.confirm && form.dataset.confirmed !== 'yes' && confirmDialog && typeof confirmDialog.showModal === 'function') {
    event.preventDefault(); pendingForm = form;
    document.getElementById('confirm-title').textContent = form.dataset.confirm;
    document.getElementById('confirm-description').textContent = form.dataset.description;
    document.getElementById('confirm-proceed').textContent = form.dataset.confirmLabel;
    confirmDialog.showModal(); document.getElementById('confirm-back').focus(); return;
  }
  dirty = false;
  form.querySelectorAll('button[type="submit"], button:not([type])').forEach(button => {
    if (!button.disabled) { button.dataset.submitDisabled = '1'; button.disabled = true; button.classList.add('is-loading'); }
  });
});
window.addEventListener('pageshow', () => {
  document.querySelectorAll('button[data-submit-disabled]').forEach(button => { button.disabled = false; button.classList.remove('is-loading'); delete button.dataset.submitDisabled; });
  document.querySelectorAll('form[data-confirmed]').forEach(form => delete form.dataset.confirmed);
  updateOrder();
});
document.querySelectorAll('.dismiss-notice').forEach(button => button.addEventListener('click', () => button.closest('.notice').remove()));
// Reveal fields that belong to the current action; their values remain intact when switching.
document.querySelectorAll('select[name="outcome"]').forEach(select => {
  const next = select.form.querySelector('[name="next_date"]');
  const note = select.form.querySelector('[name="note"]');
  function updateOutcome() {
    if (next) { next.closest('.field')?.toggleAttribute('hidden', select.value !== 'SNOOZED'); next.disabled = select.value !== 'SNOOZED'; next.required = select.value === 'SNOOZED'; }
    if (note) note.required = select.value === 'DISMISSED';
  }
  select.addEventListener('change', updateOutcome); updateOutcome();
});
const activityStatus = document.querySelector('select[name="status"]');
const activityResult = document.querySelector('textarea[name="result"]');
if (activityStatus && activityResult) {
  const updateActivity = () => { const done = activityStatus.value === 'DONE'; activityResult.closest('.field')?.toggleAttribute('hidden', !done); activityResult.disabled = !done; activityResult.required = done; };
  activityStatus.addEventListener('change', updateActivity); updateActivity();
}
const stockPreview = document.querySelector('.stock-preview');
if (stockPreview) {
  const amount = document.querySelector('[name="quantity"], [name="counted_quantity"]');
  function updateStock() {
    const raw = amount.value;
    const result = document.getElementById('stock-preview-value');
    const note = document.getElementById('stock-preview-note');
    if (!validInteger(raw)) { result.textContent = '—'; note.textContent = 'Masukkan jumlah bulat yang valid.'; return; }
    const current = BigInt(stockPreview.dataset.onHand);
    const next = stockPreview.dataset.mode === 'count' ? BigInt(raw) : current + BigInt(raw);
    const available = next - BigInt(stockPreview.dataset.reserved);
    result.textContent = new Intl.NumberFormat('id-ID').format(next);
    note.textContent = `${next >= current ? '+' : ''}${next - current} dari fisik saat ini · tersedia ${available}`;
    note.classList.toggle('text-danger', available < 0n);
  }
  amount.addEventListener('input', updateStock); updateStock();
}
// Keep list filters and scroll position when returning from a record.
try {
  const lists = ['/customers/', '/orders/', '/stock/'];
  if (lists.includes(location.pathname)) {
    sessionStorage.setItem('oneflow-list:' + location.pathname, location.pathname + location.search);
    const key = 'oneflow-scroll:' + location.pathname + location.search;
    if (performance.getEntriesByType('navigation')[0]?.type === 'back_forward') window.scrollTo(0, Number(sessionStorage.getItem(key) || 0));
    window.addEventListener('pagehide', () => sessionStorage.setItem(key, String(window.scrollY)));
  }
  document.querySelectorAll('a.back-link').forEach(link => { const path = new URL(link.href).pathname; const saved = sessionStorage.getItem('oneflow-list:' + path); if (saved && new URL(saved, location.origin).origin === location.origin && new URL(saved, location.origin).pathname === path) link.href = saved; });
} catch (_) { /* Navigation remains usable if storage is unavailable. */ }
const firstError = document.querySelector('.field:has(.errorlist) input, .field:has(.errorlist) select, .field:has(.errorlist) textarea');
if (firstError) { firstError.setAttribute('aria-invalid', 'true'); firstError.focus(); }
const priceInput = document.getElementById('id_price_rupiah');
const nameInput = document.getElementById('id_name');
const pricePreview = document.getElementById('preview-price');
const priceChange = document.getElementById('preview-price-change');
const namePreview = document.getElementById('preview-product-name');
if (priceInput && pricePreview && priceChange) {
  const formatter = new Intl.NumberFormat('id-ID', {maximumFractionDigits: 0});
  const original = BigInt(pricePreview.dataset.originalPrice);
  const updatePricePreview = () => {
    const raw = priceInput.value.trim();
    if (!/^\d+$/.test(raw) || BigInt(raw) > 9223372036854775807n) {
      pricePreview.textContent = '—';
      priceChange.textContent = 'Isi harga rupiah yang valid';
      return;
    }
    const amount = BigInt(raw);
    const difference = amount - original;
    pricePreview.textContent = 'Rp ' + formatter.format(amount);
    priceChange.textContent = difference === 0n ? 'Harga belum berubah' :
      (difference > 0n ? '+Rp ' : '−Rp ') + formatter.format(difference > 0n ? difference : -difference) + ' dari harga tersimpan';
  };
  priceInput.addEventListener('input', updatePricePreview);
  updatePricePreview();
}
if (nameInput && namePreview) {
  nameInput.addEventListener('input', () => {
    namePreview.textContent = nameInput.value.trim() || 'Nama produk';
  });
}
