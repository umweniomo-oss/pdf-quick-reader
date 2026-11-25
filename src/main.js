import './style.css';
import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
const $ = (id) => document.getElementById(id);
let currentPdfBytes = null;
let currentPdfName = 'document.pdf';
let currentDocId = null;
let pdfDocument = null;
let currentPage = 1;
let zoom = 1.15;
let toastTimer;
const HISTORY_KEY = 'pqr-reading-history-v1';
const DB_NAME = 'pdf-quick-reader-library';
const DB_STORE = 'documents';

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function switchPage(page) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  $('homePage').classList.toggle('active', page === 'home');
  $('createPage').classList.toggle('active', page === 'create');
  $('readerPage').classList.toggle('active', page === 'reader');
}
document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => switchPage(button.dataset.page)));
$('heroOpen').addEventListener('click', () => $('pdfPicker').click());
$('heroCreate').addEventListener('click', () => switchPage('create'));

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function storePdf(id, bytes) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put({ id, bytes: bytes.slice().buffer });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
async function getStoredPdf(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(id);
    req.onsuccess = () => { const result = req.result; db.close(); resolve(result?.bytes || null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}
async function deleteStoredPdf(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function setHistory(items) { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 30))); }
function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
async function makeThumbnail(bytes) {
  const task = pdfjsLib.getDocument({ data: bytes.slice() });
  const doc = await task.promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 0.34 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  const data = canvas.toDataURL('image/jpeg', 0.68);
  await doc.destroy();
  return data;
}
async function addToHistory(bytes, name, page = 1) {
  const id = currentDocId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  currentDocId = id;
  await storePdf(id, bytes);
  let thumbnail = '';
  try { thumbnail = await makeThumbnail(bytes); } catch (e) { console.warn('Thumbnail unavailable', e); }
  const history = getHistory().filter(item => item.id !== id);
  history.unshift({ id, name, page, updatedAt: Date.now(), size: bytes.byteLength, thumbnail });
  setHistory(history);
  renderHistory();
}
async function updateProgress() {
  if (!currentDocId) return;
  const history = getHistory();
  const item = history.find(x => x.id === currentDocId);
  if (!item) return;
  item.page = currentPage;
  item.updatedAt = Date.now();
  setHistory(history);
  renderHistory();
}
function renderHistory() {
  const history = getHistory();
  $('historyCount').textContent = `${history.length} ${history.length === 1 ? 'file' : 'files'}`;
  const list = $('recentList');
  if (!history.length) {
    list.innerHTML = '<div class="empty-library"><div class="empty-icon">▤</div><strong>No recent documents yet</strong><span>PDFs you open will be saved here on this device.</span></div>';
    $('continueCard').classList.add('empty-continue');
    $('continueCard').innerHTML = '<div class="empty-art">📖</div><div><strong>Your reading journey starts here</strong><p>Open a PDF and it will appear here with your last page saved.</p></div>';
    return;
  }
  const latest = history[0];
  $('continueCard').classList.remove('empty-continue');
  $('continueCard').innerHTML = `<img class="continue-thumb" src="${latest.thumbnail || './pdf-illustration.png'}" alt="PDF preview"><div class="continue-info"><span class="continue-label">CONTINUE READING</span><strong>${escapeHtml(latest.name)}</strong><p>Last opened ${formatDate(latest.updatedAt)} · Page ${latest.page}</p><button class="primary continue-button" data-open="${latest.id}" type="button">Continue reading →</button></div>`;
  list.innerHTML = history.map(item => `<article class="recent-card"><button class="thumb-button" data-open="${item.id}" type="button"><img class="doc-thumb" src="${item.thumbnail || './pdf-illustration.png'}" alt="First page preview"></button><div class="recent-info"><strong>${escapeHtml(item.name)}</strong><span>${formatBytes(item.size)} · Page ${item.page}</span><small>${formatDate(item.updatedAt)}</small><button class="open-link" data-open="${item.id}" type="button">Open document</button></div><button class="remove-button" data-remove="${item.id}" aria-label="Remove from history" type="button">×</button></article>`).join('');
}
function formatBytes(bytes) {
  if (!bytes) return 'PDF';
  return bytes < 1024*1024 ? `${Math.max(1, Math.round(bytes/1024))} KB` : `${(bytes/1024/1024).toFixed(1)} MB`;
}
async function openFromHistory(id) {
  const item = getHistory().find(x => x.id === id);
  if (!item) return;
  try {
    const stored = await getStoredPdf(id);
    if (!stored) { toast('This saved PDF is no longer available. Please choose it again.'); return; }
    currentDocId = id;
    await showPdf(new Uint8Array(stored), item.name, item.page || 1, false);
  } catch (error) {
    console.error(error);
    toast('Could not reopen this document.');
  }
}
$('recentList').addEventListener('click', event => {
  const open = event.target.closest('[data-open]');
  const remove = event.target.closest('[data-remove]');
  if (open) openFromHistory(open.dataset.open);
  if (remove) removeHistoryItem(remove.dataset.remove);
});
$('continueCard').addEventListener('click', event => {
  const open = event.target.closest('[data-open]');
  if (open) openFromHistory(open.dataset.open);
});
async function removeHistoryItem(id) {
  const history = getHistory().filter(item => item.id !== id);
  setHistory(history);
  await deleteStoredPdf(id);
  if (currentDocId === id) currentDocId = null;
  renderHistory();
  toast('Document removed from reading history.');
}
$('clearHistory').addEventListener('click', async () => {
  const history = getHistory();
  if (!history.length) return;
  if (!confirm('Remove all documents from reading history on this device?')) return;
  await Promise.all(history.map(item => deleteStoredPdf(item.id)));
  setHistory([]);
  renderHistory();
  toast('Reading history cleared.');
});

