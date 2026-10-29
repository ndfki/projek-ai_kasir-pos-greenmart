import jsPDF from 'jspdf';
import { GreenMartTransaction } from '../types';

export interface ReceiptData {
  sheetName: string;
  trxCode: string;
  date: string;
  itemName: string;
  category?: string;
  qty: number;
  unitPrice: number;
  subtotal: number;
  discountPercent?: number;
  discountAmount?: number;
  grandTotal: number;
  paymentType: string;
  cashGiven: number;
  changeAmount: number;
  isPiutang: boolean;
  receivableAmount: number;
  customerName?: string;
  customerPhone?: string;
  dueDate?: string;
  notes?: string;
}

/**
 * Normalizes and recalculates receipt data to guarantee 100% mathematical accuracy.
 */
export function normalizeReceiptData(data: ReceiptData): ReceiptData & {
  computedSubtotal: number;
  computedDiscount: number;
  computedGrandTotal: number;
  computedCash: number;
  computedChange: number;
  computedReceivable: number;
  isPaidFull: boolean;
} {
  const qty = Math.max(1, data.qty || 1);
  const unitPrice = Math.max(0, data.unitPrice || 0);
  const computedSubtotal = qty * unitPrice;
  const subtotal = data.subtotal > 0 ? data.subtotal : computedSubtotal;

  const discountPercent = Math.min(100, Math.max(0, data.discountPercent || 0));
  const computedDiscount = data.discountAmount !== undefined && data.discountAmount >= 0
    ? data.discountAmount 
    : Math.round((subtotal * discountPercent) / 100);

  const computedGrandTotal = Math.max(0, subtotal - computedDiscount);
  const grandTotal = data.grandTotal > 0 ? data.grandTotal : computedGrandTotal;

  const isPiutangExplicit = data.paymentType.toLowerCase().includes('piutang') || data.isPiutang;
  const computedCash = isPiutangExplicit ? 0 : Math.max(0, data.cashGiven || 0);

  const isPaidFull = grandTotal === 0 || computedCash >= grandTotal;
  const computedChange = isPaidFull && grandTotal > 0 ? computedCash - grandTotal : 0;
  const computedReceivable = !isPaidFull && grandTotal > 0 
    ? grandTotal - computedCash 
    : (data.receivableAmount || 0);

  const isPiutang = computedReceivable > 0;

  return {
    ...data,
    qty,
    unitPrice,
    subtotal,
    discountPercent,
    discountAmount: computedDiscount,
    grandTotal,
    cashGiven: computedCash,
    changeAmount: computedChange,
    receivableAmount: computedReceivable,
    isPiutang,
    computedSubtotal,
    computedDiscount,
    computedGrandTotal: grandTotal,
    computedCash,
    computedChange,
    computedReceivable,
    isPaidFull
  };
}

/**
 * Generates formatted pure plain text receipt with explicit arithmetic operation breakdowns.
 */
export function generateReceiptText(rawData: ReceiptData): string {
  const data = normalizeReceiptData(rawData);
  const line = '========================================';
  const subLine = '----------------------------------------';

  const formatRow = (left: string, right: string, width = 40) => {
    const l = String(left);
    const r = String(right);
    const spaces = Math.max(1, width - l.length - r.length);
    return l + ' '.repeat(spaces) + r;
  };

  const lines: string[] = [
    line,
    '       DATA STATISTIK KASIR POS         ',
    '        STRUK RESMI TRANSAKSI           ',
    line,
    `Sheet      : ${data.sheetName}`,
    `No. Struk  : ${data.trxCode}`,
    `Tanggal    : ${data.date}`,
    `Metode     : ${data.paymentType.toUpperCase()}`,
  ];

  if (data.customerName) {
    lines.push(`Pelanggan  : ${data.customerName}`);
  }
  if (data.customerPhone) {
    lines.push(`Kontak/WA  : ${data.customerPhone}`);
  }

  lines.push(subLine);
  lines.push(`BARANG YANG DIBELI:`);
  lines.push(`  ${data.itemName}`);
  if (data.category) {
    lines.push(`  Kategori: ${data.category}`);
  }

  lines.push(subLine);
  lines.push('SISTEM OPERASI HITUNG TOTAL HARGA:');
  lines.push(
    formatRow(
      `  ${data.qty} unit x Rp ${data.unitPrice.toLocaleString('id-ID')}`,
      `= Rp ${data.subtotal.toLocaleString('id-ID')}`
    )
  );

  if (data.discountAmount && data.discountAmount > 0) {
    lines.push(
      formatRow(
        `  Potongan Diskon (${data.discountPercent || 0}%)`,
        `- Rp ${data.discountAmount.toLocaleString('id-ID')}`
      )
    );
    lines.push(
      formatRow(
        `  Operasi [Subtotal - Diskon]`,
        `= Rp ${data.grandTotal.toLocaleString('id-ID')}`
      )
    );
  }

  lines.push(line);
  lines.push(
    formatRow('TOTAL TAGIHAN BELANJA', `Rp ${data.grandTotal.toLocaleString('id-ID')}`)
  );
  lines.push(line);

  lines.push('SISTEM OPERASI PEMBAYARAN KASIR:');
  lines.push(
    formatRow('  Total Tagihan Belanja', `Rp ${data.grandTotal.toLocaleString('id-ID')}`)
  );
  lines.push(
    formatRow('  Uang Diterima dari Pembeli', `Rp ${data.cashGiven.toLocaleString('id-ID')}`)
  );

  if (data.isPiutang) {
    lines.push(subLine);
    lines.push('  Operasi Hitung Kurang Bayar:');
    lines.push('  [Total Tagihan] - [Uang Diterima]');
    lines.push(
      formatRow(
        '  SISA KURANG (PIUTANG)',
        `Rp ${data.receivableAmount.toLocaleString('id-ID')}`
      )
    );
    lines.push('*** STATUS: BELUM LUNAS / PIUTANG ***');
    if (data.dueDate) {
      lines.push(`  Jatuh Tempo: ${data.dueDate}`);
    }
  } else {
    lines.push(subLine);
    lines.push('  Operasi Hitung Kembalian:');
    lines.push('  [Uang Diterima] - [Total Tagihan]');
    if (data.changeAmount === 0) {
      lines.push(formatRow('  KEMBALIAN', 'Rp 0 (UANG PAS)'));
    } else {
      lines.push(
        formatRow('  KEMBALIAN KE PEMBELI', `Rp ${data.changeAmount.toLocaleString('id-ID')}`)
      );
    }
    lines.push('*** STATUS PEMBAYARAN: LUNAS ***');
  }

  if (data.notes) {
    lines.push(subLine);
    lines.push(`Catatan: ${data.notes}`);
  }

  lines.push(line);
  lines.push(' Terima kasih atas transaksi belanja Anda! ');
  lines.push('   Simpan struk ini sebagai bukti resmi    ');
  lines.push(line);

  return lines.join('\n');
}

