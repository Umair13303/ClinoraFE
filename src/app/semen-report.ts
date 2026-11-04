export type SemenWorksheet = {
  profile: 'Semen';
  abstinenceDays: string;
  volumeMl: string;
  color: string;
  viscosity: string;
  liquefactionMin: string;
  ph: string;
  concentration: string;
  totalCount: string;
  progressiveMotility: string;
  nonProgressiveMotility: string;
  immotile: string;
  normalMorphology: string;
  wbc: string;
  impression: string;
};

export function emptySemenWorksheet(): SemenWorksheet {
  return {
    profile: 'Semen',
    abstinenceDays: '',
    volumeMl: '',
    color: '',
    viscosity: '',
    liquefactionMin: '',
    ph: '',
    concentration: '',
    totalCount: '',
    progressiveMotility: '',
    nonProgressiveMotility: '',
    immotile: '',
    normalMorphology: '',
    wbc: '',
    impression: '',
  };
}

export function parseSemenWorksheet(raw: string | null | undefined): SemenWorksheet {
  const blank = emptySemenWorksheet();
  if (!raw?.trim()) {
    return blank;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<SemenWorksheet>;
    if (parsed && (parsed.profile === 'Semen' || typeof parsed.volumeMl === 'string')) {
      return { ...blank, ...parsed, profile: 'Semen' };
    }
  } catch {
    /* plain text fallback into impression */
  }
  return { ...blank, impression: raw };
}

export function serializeSemenWorksheet(data: SemenWorksheet): string {
  return JSON.stringify({ ...data, profile: 'Semen' });
}

export function semenWorksheetValid(data: SemenWorksheet): boolean {
  return !!(data.volumeMl.trim() || data.concentration.trim() || data.impression.trim());
}

export function semenWorksheetToPrintHtml(data: SemenWorksheet): string {
  const row = (label: string, value: string, unit = '') =>
    `<tr><th>${label}</th><td>${escape(value || '—')}${value && unit ? ` ${unit}` : ''}</td></tr>`;

  return `<table class="semen-table">
    <tbody>
      ${row('Abstinence', data.abstinenceDays, 'days')}
      ${row('Volume', data.volumeMl, 'mL')}
      ${row('Color', data.color)}
      ${row('Viscosity', data.viscosity)}
      ${row('Liquefaction', data.liquefactionMin, 'min')}
      ${row('pH', data.ph)}
      ${row('Concentration', data.concentration, 'M/mL')}
      ${row('Total count', data.totalCount, 'M')}
      ${row('Progressive motility', data.progressiveMotility, '%')}
      ${row('Non-progressive motility', data.nonProgressiveMotility, '%')}
      ${row('Immotile', data.immotile, '%')}
      ${row('Normal morphology', data.normalMorphology, '%')}
      ${row('WBC', data.wbc)}
      ${row('Impression', data.impression)}
    </tbody>
  </table>`;
}

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
