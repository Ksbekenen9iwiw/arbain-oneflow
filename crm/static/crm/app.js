'use strict';

const container = document.getElementById('order-lines');
const addButton = document.getElementById('add-line');
const totalField = document.getElementById('id_lines-TOTAL_FORMS');
const template = document.getElementById('empty-order-line');
if (container && addButton && totalField && template) {
  addButton.addEventListener('click', () => {
    const index = Number(totalField.value);
    if (index >= 50) return;
    const markup = template.innerHTML.replaceAll('__prefix__', String(index));
    container.insertAdjacentHTML('beforeend', markup);
    totalField.value = String(index + 1);
    container.lastElementChild.querySelector('select')?.focus();
    if (index + 1 >= 50) addButton.disabled = true;
  });
  container.addEventListener('click', (event) => {
    const button = event.target.closest('.remove-line');
    if (!button) return;
    const row = button.closest('.order-line');
    const active = [...container.querySelectorAll('.order-line')].filter(el => !el.hidden);
    if (active.length <= 1) return;
    row.querySelector('input[name$="-DELETE"]').checked = true;
    row.hidden = true;
    row.querySelectorAll('[required]').forEach(el => el.removeAttribute('required'));
  });
}

document.addEventListener('submit', (event) => {
  if (event.defaultPrevented) return;
  event.target.querySelectorAll('button[type="submit"], button:not([type])').forEach(button => {
    if (!button.disabled) {
      button.dataset.submitDisabled = '1';
      button.disabled = true;
    }
  });
});
window.addEventListener('pageshow', () => {
  document.querySelectorAll('button[data-submit-disabled]').forEach(button => {
    button.disabled = false;
    delete button.dataset.submitDisabled;
  });
});

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