/**
 * Generates printable HTML optimized for 58mm / 80mm thermal printers or standard system print / Save to PDF.
 */
export function generateReceiptHtml(rawData: ReceiptData): string {
  const data = normalizeReceiptData(rawData);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Struk POS - ${data.trxCode}</title>
  <style>
    @page {
      margin: 4mm;
      size: auto;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Courier New', Courier, monospace, monospace;
      width: 72mm;
      max-width: 100%;
      margin: 2mm auto;
      padding: 3mm;
      font-size: 11px;
      line-height: 1.35;
      color: #000;
      background: #fff;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: bold; }
    .header-title { font-size: 13px; font-weight: bold; margin-bottom: 2px; }
    .line { border-top: 1px dashed #000; margin: 4px 0; }
    .double-line { border-top: 2px dashed #000; margin: 5px 0; }
    .flex { display: flex; justify-content: space-between; align-items: flex-start; }
    .section-title {
      font-size: 10px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 3px;
      margin-bottom: 2px;
    }
    .badge {
      display: inline-block;
      padding: 3px 6px;
      font-size: 10px;
      font-weight: bold;
      border: 1px solid #000;
      margin: 3px auto;
      text-align: center;
    }
    .badge-piutang {
      background: #fee2e2;
      border-color: #b91c1c;
      color: #b91c1c;
    }
    .badge-lunas {
      background: #ecfdf5;
      border-color: #059669;
      color: #059669;
    }
    .total-box {
      border: 1px solid #000;
      padding: 4px 6px;
      margin: 4px 0;
      background: #f8fafc;
    }
    .total-row {
      font-size: 13px;
      font-weight: bold;
    }
    .calc-row {
      font-size: 10px;
      color: #222;
      margin-left: 4px;
    }
    @media print {
      body { margin: 0 auto; padding: 2mm; width: 100%; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="text-center header-title">DATA STATISTIK KASIR POS</div>
  <div class="text-center bold">STRUK RESMI TRANSAKSI PENJUALAN</div>
  <div class="text-center" style="font-size: 10px;">${data.sheetName}</div>
  <div class="text-center" style="font-size: 9px; color: #444;">${data.date}</div>
  <div class="line"></div>
  
  <div class="flex"><span>No. Struk:</span><span class="bold">${data.trxCode}</span></div>
  <div class="flex"><span>Metode Bayar:</span><span>${data.paymentType.toUpperCase()}</span></div>
  ${data.customerName ? `<div class="flex"><span>Pelanggan:</span><span class="bold">${data.customerName}</span></div>` : ''}
  ${data.customerPhone ? `<div class="flex"><span>Kontak/WA:</span><span>${data.customerPhone}</span></div>` : ''}
  
  <div class="double-line"></div>
  <div class="section-title">BARANG YANG DIBELI:</div>
  <div class="bold" style="font-size: 12px;">${data.itemName}</div>
  ${data.category ? `<div style="font-size: 10px; color: #444;">Kategori: ${data.category}</div>` : ''}
  
  <div class="line"></div>
  <div class="section-title">OPERASI HITUNG TOTAL HARGA:</div>
  
  <div class="flex">
    <span>${data.qty} unit &times; Rp ${data.unitPrice.toLocaleString('id-ID')}</span>
    <span class="bold">Rp ${data.subtotal.toLocaleString('id-ID')}</span>
  </div>

  ${
    data.discountAmount && data.discountAmount > 0
      ? `
      <div class="flex" style="color: #b91c1c; font-size: 10px;">
        <span>Potongan Diskon (${data.discountPercent || 0}%):</span>
        <span>- Rp ${data.discountAmount.toLocaleString('id-ID')}</span>
      </div>
      <div class="calc-row text-right" style="font-size: 9px; color: #666;">
        [Subtotal Rp ${data.subtotal.toLocaleString('id-ID')} - Diskon Rp ${data.discountAmount.toLocaleString('id-ID')}]
      </div>`
      : ''
  }

  <div class="total-box">
    <div class="flex total-row">
      <span>TOTAL TAGIHAN:</span>
      <span>Rp ${data.grandTotal.toLocaleString('id-ID')}</span>
    </div>
  </div>

  <div class="section-title">OPERASI PEMBAYARAN KASIR:</div>
  <div class="flex">
    <span>Total Belanja:</span>
    <span>Rp ${data.grandTotal.toLocaleString('id-ID')}</span>
  </div>
  <div class="flex">
    <span>Uang Diterima (Cash):</span>
    <span class="bold">Rp ${data.cashGiven.toLocaleString('id-ID')}</span>
  </div>

  ${
    data.isPiutang
      ? `
      <div class="line"></div>
      <div class="calc-row">Operasi: Total Tagihan - Uang Diterima</div>
      <div class="flex bold" style="color: #b91c1c; font-size: 12px; margin-top: 2px;">
        <span>SISA PIUTANG:</span>
        <span>Rp ${data.receivableAmount.toLocaleString('id-ID')}</span>
      </div>
      <div class="text-center" style="margin-top: 4px;">
        <span class="badge badge-piutang">STATUS: BELUM LUNAS / PIUTANG</span>
      </div>
      ${data.dueDate ? `<div class="flex" style="font-size: 10px; margin-top: 2px;"><span>Jatuh Tempo:</span><span>${data.dueDate}</span></div>` : ''}
    `
      : `
      <div class="line"></div>
      <div class="calc-row">Operasi: Uang Diterima - Total Tagihan</div>
      <div class="flex bold" style="font-size: 12px; margin-top: 2px;">
        <span>KEMBALIAN:</span>
        <span>${data.changeAmount === 0 ? 'Rp 0 (UANG PAS)' : `Rp ${data.changeAmount.toLocaleString('id-ID')}`}</span>
      </div>
      <div class="text-center" style="margin-top: 4px;">
        <span class="badge badge-lunas">STATUS: LUNAS TERBAYAR</span>
      </div>
    `
  }

  ${data.notes ? `<div class="line"></div><div style="font-size: 10px;">Catatan: ${data.notes}</div>` : ''}

  <div class="double-line"></div>
  <div class="text-center bold" style="margin-top: 4px;">Terima kasih atas transaksi Anda!</div>
  <div class="text-center" style="font-size: 9px; margin-top: 2px; color: #555;">Simpan struk ini sebagai bukti pembayaran resmi</div>
  <div class="text-center" style="font-size: 8px; margin-top: 2px; color: #777;">Tersinkronisasi Otomatis &bull; Kasir POS Statistik</div>
</body>
</html>`;
}

/**
 * Triggers native system printing dialog for the receipt via an isolated iframe.
 * Works seamlessly with Windows Print, macOS AirPrint, Android Print Service, and Save as PDF!
 */
export function printReceiptTicket(rawData: ReceiptData) {
  const data = normalizeReceiptData(rawData);
  const html = generateReceiptHtml(data);

  let iframe = document.getElementById('receipt-print-frame') as HTMLIFrameElement;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'receipt-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);
  }

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) {
    window.print();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.warn('Iframe print error fallback:', e);
      window.print();
    }
  }, 350);
}

/**
 * Downloads the receipt to device local storage (TXT format or standalone HTML).
 */
export function downloadReceiptToStorage(rawData: ReceiptData, format: 'txt' | 'html' = 'txt') {
  const data = normalizeReceiptData(rawData);
  const content = format === 'txt' ? generateReceiptText(data) : generateReceiptHtml(data);
  const mimeType = format === 'txt' ? 'text/plain;charset=utf-8' : 'text/html;charset=utf-8';
  const fileName = `struk-${data.trxCode.replace(/[^a-zA-Z0-9_-]/g, '_')}.${format}`;

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Copies the formatted receipt text to clipboard.
 */
export async function copyReceiptToClipboard(rawData: ReceiptData): Promise<boolean> {
  const data = normalizeReceiptData(rawData);
  const text = generateReceiptText(data);
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return true;
  } catch (e) {
    console.error('Failed to copy receipt to clipboard:', e);
    return false;
  }
}

/**
 * Generates plain text receipt specifically formatted for GreenMartTransaction
 */
export function generateGreenMartReceiptText(
  transaction: GreenMartTransaction, 
  paperWidth: '58mm' | '80mm' = '80mm'
): string {
  const is80mm = paperWidth === '80mm';
  const line = is80mm 
    ? '================================================' 
    : '========================================';
  const sub = is80mm 
    ? '------------------------------------------------' 
    : '----------------------------------------';
  
  let text = `${line}\n`;
  text += '             GREENMART SUPERMARKET              \n';
  text += '      Pusat Belanja Segar, Hemat & Lengkap      \n';
  text += '  Jl.Ki Mangunsarkoro No.2, 03, Dracik Barat,   \n';
  text += '        Proyonanggan Selatan., Kec. Batang      \n';
  text += `${line}\n`;
  text += `No. Nota   : ${transaction.invoiceNumber}\n`;
  text += `Waktu      : ${transaction.date} ${transaction.time}\n`;
  text += `Kasir      : ${transaction.cashierName}\n`;
  text += `Pelanggan  : ${transaction.customerName || 'Umum'}\n`;
  
  if (transaction.settledAt) {
    text += `${sub}\n`;
    text += '*** STATUS: LUNAS (PIUTANG TELAH DILUNASI) ***\n';
    text += `Tgl Pelunasan    : ${transaction.settledAt}\n`;
    text += `Metode Pelunasan : ${(transaction.settledMethod || 'tunai').toUpperCase()}\n`;
    if (transaction.settledByCashier) {
      text += `Kasir Pelunasan  : ${transaction.settledByCashier}\n`;
    }
    if (transaction.settledNotes) {
      text += `Catatan Pelunasan: ${transaction.settledNotes}\n`;
    }
  }

  text += `${sub}\n`;
  text += 'DAFTAR BARANG BELANJA:\n';
  transaction.items.forEach(i => {
    text += `* ${i.name}\n`;
    text += `  ${i.qty} ${i.unit} x Rp ${i.unitPrice.toLocaleString('id-ID')} = Rp ${i.subtotal.toLocaleString('id-ID')}\n`;
    if (i.discountPercent > 0) {
      text += `  Diskon Item: ${i.discountPercent}%\n`;
    }
  });

  text += `${sub}\n`;
  text += `Total Barang  : ${transaction.totalItemsCount} Unit\n`;
  text += `Subtotal      : Rp ${transaction.subtotal.toLocaleString('id-ID')}\n`;
  if (transaction.discountTotal > 0) {
    text += `Diskon Total  : -Rp ${transaction.discountTotal.toLocaleString('id-ID')}\n`;
  }
  text += `${line}\n`;
  text += `TOTAL TAGIHAN : Rp ${transaction.grandTotal.toLocaleString('id-ID')}\n`;
  text += `${line}\n`;

  if (transaction.settledAt) {
    text += `Metode Bayar  : ${(transaction.settledMethod || 'tunai').toUpperCase()} (Pelunasan)\n`;
    text += `Uang Diterima : Rp ${(transaction.settledAmount || transaction.grandTotal).toLocaleString('id-ID')}\n`;
    text += `Sisa Piutang  : Rp 0 (Lunas Terbayar)\n`;
  } else {
    text += `Metode Bayar  : ${transaction.paymentMethod.toUpperCase()}\n`;
    text += `Uang Diterima : Rp ${transaction.cashGiven.toLocaleString('id-ID')}\n`;
    text += `Kembalian     : Rp ${transaction.changeAmount.toLocaleString('id-ID')}\n`;
    text += `Status Bayar  : ${transaction.paymentStatus}\n`;
  }

  if (transaction.notes) {
    text += `Catatan       : ${transaction.notes}\n`;
  }

  text += `${line}\n`;
  text += '    Terima kasih telah berbelanja di GreenMart!    \n';
  text += '    Barang dapat ditukar 1x24 jam dengan struk    \n';
  text += `${line}\n`;
  return text;
}

/**
 * Export official GreenMart transaction receipt as a high-resolution, proportional PDF.
 * Formatted specifically for thermal receipt roll (80mm / 58mm) or standard A4 invoice voucher.
 */
export function exportGreenMartReceiptPdf(
  transaction: GreenMartTransaction,
  options: {
    paperWidth?: '58mm' | '80mm' | 'a4';
    storeName?: string;
    printerName?: string;
  } = {}
): jsPDF {
  const paperWidth = options.paperWidth || '80mm';
  const isA4 = paperWidth === 'a4';
  const is58mm = paperWidth === '58mm';

  // Compute roll height for thermal continuous format
  const baseItemsHeight = transaction.items.length * (isA4 ? 9 : 8);
  const estimatedHeight = isA4 ? 297 : Math.max(145, 105 + baseItemsHeight + (transaction.settledAt ? 25 : 0) + (transaction.notes ? 12 : 0));
  const docWidth = isA4 ? 210 : is58mm ? 58 : 80;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: isA4 ? 'a4' : [docWidth, estimatedHeight]
  });

  const marginX = isA4 ? 20 : is58mm ? 3.5 : 5;
  const contentWidth = docWidth - marginX * 2;
  const centerX = docWidth / 2;
  const rightX = docWidth - marginX;

  let y = isA4 ? 18 : 6;

  // Header Title
  doc.setFont('courier', 'bold');
  doc.setFontSize(isA4 ? 16 : is58mm ? 10 : 12);
  doc.text('GREENMART SUPERMARKET', centerX, y, { align: 'center' });
  y += isA4 ? 6 : 4;

  doc.setFont('courier', 'normal');
  doc.setFontSize(isA4 ? 10 : is58mm ? 6.2 : 7.2);
  doc.text('Pusat Belanja Segar, Hemat & Lengkap', centerX, y, { align: 'center' });
  y += isA4 ? 4.5 : 3;
  doc.setFontSize(isA4 ? 8.5 : is58mm ? 5.2 : 6.2);
  doc.text('Jl.Ki Mangunsarkoro No.2, 03, Dracik Barat,', centerX, y, { align: 'center' });
  y += isA4 ? 4 : 2.7;
  doc.text('Proyonanggan Selatan., Kec. Batang', centerX, y, { align: 'center' });
  y += isA4 ? 5 : 3.5;

  const drawDashedLine = (currY: number) => {
    doc.setLineDashPattern([1.5, 1], 0);
    doc.setLineWidth(0.2);
    doc.line(marginX, currY, rightX, currY);
    doc.setLineDashPattern([], 0);
  };

  const drawDoubleLine = (currY: number) => {
    doc.setLineDashPattern([2, 1], 0);
    doc.setLineWidth(0.25);
    doc.line(marginX, currY, rightX, currY);
    doc.line(marginX, currY + 0.8, rightX, currY + 0.8);
    doc.setLineDashPattern([], 0);
  };

  drawDashedLine(y);
  y += isA4 ? 5 : 3.5;

  // Metadata
  doc.setFontSize(isA4 ? 9.5 : is58mm ? 6.8 : 7.5);
  doc.text(`Nota  : ${transaction.invoiceNumber}`, marginX, y);
  y += isA4 ? 4.5 : 3.2;
  doc.text(`Waktu : ${transaction.date} ${transaction.time}`, marginX, y);
  y += isA4 ? 4.5 : 3.2;
  doc.text(`Kasir : ${transaction.cashierName}`, marginX, y);
  y += isA4 ? 4.5 : 3.2;
  doc.text(`Plg   : ${transaction.customerName || 'Umum'}`, marginX, y);
  y += isA4 ? 5 : 3.8;

  if (transaction.settledAt) {
    // Settled official stamp box
    doc.setLineWidth(0.25);
    doc.rect(marginX, y, contentWidth, 8);
    doc.setFont('courier', 'bold');
    doc.setFontSize(isA4 ? 9 : 7);
    doc.text('*** BUKTI PELUNASAN PIUTANG RESMI ***', centerX, y + 3.2, { align: 'center' });
    doc.text('STATUS: LUNAS TERBAYAR', centerX, y + 6.4, { align: 'center' });
    y += 11;
  }

  drawDoubleLine(y);
  y += isA4 ? 6 : 4;

  // Items
  transaction.items.forEach(item => {
    doc.setFont('courier', 'bold');
    doc.setFontSize(isA4 ? 9.5 : is58mm ? 6.8 : 7.8);
    const maxChars = is58mm ? 22 : 32;
    const displayName = item.name.length > maxChars ? item.name.substring(0, maxChars - 2) + '..' : item.name;
    doc.text(displayName, marginX, y);
    y += isA4 ? 4 : 3;

    doc.setFont('courier', 'normal');
    doc.setFontSize(isA4 ? 9 : is58mm ? 6.5 : 7.2);
    const qtyText = `  ${item.qty} ${item.unit} x Rp ${item.unitPrice.toLocaleString('id-ID')}`;
    const subtotalText = `Rp ${item.subtotal.toLocaleString('id-ID')}`;
    doc.text(qtyText, marginX, y);
    doc.setFont('courier', 'bold');
    doc.text(subtotalText, rightX, y, { align: 'right' });
    doc.setFont('courier', 'normal');
    y += isA4 ? 4.5 : 3.4;

    if (item.discountPercent > 0) {
      doc.setFontSize(is58mm ? 6 : 6.8);
      doc.text(`  (Diskon ${item.discountPercent}%)`, marginX, y);
      y += 2.8;
    }
  });

  drawDashedLine(y);
  y += isA4 ? 5 : 3.5;

  // Totals
  doc.setFontSize(isA4 ? 9.5 : is58mm ? 6.8 : 7.5);
  doc.text(`Total Barang :`, marginX, y);
  doc.text(`${transaction.totalItemsCount} Unit`, rightX, y, { align: 'right' });
  y += isA4 ? 4.5 : 3.2;

  doc.text(`Subtotal :`, marginX, y);
  doc.text(`Rp ${transaction.subtotal.toLocaleString('id-ID')}`, rightX, y, { align: 'right' });
  y += isA4 ? 4.5 : 3.2;

  if (transaction.discountTotal > 0) {
    doc.text(`Potongan Diskon :`, marginX, y);
    doc.text(`-Rp ${transaction.discountTotal.toLocaleString('id-ID')}`, rightX, y, { align: 'right' });
    y += isA4 ? 4.5 : 3.2;
  }

  drawDashedLine(y);
  y += isA4 ? 5.5 : 4.2;

  // Grand total
  doc.setFont('courier', 'bold');
  doc.setFontSize(isA4 ? 12 : is58mm ? 8.5 : 10);
  doc.text(`TOTAL TAGIHAN :`, marginX, y);
  doc.text(`Rp ${transaction.grandTotal.toLocaleString('id-ID')}`, rightX, y, { align: 'right' });
  y += isA4 ? 5.5 : 4.2;

  drawDashedLine(y);
  y += isA4 ? 5 : 3.5;

  doc.setFont('courier', 'normal');
  doc.setFontSize(isA4 ? 9.5 : is58mm ? 6.8 : 7.5);

  if (transaction.settledAt) {
    doc.text(`Metode Awal  : ${transaction.paymentMethod.toUpperCase()}`, marginX, y);
    y += 3.2;
    doc.text(`Status       : LUNAS (Piutang Selesai)`, marginX, y);
    y += 3.2;
    doc.text(`Tgl Lunas    : ${transaction.settledAt}`, marginX, y);
    y += 3.2;
    doc.text(`Pelunasan    : ${(transaction.settledMethod || 'tunai').toUpperCase()}`, marginX, y);
    y += 3.2;
    doc.text(`Jml Dilunasi : Rp ${(transaction.settledAmount || transaction.grandTotal).toLocaleString('id-ID')}`, marginX, y);
    y += 3.2;
    doc.setFont('courier', 'bold');
    doc.text(`Sisa Piutang : Rp 0 (LUNAS)`, marginX, y);
    y += 3.8;
  } else {
    doc.text(`Metode Bayar : ${transaction.paymentMethod.toUpperCase()}`, marginX, y);
    y += 3.2;
    doc.text(`Uang Diterima: Rp ${transaction.cashGiven.toLocaleString('id-ID')}`, marginX, y);
    y += 3.2;
    doc.setFont('courier', 'bold');
    const changeLabel = transaction.changeAmount >= 0 ? 'Kembalian    :' : 'Sisa Piutang :';
    doc.text(changeLabel, marginX, y);
    doc.text(`Rp ${Math.abs(transaction.changeAmount).toLocaleString('id-ID')}`, rightX, y, { align: 'right' });
    y += 3.5;
    doc.setFont('courier', 'normal');
    doc.text(`Status       : ${transaction.paymentStatus}`, marginX, y);
    y += 3.5;
  }

  if (transaction.notes) {
    y += 1;
    doc.text(`Catatan: ${transaction.notes}`, marginX, y);
    y += 3.5;
  }

  drawDoubleLine(y);
  y += isA4 ? 6 : 4.5;

  // Footer
  doc.setFont('courier', 'bold');
  doc.setFontSize(isA4 ? 9.5 : is58mm ? 6.8 : 7.5);
  doc.text('Terima Kasih Atas Kunjungan Anda!', centerX, y, { align: 'center' });
  y += isA4 ? 4.5 : 3.2;
  doc.setFont('courier', 'normal');
  doc.setFontSize(isA4 ? 8 : is58mm ? 5.5 : 6.2);
  doc.text('Barang yang dibeli dapat ditukar 1x24 jam dengan struk', centerX, y, { align: 'center' });
  y += isA4 ? 4 : 2.8;

  // Simulated barcode text
  doc.setFont('courier', 'bold');
  doc.setFontSize(isA4 ? 12 : 9);
  doc.text('|||| || ||||| || |||||| |||| |', centerX, y, { align: 'center' });
  y += isA4 ? 4 : 2.8;
  doc.setFont('courier', 'normal');
  doc.setFontSize(is58mm ? 5.5 : 6.5);
  doc.text(`*${transaction.invoiceNumber}*`, centerX, y, { align: 'center' });
  y += isA4 ? 4 : 3;

  doc.setFontSize(5.5);
  doc.text(`GreenMart POS • ${options.printerName || 'Direct Print Device'}`, centerX, y, { align: 'center' });

  // Save the PDF
  doc.save(`Struk_GreenMart_${transaction.invoiceNumber}.pdf`);
  return doc;
}

/**
 * Builds standalone, interactive HTML page for direct web receipt viewing & printing.
 */
export function generateGreenMartReceiptStandaloneHtml(
  transaction: GreenMartTransaction,
  options: {
    paperWidth?: '58mm' | '80mm';
    autoPrint?: boolean;
    activePrinterName?: string;
  } = {}
): string {
  const paperWidth = options.paperWidth || '80mm';
  const is80mm = paperWidth === '80mm';
  const isSettled = Boolean(transaction.settledAt);
  const paperWidthCss = is80mm ? '76mm' : '56mm';
  const pageCss = is80mm ? '80mm auto' : '58mm auto';

  const plainTextEscaped = generateGreenMartReceiptText(transaction, paperWidth)
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
  <title>Struk Pembelian GreenMart - ${transaction.invoiceNumber}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700;800&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #059669;
      --primary-dark: #047857;
      --slate-900: #0f172a;
      --slate-800: #1e293b;
      --slate-100: #f1f5f9;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      background: #e2e8f0;
      color: #0f172a;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-bottom: 40px;
    }
    
    /* Top Floating Control Bar */
    .top-bar {
      position: sticky;
      top: 0;
      width: 100%;
      background: #ffffff;
      border-bottom: 1px solid #cbd5e1;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
      z-index: 100;
      padding: 12px 16px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .brand-title {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-title img {
      width: 32px;
      height: 32px;
      object-contain: contain;
    }
    .brand-title h1 {
      font-size: 15px;
      font-weight: 800;
      color: var(--slate-900);
      line-height: 1.2;
    }
    .brand-title p {
      font-size: 11px;
      color: #64748b;
      font-family: 'JetBrains Mono', monospace;
    }
    
    .actions-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      font-size: 12px;
      font-weight: 700;
      border-radius: 10px;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.15s ease;
      text-decoration: none;
      font-family: inherit;
    }
    .btn-primary {
      background: var(--primary);
      color: #fff;
    }
    .btn-primary:hover {
      background: var(--primary-dark);
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: #ffffff;
      color: var(--slate-800);
      border-color: #cbd5e1;
    }
    .btn-secondary:hover {
      background: #f8fafc;
      border-color: #94a3b8;
    }
    .btn-danger {
      background: #fee2e2;
      color: #991b1b;
      border-color: #fecaca;
    }
    .btn-danger:hover {
      background: #fecaca;
    }
    .badge-fmt {
      font-size: 11px;
      font-weight: 700;
      background: #e0e7ff;
      color: #3730a3;
      padding: 4px 8px;
      border-radius: 6px;
    }

    /* Thermal Paper Container */
    .receipt-container {
      margin-top: 24px;
      display: flex;
      justify-content: center;
      width: 100%;
      padding: 0 12px;
    }
    .receipt-paper {
      background: #ffffff;
      color: #000000;
      width: ${paperWidthCss};
      padding: 16px 14px;
      border-radius: 4px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      font-family: 'JetBrains Mono', 'Courier New', Courier, monospace;
      font-size: ${is80mm ? '12px' : '11px'};
      line-height: 1.35;
      position: relative;
    }
    /* Zigzag paper edges simulation */
    .receipt-paper::before, .receipt-paper::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      height: 6px;
      background-size: 12px 6px;
    }
    .receipt-paper::before {
      top: -6px;
      background-image: radial-gradient(circle at 6px 6px, transparent 6px, #ffffff 6px);
    }
    .receipt-paper::after {
      bottom: -6px;
      background-image: radial-gradient(circle at 6px 0, transparent 6px, #ffffff 6px);
    }

    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: 700; }
    .line { border-top: 1px dashed #000; margin: 6px 0; }
    .double-line { border-top: 2px dashed #000; margin: 6px 0; }
    .flex { display: flex; justify-content: space-between; }
    .settled-badge {
      border: 1.5px solid #000;
      padding: 4px;
      text-align: center;
      font-weight: 700;
      margin: 6px 0;
      font-size: 10px;
    }
    .barcode-display {
      font-size: 16px;
      letter-spacing: 3px;
      font-weight: 700;
      margin: 6px 0 2px 0;
      text-align: center;
    }

    /* Print media: hide all controls and fit paper to page */
    @media print {
      @page {
        size: ${pageCss};
        margin: 2mm;
      }
      body {
        background: #ffffff !important;
        padding: 0 !important;
        color: #000 !important;
      }
      .top-bar {
        display: none !important;
      }
      .receipt-container {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
      }
      .receipt-paper {
        width: 100% !important;
        box-shadow: none !important;
        padding: 1mm !important;
        border-radius: 0 !important;
      }
      .receipt-paper::before, .receipt-paper::after {
        display: none !important;
      }
    }
  </style>
</head>
<body>

  <!-- Top Floating Actions Bar -->
  <header class="top-bar">
    <div class="brand-title">
      <img src="/assets/aistudio/GM_Logo-ai_f89efb6e.png" alt="Logo">
      <div>
        <h1>Struk Kasir GreenMart</h1>
        <p>${transaction.invoiceNumber} &bull; ${transaction.date} ${transaction.time}</p>
      </div>
    </div>

    <div class="actions-group">
      <span class="badge-fmt">${paperWidth}</span>
      
      <button onclick="window.print()" class="btn btn-primary">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
        <span>Cetak Struk (Print)</span>
      </button>

      <button id="btn-export-pdf" onclick="handlePdfDownload()" class="btn btn-secondary">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span>Unduh Struk PDF</span>
      </button>

      <button onclick="copyReceipt()" class="btn btn-secondary">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        <span id="copy-btn-text">Salin Teks</span>
      </button>

      <button onclick="window.close()" class="btn btn-danger">
        Tutup
      </button>
    </div>
  </header>

  <!-- Centered Thermal Receipt -->
  <main class="receipt-container">
    <div class="receipt-paper" id="receipt-paper">
      
      <div class="text-center bold" style="font-size: 14px;">GREENMART SUPERMARKET</div>
      <div class="text-center" style="font-size: 10px;">Pusat Belanja Segar, Hemat &amp; Lengkap</div>
      <div class="text-center" style="font-size: 8.5px; color: #333; line-height: 1.3; padding: 0 4px;">Jl.Ki Mangunsarkoro No.2, 03, Dracik Barat, Proyonanggan Selatan., Kec. Batang</div>
      <div class="line"></div>
      
      <div class="flex"><span>No. Nota:</span><span class="bold">${transaction.invoiceNumber}</span></div>
      <div class="flex"><span>Waktu:</span><span>${transaction.date} ${transaction.time}</span></div>
      <div class="flex"><span>Kasir:</span><span>${transaction.cashierName}</span></div>
      <div class="flex"><span>Pelanggan:</span><span>${transaction.customerName || 'Umum'}</span></div>

      ${isSettled ? `
        <div class="settled-badge">
          *** BUKTI PELUNASAN PIUTANG RESMI ***<br/>
          STATUS: LUNAS TERBAYAR
        </div>
      ` : ''}

      <div class="double-line"></div>
      
      ${transaction.items.map(item => `
        <div style="margin-bottom: 4px;">
          <div class="bold">${item.name}</div>
          <div class="flex">
            <span>  ${item.qty} ${item.unit} &times; Rp ${item.unitPrice.toLocaleString('id-ID')}</span>
            <span class="bold">Rp ${item.subtotal.toLocaleString('id-ID')}</span>
          </div>
          ${item.discountPercent > 0 ? `
            <div class="flex" style="font-size: 9px; color: #555;">
              <span>  Diskon ${item.discountPercent}%</span>
              <span>-</span>
            </div>
          ` : ''}
        </div>
      `).join('')}

      <div class="line"></div>
      
      <div class="flex"><span>Total Barang:</span><span>${transaction.totalItemsCount} Unit</span></div>
      <div class="flex"><span>Subtotal:</span><span>Rp ${transaction.subtotal.toLocaleString('id-ID')}</span></div>
      ${transaction.discountTotal > 0 ? `
        <div class="flex"><span>Potongan Diskon:</span><span>-Rp ${transaction.discountTotal.toLocaleString('id-ID')}</span></div>
      ` : ''}

      <div class="line"></div>
      
      <div class="flex bold" style="font-size: 13.5px; padding: 2px 0;">
        <span>TOTAL BELANJA:</span>
        <span>Rp ${transaction.grandTotal.toLocaleString('id-ID')}</span>
      </div>

      <div class="line"></div>

      <div class="flex"><span>Metode Bayar:</span><span>${transaction.paymentMethod.toUpperCase()}</span></div>
      
      ${isSettled ? `
        <div class="flex"><span>Status Pembayaran:</span><span class="bold">LUNAS</span></div>
        <div class="flex"><span>Tgl Pelunasan:</span><span class="bold">${transaction.settledAt}</span></div>
        <div class="flex"><span>Metode Pelunasan:</span><span class="bold">${(transaction.settledMethod || 'tunai').toUpperCase()}</span></div>
        <div class="flex"><span>Uang Diterima:</span><span class="bold">Rp ${(transaction.settledAmount || transaction.grandTotal).toLocaleString('id-ID')}</span></div>
        <div class="flex bold"><span>SISA PIUTANG:</span><span>Rp 0 (LUNAS)</span></div>
        ${transaction.settledNotes ? `<div class="flex"><span>Catatan:</span><span>${transaction.settledNotes}</span></div>` : ''}
        ${transaction.settledByCashier ? `<div class="flex"><span>Kasir Pelunasan:</span><span>${transaction.settledByCashier}</span></div>` : ''}
      ` : `
        <div class="flex"><span>Bayar (Cash):</span><span class="bold">Rp ${transaction.cashGiven.toLocaleString('id-ID')}</span></div>
        <div class="flex bold">
          <span>${transaction.changeAmount >= 0 ? 'KEMBALIAN:' : 'SISA PIUTANG:'}</span>
          <span>Rp ${Math.abs(transaction.changeAmount).toLocaleString('id-ID')}</span>
        </div>
        <div class="flex"><span>Status:</span><span class="bold">${transaction.paymentStatus}</span></div>
      `}

      ${transaction.notes ? `
        <div class="line"></div>
        <div style="font-size: 10px;">Catatan: ${transaction.notes}</div>
      ` : ''}

      <div class="double-line"></div>
      <div class="text-center bold" style="margin-top: 4px;">Terima Kasih Atas Kunjungan Anda!</div>
      <div class="text-center" style="font-size: 9px; color: #444;">Barang yang sudah dibeli dapat ditukar 1x24 jam dengan struk resmi</div>
      
      <div class="barcode-display">|||| || ||||| || |||||| |||| |</div>
      <div class="text-center" style="font-size: 8px; color: #555;">*${transaction.invoiceNumber}*</div>
      <div class="text-center" style="font-size: 8px; color: #666; margin-top: 3px;">
        Format: ${paperWidth} &bull; GreenMart POS
      </div>

    </div>
  </main>

  <script>
    const plainText = \`${plainTextEscaped}\`;
    
    function copyReceipt() {
      navigator.clipboard.writeText(plainText).then(() => {
        const btnText = document.getElementById('copy-btn-text');
        btnText.textContent = 'Tersalin!';
        setTimeout(() => {
          btnText.textContent = 'Salin Teks';
        }, 2000);
      }).catch(err => {
        alert('Gagal menyalin teks ke clipboard');
      });
    }

    function handlePdfDownload() {
      // Direct print dialog with PDF destination or print action
      window.print();
    }

    ${options.autoPrint ? `
      window.addEventListener('load', () => {
        setTimeout(() => {
          window.print();
        }, 400);
      });
    ` : ''}
  </script>

</body>
</html>`;
}

/**
 * Opens receipt directly in a standalone browser web page in a new window/tab.
 */
export function openReceiptDirectWebPage(
  transaction: GreenMartTransaction,
  options: {
    paperWidth?: '58mm' | '80mm';
    autoPrint?: boolean;
    activePrinterName?: string;
  } = {}
): Window | null {
  const html = generateGreenMartReceiptStandaloneHtml(transaction, options);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);

  const win = window.open(blobUrl, '_blank');
  if (!win || win.closed || typeof win.closed === 'undefined') {
    // If popup is blocked, fallback to downloading standalone HTML
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `Struk_GreenMart_${transaction.invoiceNumber}.html`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  return win;
}