async function showPdf(bytes, name, startPage = 1, saveHistory = true) {
  currentPdfBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  currentPdfName = name || 'document.pdf';
  if (!currentDocId) currentDocId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  currentPage = Math.max(1, Number(startPage) || 1);
  zoom = 1.15;
  pdfDocument = await pdfjsLib.getDocument({ data: currentPdfBytes.slice() }).promise;
  currentPage = Math.min(currentPage, pdfDocument.numPages);
  $('previewTitle').textContent = currentPdfName;
  $('previewPanel').hidden = false;
  $('emptyReader').hidden = true;
  switchPage('reader');
  await renderPage();
  if (saveHistory) await addToHistory(currentPdfBytes, currentPdfName, currentPage);
}
async function renderPage() {
  if (!pdfDocument) return;
  const page = await pdfDocument.getPage(currentPage);
  const viewport = page.getViewport({ scale: zoom });
  const canvas = $('pdfCanvas');
  const context = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  await page.render({ canvasContext: context, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
  $('pageCounter').textContent = `Page ${currentPage} of ${pdfDocument.numPages}`;
  $('prevPage').disabled = currentPage <= 1;
  $('nextPage').disabled = currentPage >= pdfDocument.numPages;
  await updateProgress();
}
$('pdfForm').addEventListener('submit', async event => {
  event.preventDefault();
  const title = $('docTitle').value.trim();
  const body = $('docBody').value.trim();
  if (!title || !body) return toast('Enter a title and document content first.');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text(title, 18, 22, { maxWidth: 174 });
  doc.setDrawColor(220, 225, 235); doc.line(18, 31, 192, 31);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  const lines = doc.splitTextToSize(body, 174);
  let y = 42;
  for (const line of lines) { if (y > 278) { doc.addPage(); y = 20; } doc.text(line, 18, y); y += 6; }
  currentDocId = null;
  await showPdf(new Uint8Array(doc.output('arraybuffer')), `${title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'document'}.pdf`);
  toast('PDF created and added to your recent documents.');
});
$('pdfPicker').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    toast('Please choose a PDF file.'); event.target.value = ''; return;
  }
  try {
    currentDocId = null;
    await showPdf(new Uint8Array(await file.arrayBuffer()), file.name);
    toast('PDF opened and saved to reading history.');
  } catch (error) {
    console.error(error); toast('Could not open this PDF. It may be damaged or protected.');
  } finally { event.target.value = ''; }
});
$('prevPage').addEventListener('click', async () => { if (currentPage > 1) { currentPage--; await renderPage(); } });
$('nextPage').addEventListener('click', async () => { if (pdfDocument && currentPage < pdfDocument.numPages) { currentPage++; await renderPage(); } });
$('zoomIn').addEventListener('click', async () => { zoom = Math.min(zoom + 0.2, 2.5); await renderPage(); });
$('zoomOut').addEventListener('click', async () => { zoom = Math.max(zoom - 0.2, 0.6); await renderPage(); });

async function savePdf() {
  if (!currentPdfBytes) return toast('Open or generate a PDF first.');
  const base64 = bytesToBase64(currentPdfBytes);
  if (Capacitor.isNativePlatform()) {
    try {
      const saved = await Filesystem.writeFile({ path: currentPdfName, data: base64, directory: Directory.Cache, encoding: Encoding.Base64 });
      await Share.share({ title: currentPdfName, text: 'PDF document', files: [saved.uri], dialogTitle: 'Save or share your PDF' });
    } catch (error) { console.error(error); toast('Could not open the save/share panel.'); }
  } else {
    const blob = new Blob([currentPdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = currentPdfName; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('PDF download started.');
  }
}
function bytesToBase64(bytes) {
  let binary = ''; const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  return btoa(binary);
}
$('downloadPdf').addEventListener('click', savePdf);
renderHistory();
