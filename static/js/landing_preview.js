'use strict';
let language = 'th';
const rows = Array.from(document.querySelectorAll('[data-row]'));
function select(row) {
  rows.forEach(item => item.setAttribute('aria-pressed', String(item === row)));
  document.getElementById('sample-label').textContent = row.dataset.row;
  document.getElementById('sample-value').textContent = language === 'th'
    ? `ค่าที่พิมพ์: ${row.dataset.value} ${row.dataset.unit} · ช่วงในรายงาน: ${row.dataset.reference}`
    : `Printed value: ${row.dataset.value} ${row.dataset.unit} · Printed interval: ${row.dataset.reference}`;
}
rows.forEach(row => row.addEventListener('click', () => select(row)));
document.getElementById('preview-language').addEventListener('click', event => {
  language = language === 'th' ? 'en' : 'th';
  document.documentElement.lang = language;
  document.querySelectorAll('[data-th]').forEach(node => { node.textContent = node.dataset[language]; });
  event.currentTarget.textContent = language === 'th' ? 'EN' : 'TH';
  event.currentTarget.setAttribute('aria-label', language === 'th' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย');
  select(rows.find(row => row.getAttribute('aria-pressed') === 'true'));
});
