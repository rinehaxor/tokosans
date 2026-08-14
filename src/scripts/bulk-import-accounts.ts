let parsedItems: Array<{ login: string; password: string }> = [];

const fileInput = document.getElementById('file-input') as HTMLInputElement | null;
const rawText = document.getElementById('raw-text') as HTMLTextAreaElement | null;
const uploadLabel = document.getElementById('upload-label');
const previewContainer = document.getElementById('preview-container');
const previewTbody = document.getElementById('preview-tbody');
const badgeValid = document.getElementById('badge-valid');
const badgeInvalid = document.getElementById('badge-invalid');
const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement | null;
const form = document.getElementById('bulk-import-form') as HTMLFormElement | null;

const notify = (type: string, message: string) =>
  window.dispatchEvent(new CustomEvent('app:toast', { detail: { type, message } }));

fileInput?.addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    if (uploadLabel) uploadLabel.textContent = `📄 File: ${file.name}`;
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (rawText && evt.target?.result) {
        rawText.value = evt.target.result as string;
        updatePreview();
      }
    };
    reader.readAsText(file);
  }
});

const getDelimiter = () => {
  const checked = document.querySelector('input[name="delimiter"]:checked') as HTMLInputElement | null;
  return checked ? checked.value : 'auto';
};

const parseLine = (line: string, delim: string) => {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let sep = delim;
  if (sep === 'auto') {
    if (trimmed.includes('\t')) sep = '\t';
    else if (trimmed.includes('|')) sep = '|';
    else if (trimmed.includes(':')) sep = ':';
    else if (trimmed.includes(',')) sep = ',';
  } else if (sep === 'tab') sep = '\t';

  const parts = trimmed.split(sep);
  if (parts.length >= 2) {
    const login = parts[0].trim();
    const password = parts.slice(1).join(sep).trim();
    if (login && password) return { login, password };
  }
  return null;
};

const updatePreview = () => {
  if (!rawText) return;
  const text = rawText.value;
  const lines = text.split('\n');
  const delim = getDelimiter();
  parsedItems = [];
  let invalidCount = 0;

  lines.forEach((line) => {
    if (!line.trim()) return;
    const item = parseLine(line, delim);
    if (item) parsedItems.push(item);
    else invalidCount++;
  });

  if (parsedItems.length > 0 || invalidCount > 0) {
    if (previewContainer) previewContainer.style.display = 'block';
    if (submitBtn) submitBtn.disabled = parsedItems.length === 0;
    if (badgeValid) badgeValid.textContent = `${parsedItems.length} Valid`;
    if (badgeInvalid) {
      if (invalidCount > 0) {
        badgeInvalid.style.display = 'inline-flex';
        badgeInvalid.textContent = `${invalidCount} Dilewati`;
      } else badgeInvalid.style.display = 'none';
    }

    if (previewTbody) {
      previewTbody.innerHTML = parsedItems
        .slice(0, 50)
        .map((item, idx) => `<tr><td>${idx + 1}</td><td style="color:var(--v);font-weight:600;">${escapeHtml(item.login)}</td><td>${escapeHtml(item.password)}</td></tr>`)
        .join('');
    }
  } else {
    if (previewContainer) previewContainer.style.display = 'none';
    if (submitBtn) submitBtn.disabled = true;
  }
};

function escapeHtml(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

rawText?.addEventListener('input', updatePreview);
document.querySelectorAll('input[name="delimiter"]').forEach((el) => el.addEventListener('change', updatePreview));

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (parsedItems.length === 0) return notify('error', 'Tidak ada akun valid.');

  const formData = new FormData(form);
  const productId = formData.get('productId') as string;
  const packageId = formData.get('packageId') as string;

  if (!productId || !packageId) return notify('error', 'Pilih Produk dan Paket.');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const res = await fetch('/api/admin/accounts/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, packageId, items: parsedItems }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Gagal impor');

    notify('success', `Berhasil mengimpor ${data.count} akun!`);
    setTimeout(() => { window.location.href = '/dashboard/accounts'; }, 1000);
  } catch (err: any) {
    notify('error', err.message || 'Gagal mengimpor akun.');
    if (submitBtn) submitBtn.disabled = false;
  }
});
