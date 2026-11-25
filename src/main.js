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
let pdfDocument = null;
let currentPage = 1;
let zoom = 1.15;
let toastTimer;

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function switchPage(page) {
  document.querySelectorAll('.tab').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  $('createPage').classList.toggle('active', page === 'create');
  $('readerPage').classList.toggle('active', page === 'reader');
}

document.querySelectorAll('.tab').forEach(button => {
  button.addEventListener('click', () => switchPage(button.dataset.page));
});

async function showPdf(bytes, name) {
  currentPdfBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  currentPdfName = name || 'document.pdf';
  currentPage = 1;
  zoom = 1.15;
  pdfDocument = await pdfjsLib.getDocument({ data: currentPdfBytes.slice() }).promise;
  $('previewTitle').textContent = currentPdfName;
  $('previewPanel').hidden = false;
  $('emptyReader').hidden = true;
  switchPage('reader');
  await renderPage();
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
}

$('pdfForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = $('docTitle').value.trim();
  const body = $('docBody').value.trim();
  if (!title || !body) return toast('Enter a title and document content first.');

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(title, 18, 22, { maxWidth: 174 });
  doc.setDrawColor(220, 225, 235);
  doc.line(18, 31, 192, 31);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const lines = doc.splitTextToSize(body, 174);
  let y = 42;
  for (const line of lines) {
    if (y > 278) { doc.addPage(); y = 20; }
    doc.text(line, 18, y);
    y += 6;
  }
  const blob = doc.output('arraybuffer');
  const safeName = title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'document';
  await showPdf(new Uint8Array(blob), `${safeName}.pdf`);
  toast('PDF created. Preview it and save when ready.');
});

$('pdfPicker').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    toast('Please choose a PDF file.');
    event.target.value = '';
    return;
  }
  try {
    await showPdf(new Uint8Array(await file.arrayBuffer()), file.name);
    toast('PDF opened successfully.');
  } catch (error) {
    console.error(error);
    toast('Could not open this PDF. It may be damaged or protected.');
  } finally {
    event.target.value = '';
  }
});

$('prevPage').addEventListener('click', async () => {
  if (currentPage > 1) { currentPage--; await renderPage(); }
});
$('nextPage').addEventListener('click', async () => {
  if (pdfDocument && currentPage < pdfDocument.numPages) { currentPage++; await renderPage(); }
});
$('zoomIn').addEventListener('click', async () => { zoom = Math.min(zoom + 0.2, 2.5); await renderPage(); });
$('zoomOut').addEventListener('click', async () => { zoom = Math.max(zoom - 0.2, 0.6); await renderPage(); });

async function savePdf() {
  if (!currentPdfBytes) return toast('Open or generate a PDF first.');
  const base64 = bytesToBase64(currentPdfBytes);
  if (Capacitor.isNativePlatform()) {
    try {
      const saved = await Filesystem.writeFile({
        path: currentPdfName,
        data: base64,
        directory: Directory.Cache,
        encoding: Encoding.Base64
      });
      await Share.share({
        title: currentPdfName,
        text: 'PDF document',
        files: [saved.uri],
        dialogTitle: 'Save or share your PDF'
      });
    } catch (error) {
      console.error(error);
      toast('Could not open the save/share panel.');
    }
  } else {
    const blob = new Blob([currentPdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = currentPdfName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('PDF download started.');
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

$('downloadPdf').addEventListener('click', savePdf);

// The core app is bundled locally. This service worker is optional for browser hosting;
// Android builds package the built files directly and do not depend on GitHub Pages.
if ('serviceWorker' in navigator && !Capacitor.isNativePlatform()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
