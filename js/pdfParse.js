// pdf.js v4+ ships as an ES module, so it's imported directly here rather
// than via a global CDN <script> tag. Reads the embedded text layer of
// digitally-generated PDFs — no OCR, so this only works on real PDFs with
// selectable text, not scans/photos.
import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.1.200/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.1.200/pdf.worker.min.mjs';

export async function extractPdfText(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(' ') + '\n';
  }
  return text;
}

const PO_RE = /\bPO-[A-Za-z0-9]+\b/i;
const INV_RE = /\bINV?-?\d{4,}\b/i;

export function parsePoInvoice(text) {
  const po = text.match(PO_RE);
  const inv = text.match(INV_RE);
  return {
    poNumber: po ? po[0].toUpperCase() : '',
    invoiceNumber: inv ? inv[0].toUpperCase() : '',
  };
}
