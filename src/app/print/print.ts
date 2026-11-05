import { parsePhysicalExam } from '../physical-exam';
import { composeReportBodyHtml, reportViewStyles } from '../report-views';

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
  const body = composeReportBodyHtml(report.lines ?? [], report.pathway);

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
     ${body}
     ${signatureBlock}
     <style>
       ${reportViewStyles}
       .rad-sign{margin-top:28px;max-width:280px}
       .rad-sign__line{height:1px;background:#94a3b8;margin-bottom:8px}
       .rad-sign strong{display:block;font-size:12px;margin-bottom:2px}
     </style>`,
    [report.visitNumber],
  );
}

export function printVaccinationCard(card: {
  visitNumber: string;
  patientName: string;
  phone: string;
  age: number;
  gender: string;
  vaccineName: string;
  record: {
    batchNo?: string | null;
    lotNo?: string | null;
    expiryDate?: string | null;
    doseNumber?: string | null;
    site?: string | null;
    route?: string | null;
    administeredAt: string;
    administeredByName?: string | null;
    nextDueAt?: string | null;
    notes?: string | null;
  };
}): boolean {
  const fmt = (value: string | null | undefined) => {
    if (!value) {
      return '—';
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? escapeHtml(value) : escapeHtml(d.toLocaleDateString());
  };
  const row = (label: string, value: string) =>
    `<tr><th>${escapeHtml(label)}</th><td>${value}</td></tr>`;

  return openPrintWindow(
    `Vaccination ${card.visitNumber}`,
    `${letterheadHtml()}
     <h2>Vaccination card</h2>
     <div class="meta">${escapeHtml(card.visitNumber)} · ${new Date(card.record.administeredAt).toLocaleString()}</div>
     <svg id="bc-0"></svg>
     <p><strong>${escapeHtml(card.patientName)}</strong> · ${escapeHtml(card.phone)} · ${card.age} yrs · ${escapeHtml(card.gender)}</p>
     <table class="vac-table">
       <tbody>
         ${row('Vaccine', escapeHtml(card.vaccineName))}
         ${row('Dose', escapeHtml(card.record.doseNumber || '—'))}
         ${row('Batch', escapeHtml(card.record.batchNo || '—'))}
         ${row('Lot', escapeHtml(card.record.lotNo || '—'))}
         ${row('Expiry', fmt(card.record.expiryDate))}
         ${row('Site', escapeHtml(card.record.site || '—'))}
         ${row('Route', escapeHtml(card.record.route || '—'))}
         ${row('Administered', escapeHtml(new Date(card.record.administeredAt).toLocaleString()))}
         ${row('By', escapeHtml(card.record.administeredByName || '—'))}
         ${row('Next due', fmt(card.record.nextDueAt))}
         ${row('Notes', escapeHtml(card.record.notes || '—'))}
       </tbody>
     </table>
     <style>
       .vac-table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12.5px}
       .vac-table th,.vac-table td{border:1px solid #e2e8f0;padding:6px 8px;text-align:left}
       .vac-table th{width:34%;background:#f8fafc;font-weight:600}
     </style>`,
    [card.visitNumber],
  );
}

export function printMedicalCertificate(detail: {
  visitNumber: string;
  patientName: string;
  phone: string;
  age: number;
  gender: string;
  passportNo?: string | null;
  cnic?: string | null;
  photoUrl?: string | null;
  fitness: string;
  destinationCountry?: string | null;
  remarks?: string | null;
  issuedByName?: string | null;
  issuedAt?: string | null;
  physicalExamJson?: string | null;
  lines: Array<{
    serviceName: string;
    pathway: string;
    reportProfile: string;
    status: string;
    complete: boolean;
    resultPreview?: string | null;
  }>;
}): boolean {
  const clinic = readLetterhead();
  const pe = parsePhysicalExam(detail.physicalExamJson);
  const examinedAt = detail.issuedAt ? new Date(detail.issuedAt) : new Date();
  const expiry = new Date(examinedAt);
  expiry.setMonth(expiry.getMonth() + 2);
  const fmtDate = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

  const cell = (label: string, value: string) =>
    `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || '—')}</td></tr>`;

  const pair = (l1: string, v1: string, l2: string, v2: string) =>
    `<tr>
      <th>${escapeHtml(l1)}</th><td>${escapeHtml(v1 || '—')}</td>
      <th>${escapeHtml(l2)}</th><td>${escapeHtml(v2 || '—')}</td>
    </tr>`;

  const labVal = (names: string[]) => {
    const line = detail.lines.find((l) =>
      names.some((n) => l.serviceName.toLowerCase().includes(n.toLowerCase())),
    );
    if (!line) {
      return '—';
    }
    const text = (line.resultPreview || '').trim();
    if (!text || text === '—') {
      return line.complete ? 'Done' : line.status;
    }
    return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48);
  };

  const chest = (() => {
    const line = detail.lines.find((l) => l.pathway === 'Radiology');
    if (!line) {
      return '—';
    }
    const text = (line.resultPreview || '').replace(/<[^>]+>/g, ' ').trim();
    if (/nad|normal|clear|no acute/i.test(text)) {
      return 'NAD';
    }
    return text ? text.slice(0, 60) : line.complete ? 'Reported' : line.status;
  })();

  const vacCell = (names: string[]) => {
    const line = detail.lines.find(
      (l) =>
        l.pathway === 'Vaccination' &&
        names.some((n) => l.serviceName.toLowerCase().includes(n.toLowerCase())),
    );
    if (!line) {
      return { given: 'No', date: '—' };
    }
    const given = line.complete || line.status === 'Administered' ? 'Yes' : 'No';
    return { given, date: given === 'Yes' ? fmtDate(examinedAt) : '—' };
  };

  const displayName = detail.patientName.replace(/\s*\(Demo Fit\)\s*/i, '').trim();
  const fitness = (detail.fitness || 'Pending').toUpperCase();
  const fitnessClass = fitness === 'FIT' ? 'fit' : fitness === 'UNFIT' ? 'unfit' : 'pending';
  const titleHonorific = /female/i.test(detail.gender) ? 'Ms.' : 'Mr.';
  const photo = detail.photoUrl
    ? `<img class="photo" src="${escapeHtml(detail.photoUrl)}" alt="" />`
    : `<div class="photo photo--empty">Photo</div>`;

  const otherLabs = detail.lines.filter(
    (l) =>
      l.pathway === 'Laboratory' &&
      !['hiv', 'hbsag', 'hbs', 'hcv', 'vdrl', 'tpha'].some((n) =>
        l.serviceName.toLowerCase().includes(n),
      ),
  );

  const polio = vacCell(['polio', 'ipv']);
  const mmr = vacCell(['mmr', 'measles']);
  const mening = vacCell(['mening']);
  const flu = vacCell(['influenza', 'flu']);
  const hep = vacCell(['hepatitis', 'hep b']);
  const code = JSON.stringify(detail.visitNumber);
  const clinicName = clinic.name || 'Clinora Diagnostics';

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Medical fitness · ${escapeHtml(detail.visitNumber)}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>
  /* Zero @page margin suppresses Chrome URL / page headers on print */
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: #0b1220;
    font: 10.5px/1.35 Arial, Helvetica, sans-serif;
    background: #e8eef5;
  }
  .toolbar {
    position: sticky; top: 0; z-index: 5;
    display: flex; gap: 8px; justify-content: flex-end;
    padding: 10px 14px; background: #0f172a; color: #fff;
  }
  .toolbar button {
    border: 0; border-radius: 6px; padding: 8px 14px;
    font-weight: 700; cursor: pointer;
  }
  .toolbar .print { background: #0f766e; color: #fff; }
  .toolbar .close { background: #fff; color: #0f172a; }
  .sheet {
    width: 210mm; min-height: 297mm; margin: 12px auto;
    padding: 12mm 11mm 10mm; background: #fff;
    box-shadow: 0 8px 28px rgba(15, 23, 42, .18);
  }
  .head {
    display: grid; grid-template-columns: 1.15fr 1.7fr 1.15fr;
    gap: 8px; align-items: start; margin-bottom: 8px;
    padding-bottom: 8px; border-bottom: 2.5px solid #0f172a;
  }
  .logo-mark {
    width: 42px; height: 42px; border-radius: 8px;
    background: linear-gradient(145deg, #0f766e, #115e59);
    color: #fff; display: grid; place-items: center;
    font-weight: 800; font-size: 16px; letter-spacing: .04em;
  }
  .brand { display: flex; gap: 8px; align-items: center; }
  .brand strong { display: block; font-size: 16px; color: #0f766e; line-height: 1.1; }
  .brand span { font-size: 9px; letter-spacing: .12em; text-transform: uppercase; color: #64748b; }
  .head h1 {
    margin: 0 0 6px; text-align: center; font-size: 17px;
    letter-spacing: .02em; font-weight: 800;
  }
  .meta-center { text-align: center; }
  .meta-center div, .meta-side div { margin: 1px 0; }
  .meta-center .lbl, .meta-side .lbl { color: #64748b; font-size: 9px; }
  .meta-center b, .meta-side b { font-size: 11px; }
  .meta-side { text-align: right; }
  .candidate {
    display: grid; grid-template-columns: 82px 1fr; gap: 8px; margin-bottom: 8px;
  }
  .photo {
    width: 82px; height: 100px; object-fit: cover;
    border: 1px solid #94a3b8; background: #f8fafc;
  }
  .photo--empty {
    display: grid; place-items: center; color: #94a3b8; font-size: 10px;
  }
  table.form { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.form th, table.form td {
    border: 1px solid #94a3b8; padding: 3px 6px; vertical-align: top;
  }
  table.form th {
    width: 18%; background: #f1f5f9; font-weight: 600; color: #334155;
    text-align: left; font-size: 9.5px;
  }
  table.form td { width: 32%; font-weight: 700; font-size: 10.5px; }
  .section { margin-top: 7px; }
  .section > h2 {
    margin: 0; padding: 4px 7px; background: #0f172a; color: #fff;
    font-size: 10px; letter-spacing: .06em; text-transform: uppercase;
  }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
  .grid-3 { display: grid; grid-template-columns: 1.1fr 1fr 1fr; gap: 7px; }
  .panel { border: 1px solid #94a3b8; border-top: 0; }
  .panel h3 {
    margin: 0; padding: 3px 6px; background: #e2e8f0;
    font-size: 9.5px; text-transform: uppercase; letter-spacing: .04em;
  }
  .panel table.form { border: 0; }
  .panel table.form th, .panel table.form td { border-color: #cbd5e1; }
  .panel table.form th { width: 46%; }
  .panel table.form td { width: 54%; }
  table.mini th, table.mini td { text-align: center; }
  table.mini th:first-child, table.mini td:first-child { text-align: left; width: 46%; }
  .fit-row {
    margin-top: 10px; display: grid; grid-template-columns: 110px 1fr;
    gap: 10px; align-items: start; border-top: 2px solid #0f172a; padding-top: 8px;
  }
  .stamp {
    text-align: center; font-size: 26px; font-weight: 900; letter-spacing: .1em;
    padding: 10px 6px; border: 3px solid currentColor; line-height: 1;
  }
  .stamp.fit { color: #15803d; }
  .stamp.unfit { color: #b91c1c; }
  .stamp.pending { color: #a16207; }
  .summary { margin: 0 0 10px; font-size: 11px; line-height: 1.45; }
  .sign-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; }
  .sign-line { width: 170px; border-bottom: 1px solid #64748b; height: 28px; margin-bottom: 4px; }
  .sign-name { font-weight: 700; font-size: 11px; }
  .sign-role { color: #64748b; font-size: 9px; }
  .foot {
    margin-top: 10px; padding-top: 6px; border-top: 1px solid #cbd5e1;
    display: flex; justify-content: space-between; gap: 10px;
    color: #64748b; font-size: 9px;
  }
  @media print {
    body { background: #fff; }
    .toolbar { display: none !important; }
    .sheet { margin: 0; box-shadow: none; width: auto; min-height: auto; }
  }
</style></head><body>
  <div class="toolbar no-print">
    <button type="button" class="print" onclick="window.print()">Print</button>
    <button type="button" class="close" onclick="window.close()">Close</button>
  </div>
  <div class="sheet">
    <header class="head">
      <div class="brand">
        <div class="logo-mark">C</div>
        <div>
          <strong>${escapeHtml(clinicName)}</strong>
          <span>Medical fitness</span>
        </div>
      </div>
      <div class="meta-center">
        <h1>Detailed candidate report</h1>
        <div><span class="lbl">Medical center</span><br><b>${escapeHtml(clinicName)}</b></div>
        <div><span class="lbl">Date examined</span> · <b>${fmtDate(examinedAt)}</b>
          &nbsp;|&nbsp; <span class="lbl">Expiry</span> · <b>${fmtDate(expiry)}</b></div>
      </div>
      <div class="meta-side">
        <div><span class="lbl">Visit / slip no.</span><br><b>${escapeHtml(detail.visitNumber)}</b></div>
        <div><span class="lbl">Clinic phone</span><br><b>${escapeHtml(clinic.phone || '—')}</b></div>
      </div>
    </header>

    <section class="candidate">
      ${photo}
      <table class="form">
        ${pair('Name', displayName, 'Gender', detail.gender)}
        ${pair('Nationality', pe.nationality, 'Travelling to', detail.destinationCountry || '—')}
        ${pair('Marital status', pe.maritalStatus, 'Passport no.', detail.passportNo || '—')}
        ${pair('Age', String(detail.age), 'Passport expiry', pe.passportExpiry)}
        ${pair('Profession', pe.profession, 'Height', pe.heightCm ? `${pe.heightCm} cm` : '—')}
        ${pair('Weight', pe.weightKg ? `${pe.weightKg} kg` : '—', 'BMI', pe.bmi)}
      </table>
    </section>

    <div class="grid-3 section">
      <div>
        <h2>General examination</h2>
        <div class="panel"><table class="form">
          ${cell('Blood pressure', pe.bp)}
          ${cell('Pulse / min', pe.pulse)}
          ${cell('RR / min', pe.rr)}
        </table></div>
      </div>
      <div>
        <h2>Investigation</h2>
        <div class="panel"><table class="form">
          ${cell('Chest X-Ray', chest)}
        </table></div>
        <h2 style="margin-top:7px">Hearing</h2>
        <div class="panel"><table class="form">
          ${cell('Right ear', pe.hearingRight)}
          ${cell('Left ear', pe.hearingLeft)}
        </table></div>
      </div>
      <div>
        <h2>Visual acuity</h2>
        <div class="panel"><table class="form mini">
          <tr><th></th><th>Right</th><th>Left</th></tr>
          <tr><td>Distant</td><td>${escapeHtml(pe.visionRight || '—')}</td><td>${escapeHtml(pe.visionLeft || '—')}</td></tr>
          <tr><td>Near</td><td>${escapeHtml(pe.visionNearRight || '—')}</td><td>${escapeHtml(pe.visionNearLeft || '—')}</td></tr>
          <tr><th>Color vision</th><td colspan="2">${escapeHtml(pe.colorVision || '—')}</td></tr>
        </table></div>
      </div>
    </div>

    <div class="section">
      <h2>Laboratory investigation</h2>
      <div class="panel">
        <table class="form">
          ${pair('Anti-HIV', labVal(['hiv']), 'HBsAg', labVal(['hbsag', 'hbs']))}
          ${pair('Anti-HCV', labVal(['hcv']), 'VDRL / TPHA', labVal(['vdrl', 'tpha']))}
          ${otherLabs
            .reduce<string[]>((rows, l, i) => {
              if (i % 2 === 1) {
                return rows;
              }
              const next = otherLabs[i + 1];
              rows.push(
                next
                  ? pair(l.serviceName, labVal([l.serviceName]), next.serviceName, labVal([next.serviceName]))
                  : `<tr><th>${escapeHtml(l.serviceName)}</th><td colspan="3">${escapeHtml(labVal([l.serviceName]))}</td></tr>`,
              );
              return rows;
            }, [])
            .join('')}
        </table>
      </div>
    </div>

    <div class="grid-3 section">
      <div>
        <h2>System examination</h2>
        <div class="panel"><table class="form">
          ${cell('Respiratory', pe.respiratory)}
          ${cell('Cardiovascular', pe.cardiovascular)}
          ${cell('Gastro intestinal', pe.gastro)}
          ${cell('Nervous system', pe.nervous)}
          ${cell('Genitourinary', pe.genitourinary)}
          ${cell('Musculoskeletal', pe.musculoskeletal)}
          ${cell('Others', pe.others)}
        </table></div>
      </div>
      <div>
        <h2>Vaccination status</h2>
        <div class="panel"><table class="form mini">
          <tr><th>Vaccine</th><th>Given</th><th>Date</th></tr>
          <tr><td>Polio / IPV</td><td>${polio.given}</td><td>${polio.date}</td></tr>
          <tr><td>MMR</td><td>${mmr.given}</td><td>${mmr.date}</td></tr>
          <tr><td>Meningococcal</td><td>${mening.given}</td><td>${mening.date}</td></tr>
          <tr><td>Influenza</td><td>${flu.given}</td><td>${flu.date}</td></tr>
          <tr><td>Hepatitis B</td><td>${hep.given}</td><td>${hep.date}</td></tr>
        </table></div>
      </div>
      <div>
        <h2>Mental status</h2>
        <div class="panel"><table class="form">
          ${cell('Appearance', pe.appearance)}
          ${cell('Speech', pe.speech)}
          ${cell('Cognition', pe.cognition)}
          ${cell('Orientation', pe.orientation)}
        </table></div>
      </div>
    </div>

    <section class="fit-row">
      <div class="stamp ${fitnessClass}">${escapeHtml(fitness)}</div>
      <div>
        <p class="summary">
          Mentioned above is the medical report for ${titleHonorific}
          <strong>${escapeHtml(displayName)}</strong>, who is declared
          <strong>${escapeHtml(detail.fitness || 'Pending')}</strong>
          for the above-mentioned job according to the medical fitness criteria.
          ${detail.remarks ? `<br><em>${escapeHtml(detail.remarks)}</em>` : ''}
        </p>
        <div class="sign-row">
          <div>
            <div class="sign-line"></div>
            <div class="sign-name">${escapeHtml(detail.issuedByName || 'Medical officer')}</div>
            <div class="sign-role">Examining physician</div>
          </div>
          <svg id="bc-0"></svg>
        </div>
      </div>
    </section>

    <footer class="foot">
      <span>${escapeHtml([clinicName, clinic.address].filter(Boolean).join(' · '))}</span>
      <span>${escapeHtml(detail.visitNumber)} · ${fmtDate(examinedAt)}</span>
    </footer>
  </div>
<script>
(function(){
  var code = ${code};
  function draw(){
    var el = document.getElementById('bc-0');
    if (el && window.JsBarcode) {
      try {
        JsBarcode(el, code, {
          format: 'CODE128', displayValue: false,
          height: 36, width: 1.35, margin: 0
        });
      } catch (e) {}
    }
  }
  if (window.JsBarcode) draw();
  else setTimeout(draw, 300);
})();
<\/script>
</body></html>`;

  // Dedicated popup (about:blank) + @page margin:0 so Chrome does not stamp localhost URL.
  const win = window.open('', '_blank', 'width=920,height=1100');
  if (!win) {
    return openPopupPrint(`Medical fitness ${detail.visitNumber}`, html);
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    try {
      win.print();
    } catch {
      /* Print button on toolbar */
    }
  }, 500);
  return true;
}
