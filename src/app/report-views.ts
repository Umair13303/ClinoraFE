/**
 * Profile → report body HTML registry (print + preview share this).
 * Add new lab departments by registering a renderer — do not fork the whole print pipeline.
 */
import { ihcWorksheetToPrintHtml, parseIhcWorksheet } from './ihc-report';
import { parsePhysicalExam, physicalExamToPrintHtml } from './physical-exam';
import { sanitizeReportHtml } from './rich-text';
import { parseSemenWorksheet, semenWorksheetToPrintHtml } from './semen-report';

export type ReportViewLine = {
  serviceName: string;
  parameterName?: string | null;
  resultText: string | null;
  units: string | null;
  referenceRange: string | null;
  reportProfile?: string | null;
  urgent?: boolean;
  isAbnormal?: boolean;
  isCritical?: boolean;
};

export type ReportProfileId =
  | 'Standard'
  | 'Semen'
  | 'Narrative'
  | 'Radiology'
  | 'Ihc'
  | 'PhysicalExam'
  | string;

export function normalizeReportProfile(
  profile: string | null | undefined,
  pathwayHint?: string,
): ReportProfileId {
  const raw = (profile || '').trim();
  if (raw) {
    return raw;
  }
  if ((pathwayHint || '').toLowerCase().includes('radiology')) {
    return 'Radiology';
  }
  return 'Standard';
}

export function renderStandardTable(lines: ReportViewLine[]): string {
  const rows = lines
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
  if (!rows) {
    return '';
  }
  return `<section class="rv-section rv-standard">
    <h3 class="rv-section__title">Laboratory results</h3>
    <table><thead><tr><th>Test</th><th>Result</th><th>Units</th><th>Reference</th></tr></thead><tbody>${rows}</tbody></table>
  </section>`;
}

export function renderProfileBlock(line: ReportViewLine, pathwayHint?: string): string {
  const profile = normalizeReportProfile(line.reportProfile, pathwayHint);
  const title = `${escapeHtml(line.serviceName)}${line.urgent ? ' <span class="flag">Urgent</span>' : ''}`;

  if (profile === 'Semen') {
    return `<section class="rv-section rv-semen"><h3 class="rv-section__title">${title}</h3>${semenWorksheetToPrintHtml(parseSemenWorksheet(line.resultText))}</section>`;
  }
  if (profile === 'Ihc') {
    return `<section class="rv-section rv-ihc"><h3 class="rv-section__title">${title}</h3>${ihcWorksheetToPrintHtml(parseIhcWorksheet(line.resultText))}</section>`;
  }
  if (profile === 'PhysicalExam') {
    return `<section class="rv-section rv-physical"><h3 class="rv-section__title">${title}</h3>${physicalExamToPrintHtml(parsePhysicalExam(line.resultText))}</section>`;
  }
  if (profile === 'Narrative') {
    return `<section class="rv-section rv-narrative"><h3 class="rv-section__title">${title}</h3><div class="rv-body">${formatResultCell(line.resultText)}</div></section>`;
  }
  if (profile === 'Radiology') {
    return `<section class="rv-section rv-radiology"><h3 class="rv-section__title">${title}</h3><div class="rv-body">${formatResultCell(line.resultText)}</div></section>`;
  }
  // Fallback for future Micro/BloodBank until dedicated renderers ship
  return `<section class="rv-section rv-generic"><h3 class="rv-section__title">${title}</h3><div class="rv-body">${formatResultCell(line.resultText)}</div></section>`;
}

export function composeReportBodyHtml(lines: ReportViewLine[], pathwayHint?: string): string {
  const list = lines ?? [];
  const standard = list.filter((l) => normalizeReportProfile(l.reportProfile, pathwayHint) === 'Standard');
  const special = list.filter((l) => normalizeReportProfile(l.reportProfile, pathwayHint) !== 'Standard');

  const parts = [
    renderStandardTable(standard),
    ...special.map((line) => renderProfileBlock(line, pathwayHint)),
  ].filter(Boolean);

  return parts.join('') || '<p>No results on this report.</p>';
}

export const reportViewStyles = `
  .rv-section{margin:12px 0 18px;padding-bottom:12px;border-bottom:1px solid #e2e8f0}
  .rv-section__title{margin:0 0 8px;font-size:14px}
  .rv-body{font-size:12.5px;line-height:1.45}
  .rv-body p{margin:0 0 0.55em}
  .rv-body ul,.rv-body ol{margin:0.4em 0 0.6em 1.2em}
  .semen-table,.ihc-table,.pe-table{width:100%;border-collapse:collapse;font-size:12.5px}
  .semen-table th,.semen-table td,.ihc-table th,.ihc-table td,.pe-table th,.pe-table td{border:1px solid #e2e8f0;padding:6px 8px;text-align:left}
  .semen-table th,.pe-table th{width:42%;background:#f8fafc;font-weight:600}
  .ihc-table th{background:#f8fafc;font-weight:600}
  .ihc-panel,.ihc-interp{font-size:12.5px;margin:0 0 8px}
`;

function isRichHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function formatResultCell(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  return isRichHtml(value) ? sanitizeReportHtml(value) : escapeHtml(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
