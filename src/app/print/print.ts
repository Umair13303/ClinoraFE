import { isRichHtml, sanitizeReportHtml } from '../rich-text';
import { parseSemenWorksheet, semenWorksheetToPrintHtml } from '../semen-report';

type Letterhead = {
  name?: string | null;
  address?: string | null;
  phone?: string | null;
};

function readLetterhead(): Letterhead {
  try {
    const raw = sessionStorage.getItem('clinora.clinic');
    if (!raw) {
      return { name: 'Clinora Diagnostics' };
    }
    return JSON.parse(raw) as Letterhead;
  } catch {
    return { name: 'Clinora Diagnostics' };
  }
}

export function cacheClinicLetterhead(settings: Letterhead): void {
  sessionStorage.setItem(
    'clinora.clinic',
    JSON.stringify({
      name: settings.name ?? 'Clinora Diagnostics',
      address: settings.address ?? null,
      phone: settings.phone ?? null,
    }),
  );
}

function letterheadHtml(): string {
  const clinic = readLetterhead();
  return `<header class="letterhead">
    <div>
      <h1>${escapeHtml(clinic.name || 'Clinora Diagnostics')}</h1>
      <div class="meta">${escapeHtml([clinic.address, clinic.phone].filter(Boolean).join(' · ') || '')}</div>
    </div>
  </header>`;
}

type BarcodeOpts = {
  height?: number;
  width?: number;
  fontSize?: number;
  displayValue?: boolean;
  margin?: number;
};

type PrintDocOpts = {
  barcodes?: string[];
  barcodeOpts?: BarcodeOpts;
  compactLabel?: boolean;
};

