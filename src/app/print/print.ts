function buildDocument(title: string, bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body{font-family:Manrope,Segoe UI,sans-serif;color:#0f172a;margin:24px;font-size:13px}
  h1{font-size:18px;margin:0 0 4px} h2{font-size:14px;margin:16px 0 6px;text-transform:uppercase;letter-spacing:.08em;color:#475569}
  .meta{color:#64748b;font-size:12px;margin-bottom:12px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{border-bottom:1px solid #e2e8f0;padding:6px 4px;text-align:left;font-size:12px}
  .slip{border:1px solid #cbd5e1;border-radius:10px;padding:16px;margin-bottom:18px;page-break-inside:avoid}
  .barcode{font-family:Consolas,monospace;font-size:22px;letter-spacing:.12em;font-weight:700}
  .label{width:280px;border:1px dashed #94a3b8;padding:12px;border-radius:8px}
  .actions{margin:12px 0 20px}
  .actions button{margin-right:8px;padding:8px 14px;border-radius:8px;border:1px solid #cbd5e1;background:#0f766e;color:#fff;font-weight:600;cursor:pointer}
  .actions button.secondary{background:#fff;color:#0f172a}
  @media print{.actions{display:none!important} body{margin:12px}}
</style></head><body>
<div class="actions">
  <button type="button" onclick="window.print()">Print</button>
  <button type="button" class="secondary" onclick="window.close()">Close</button>
</div>
${bodyHtml}
</body></html>`;
}

/** Prefer iframe print (works after async API). Popup is fallback for a visible preview. */
export function openPrintWindow(title: string, bodyHtml: string): boolean {
  const html = buildDocument(title, bodyHtml);

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

    // Give the frame a tick to parse HTML before print dialog.
    setTimeout(trigger, 150);
    return true;
  } catch {
    return openPopupPrint(title, html);
  }
}

function openPopupPrint(title: string, html: string): boolean {
  // Do NOT use noopener — browsers return null and print never runs.
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    // Last resort: downloadable HTML the user can open/print.
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
  }, 200);
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

  const block = (copy: string) => `
    <section class="slip">
      <h1>Clinora — ${escapeHtml(copy)}</h1>
      <div class="meta">${escapeHtml(slips.visitNumber)} · ${new Date(slips.createdAt).toLocaleString()}</div>
      <p><strong>${escapeHtml(slips.patientName)}</strong> · ${escapeHtml(slips.phone)} · ${slips.age} yrs · ${escapeHtml(slips.gender)}</p>
      <p class="meta">Ref by: ${escapeHtml(slips.referredBy || 'Walk-in')} · Paid Rs ${slips.amountReceived} / Due Rs ${slips.net}</p>
      <table><thead><tr><th>Service</th><th>Pathway</th><th>Ready</th><th>Sample</th><th>Fee</th></tr></thead><tbody>${rows}</tbody></table>
    </section>`;

  return openPrintWindow(`Slips ${slips.visitNumber}`, block('Patient copy') + block('Lab copy'));
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
  const tests = sample.tests ?? [];
  return openPrintWindow(
    `Barcode ${sample.barcode}`,
    `<div class="label">
      <div class="barcode">${escapeHtml(sample.barcode)}</div>
      <p><strong>${escapeHtml(sample.patientName)}</strong></p>
      <p class="meta">${escapeHtml(sample.visitNumber)} · ${new Date(sample.collectedAt).toLocaleString()}</p>
      <p>${escapeHtml(sample.sampleTypeName)} · ${escapeHtml(sample.containerName)} · <strong>${escapeHtml(sample.bottleColorName)}</strong></p>
      <p class="meta">${escapeHtml(sample.sampleGroupName || 'Single')} · ${escapeHtml(tests.join(', '))}</p>
    </div>`,
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
    resultText: string | null;
    units: string | null;
    referenceRange: string | null;
    urgent: boolean;
  }>;
}): boolean {
  const rows = (report.lines ?? [])
    .map(
      (line) =>
        `<tr><td>${escapeHtml(line.serviceName)}${line.urgent ? ' · Urgent' : ''}</td><td>${escapeHtml(line.resultText || '—')}</td><td>${escapeHtml(line.units || '—')}</td><td>${escapeHtml(line.referenceRange || '—')}</td></tr>`,
    )
    .join('');

  return openPrintWindow(
    `Report ${report.visitNumber}`,
    `<h1>Clinora final report</h1>
     <div class="meta">${escapeHtml(report.visitNumber)} · ${escapeHtml(report.pathway)} · Finalized ${new Date(report.finalizedAt).toLocaleString()} by ${escapeHtml(report.finalizedByName || '—')}</div>
     <p><strong>${escapeHtml(report.patientName)}</strong> · ${escapeHtml(report.phone)} · ${report.age} yrs · ${escapeHtml(report.gender)}</p>
     <table><thead><tr><th>Test</th><th>Result</th><th>Units</th><th>Reference</th></tr></thead><tbody>${rows}</tbody></table>`,
  );
}