function buildDocument(title: string, bodyHtml: string, opts: PrintDocOpts = {}): string {
  const barcodes = opts.barcodes ?? [];
  const barcodeJson = JSON.stringify(barcodes);
  const bc = {
    height: opts.barcodeOpts?.height ?? 48,
    width: opts.barcodeOpts?.width ?? 1.6,
    fontSize: opts.barcodeOpts?.fontSize ?? 12,
    displayValue: opts.barcodeOpts?.displayValue ?? true,
    margin: opts.barcodeOpts?.margin ?? 0,
  };
  const compact = opts.compactLabel === true;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>
  body{font-family:Manrope,Segoe UI,sans-serif;color:#0f172a;margin:${compact ? '8px' : '24px'};font-size:${compact ? '10px' : '13px'}}
  h1{font-size:18px;margin:0 0 4px} h2{font-size:14px;margin:16px 0 6px;text-transform:uppercase;letter-spacing:.08em;color:#475569}
  .letterhead{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #0f766e;padding-bottom:10px;margin-bottom:14px}
  .letterhead h1{font-size:22px;color:#0f766e}
  .meta{color:#64748b;font-size:${compact ? '8px' : '12px'};margin:0 0 ${compact ? '1px' : '12px'}}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{border-bottom:1px solid #e2e8f0;padding:6px 4px;text-align:left;font-size:12px}
  .slip{border:1px solid #cbd5e1;border-radius:10px;padding:16px;margin-bottom:18px;page-break-inside:avoid}
  .barcode-text{font-family:Consolas,monospace;font-size:${compact ? '8px' : '14px'};letter-spacing:.04em;font-weight:700;margin:1px 0 2px}
  .label{width:${compact ? '48mm' : '300px'};max-width:${compact ? '48mm' : '300px'};border:1px dashed #94a3b8;padding:${compact ? '2mm' : '12px'};border-radius:${compact ? '2px' : '8px'};box-sizing:border-box;overflow:hidden}
  .label svg{display:block;max-width:100%;height:auto}
  .label p{margin:0 0 1px;line-height:1.15;font-size:${compact ? '8.5px' : '12px'}}
  .label .name{font-size:${compact ? '9.5px' : '13px'};font-weight:700}
  .label .tube{font-size:${compact ? '8px' : '12px'}}
  .label .tests{font-size:${compact ? '7.5px' : '11px'};color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .flag{color:#be123c;font-weight:700}
  .actions{margin:12px 0 20px}
  .actions button{margin-right:8px;padding:8px 14px;border-radius:8px;border:1px solid #cbd5e1;background:#0f766e;color:#fff;font-weight:600;cursor:pointer}
  .actions button.secondary{background:#fff;color:#0f172a}
  @media print{
    .actions{display:none!important}
    body{margin:${compact ? '0' : '12px'}}
    ${compact ? '@page{size:50mm 30mm;margin:1.5mm} .label{border:0;width:100%;max-width:100%;padding:0}' : ''}
  }
</style></head><body>
<div class="actions">
  <button type="button" onclick="window.print()">Print</button>
  <button type="button" class="secondary" onclick="window.close()">Close</button>
</div>
${bodyHtml}
<script>
(function(){
  var codes = ${barcodeJson};
  var opts = ${JSON.stringify(bc)};
  codes.forEach(function(code, i){
    var el = document.getElementById('bc-' + i);
    if (!el || !window.JsBarcode) return;
    try {
      JsBarcode(el, code, {
        format: 'CODE128',
        displayValue: opts.displayValue,
        fontSize: opts.fontSize,
        height: opts.height,
        width: opts.width,
        margin: opts.margin,
        textMargin: 1
      });
    } catch (e) {}
  });
})();
<\/script>
</body></html>`;
}

/** Prefer iframe print (works after async API). Popup is fallback for a visible preview. */
export function openPrintWindow(
  title: string,
  bodyHtml: string,
  barcodesOrOpts: string[] | PrintDocOpts = [],
): boolean {
  const opts: PrintDocOpts = Array.isArray(barcodesOrOpts)
    ? { barcodes: barcodesOrOpts }
    : barcodesOrOpts;
  const html = buildDocument(title, bodyHtml, opts);

  try {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', title);
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(iframe);

    const frameWindow = iframe.contentWindow;
    const frameDoc = iframe.contentDocument || frameWindow?.document;
    if (!frameWindow || !frameDoc) {
      iframe.remove();
      return openPopupPrint(title, html);
    }

    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    const cleanup = () => {
      setTimeout(() => {
        try {
          iframe.remove();
        } catch {
          /* ignore */
        }
      }, 1500);
    };

    const trigger = () => {
      try {
        frameWindow.focus();
        frameWindow.print();
      } catch {
        openPopupPrint(title, html);
      } finally {
        cleanup();
      }
    };

    // JsBarcode CDN + parse need a short delay before print.
    setTimeout(trigger, (opts.barcodes?.length ?? 0) > 0 ? 450 : 150);
    return true;
  } catch {
    return openPopupPrint(title, html);
  }
}

function openPopupPrint(title: string, html: string): boolean {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${title.replace(/[^\w\-]+/g, '_') || 'print'}.html`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return false;
  }

  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    try {
      win.print();
    } catch {
      /* user can click Print in the preview */
    }
  }, 450);
  return true;
}

export function escapeHtml(value: string | null | undefined): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function printVisitSlips(slips: {
  visitNumber: string;
  tokenNo?: number | null;
  createdAt: string;
  patientName: string;
  phone: string;
  age: number;
  gender: string;
  referredBy: string | null;
  net: number;
  amountReceived: number;
  lines: Array<{
    serviceName: string;
    pathway: string;
    fee: number;
    urgent: boolean;
    readyBy: string | null;
    sampleTypeName: string | null;
    containerName: string | null;
    bottleColorName: string | null;
  }>;
}): boolean {
  const rows = (slips.lines ?? [])
    .map(
      (line) =>
        `<tr><td>${escapeHtml(line.serviceName)}${line.urgent ? ' · Urgent' : ''}</td><td>${escapeHtml(line.pathway)}</td><td>${escapeHtml(line.readyBy ?? '—')}</td><td>${escapeHtml([line.sampleTypeName, line.containerName, line.bottleColorName].filter(Boolean).join(' / ') || '—')}</td><td>Rs ${line.fee}</td></tr>`,
    )
    .join('');

  const token = slips.tokenNo != null ? `Token ${slips.tokenNo}` : '';
  const block = (copy: string, bcIndex: number) => `
    <section class="slip">
      ${letterheadHtml()}
      <h2>${escapeHtml(copy)}</h2>
      <div class="meta">${escapeHtml(slips.visitNumber)}${token ? ' · ' + escapeHtml(token) : ''} · ${new Date(slips.createdAt).toLocaleString()}</div>
      <svg id="bc-${bcIndex}"></svg>
      <p><strong>${escapeHtml(slips.patientName)}</strong> · ${escapeHtml(slips.phone)} · ${slips.age} yrs · ${escapeHtml(slips.gender)}</p>
      <p class="meta">Ref by: ${escapeHtml(slips.referredBy || 'Walk-in')} · Paid Rs ${slips.amountReceived} / Net Rs ${slips.net}</p>
      <table><thead><tr><th>Service</th><th>Pathway</th><th>Ready</th><th>Sample</th><th>Fee</th></tr></thead><tbody>${rows}</tbody></table>
    </section>`;

  return openPrintWindow(
    `Slips ${slips.visitNumber}`,
    block('Patient copy', 0) + block('Lab copy', 1),
    [slips.visitNumber, slips.visitNumber],
  );
}

export function printBarcodeLabel(sample: {
  barcode: string;
  visitNumber: string;
  patientName: string;
  sampleTypeName: string;
  containerName: string;
  bottleColorName: string;
  sampleGroupName: string | null;
  tests: string[];
  collectedAt: string;
}): boolean {
  const tests = (sample.tests ?? []).join(', ');
  const shortTests = tests.length > 42 ? `${tests.slice(0, 40)}…` : tests;
  const when = new Date(sample.collectedAt).toLocaleString(undefined, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return openPrintWindow(
    `Barcode ${sample.barcode}`,
    `<div class="label">
      <svg id="bc-0"></svg>
      <p class="name">${escapeHtml(sample.patientName)}</p>
      <p class="meta">${escapeHtml(sample.visitNumber)} · ${escapeHtml(when)}</p>
      <p class="tube">${escapeHtml(sample.sampleTypeName)} · ${escapeHtml(sample.containerName)} · <strong>${escapeHtml(sample.bottleColorName)}</strong></p>
      <p class="tests">${escapeHtml(sample.sampleGroupName || 'Single')} · ${escapeHtml(shortTests)}</p>
    </div>`,
    {
      barcodes: [sample.barcode],
      compactLabel: true,
      barcodeOpts: {
        height: 28,
        width: 1.05,
        fontSize: 8,
        displayValue: true,
        margin: 0,
      },
    },
  );
}

export function printFinalReport(report: {
  visitNumber: string;
  patientName: string;
  phone: string;
  age: number;
  gender: string;
  pathway: string;
  finalizedByName: string | null;
  finalizedAt: string;
  lines: Array<{
    serviceName: string;
    parameterName?: string | null;
    resultText: string | null;
    units: string | null;
    referenceRange: string | null;
    reportProfile?: string;
    urgent: boolean;
    isAbnormal?: boolean;
    isCritical?: boolean;
  }>;
}): boolean {
  const pathwayRadiology = (report.pathway || '').toLowerCase().includes('radiology');
  const lines = report.lines ?? [];
  const standardRows = lines
    .filter((line) => {
      const profile = line.reportProfile || (pathwayRadiology ? 'Radiology' : 'Standard');
      return profile === 'Standard';
    })
    .map((line) => {
      const flags = [
        line.isCritical ? 'CRITICAL' : '',
        line.isAbnormal ? 'Abnormal' : '',
        line.urgent ? 'Urgent' : '',
      ]
        .filter(Boolean)
        .join(' · ');
      const testLabel = line.parameterName
        ? `${line.serviceName} — ${line.parameterName}`
        : line.serviceName;
      return `<tr>
        <td>${escapeHtml(testLabel)}${flags ? ` <span class="flag">${escapeHtml(flags)}</span>` : ''}</td>
        <td class="${line.isAbnormal || line.isCritical ? 'flag' : ''}">${formatResultCell(line.resultText)}</td>
        <td>${escapeHtml(line.units || '—')}</td>
        <td>${escapeHtml(line.referenceRange || '—')}</td>
      </tr>`;
    })
    .join('');

  const specialBlocks = lines
    .filter((line) => {
      const profile = line.reportProfile || (pathwayRadiology ? 'Radiology' : 'Standard');
      return profile !== 'Standard';
    })
    .map((line) => {
      const profile = line.reportProfile || (pathwayRadiology ? 'Radiology' : 'Standard');
      const title = `${escapeHtml(line.serviceName)}${line.urgent ? ' <span class="flag">Urgent</span>' : ''}`;
      if (profile === 'Semen') {
        const semen = parseSemenWorksheet(line.resultText);
        return `<section class="rad-block"><h3>${title}</h3>${semenWorksheetToPrintHtml(semen)}</section>`;
      }
      return `<section class="rad-block"><h3>${title}</h3><div class="rad-body">${formatResultCell(line.resultText)}</div></section>`;
    })
    .join('');

  const body = [
    standardRows
      ? `<table><thead><tr><th>Test</th><th>Result</th><th>Units</th><th>Reference</th></tr></thead><tbody>${standardRows}</tbody></table>`
      : '',
    specialBlocks ? `<div class="rad-report">${specialBlocks}</div>` : '',
  ]
    .filter(Boolean)
    .join('');

  const reportTitle = pathwayRadiology ? 'Radiology report' : 'Final report';
  const signatureBlock = pathwayRadiology
    ? `<div class="rad-sign">
         <div class="rad-sign__line"></div>
         <strong>Electronically signed</strong>
         <div>${escapeHtml(report.finalizedByName || 'Radiologist')}</div>
         <div class="meta">${new Date(report.finalizedAt).toLocaleString()}</div>
       </div>`
    : '';

  return openPrintWindow(
    `Report ${report.visitNumber}`,
    `${letterheadHtml()}
     <h2>${reportTitle}</h2>
     <div class="meta">${escapeHtml(report.visitNumber)} · ${escapeHtml(report.pathway)} · Finalized ${new Date(report.finalizedAt).toLocaleString()} by ${escapeHtml(report.finalizedByName || '—')}</div>
     <svg id="bc-0"></svg>
     <p><strong>${escapeHtml(report.patientName)}</strong> · ${escapeHtml(report.phone)} · ${report.age} yrs · ${escapeHtml(report.gender)}</p>
     ${body || '<p>No results on this report.</p>'}
     ${signatureBlock}
     <style>
       .rad-block{margin:12px 0 18px;padding-bottom:12px;border-bottom:1px solid #e2e8f0}
       .rad-block h3{margin:0 0 8px;font-size:14px}
       .rad-body{font-size:12.5px;line-height:1.45}
       .rad-body p{margin:0 0 0.55em}
       .rad-body ul,.rad-body ol{margin:0.4em 0 0.6em 1.2em}
       .rad-sign{margin-top:28px;max-width:280px}
       .rad-sign__line{height:1px;background:#94a3b8;margin-bottom:8px}
       .rad-sign strong{display:block;font-size:12px;margin-bottom:2px}
       .semen-table{width:100%;border-collapse:collapse;font-size:12.5px}
       .semen-table th,.semen-table td{border:1px solid #e2e8f0;padding:6px 8px;text-align:left}
       .semen-table th{width:42%;background:#f8fafc;font-weight:600}
     </style>`,
    [report.visitNumber],
  );
}

function formatResultCell(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  return isRichHtml(value) ? sanitizeReportHtml(value) : escapeHtml(value);
}
