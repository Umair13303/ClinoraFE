export type IhcMarkerRow = {
  code: string;
  name: string;
  result: string;
  percent: string;
  intensity: string;
  score: string;
  notes: string;
};

export type IhcWorksheet = {
  profile: 'Ihc';
  panelName: string;
  markers: IhcMarkerRow[];
  interpretation: string;
};

export function emptyIhcMarker(partial?: Partial<IhcMarkerRow>): IhcMarkerRow {
  return {
    code: partial?.code ?? '',
    name: partial?.name ?? '',
    result: partial?.result ?? '',
    percent: partial?.percent ?? '',
    intensity: partial?.intensity ?? '',
    score: partial?.score ?? '',
    notes: partial?.notes ?? '',
  };
}

export function emptyIhcWorksheet(panelName = 'IHC panel'): IhcWorksheet {
  return {
    profile: 'Ihc',
    panelName,
    markers: [],
    interpretation: '',
  };
}

export function parseIhcWorksheet(raw: string | null | undefined): IhcWorksheet {
  const blank = emptyIhcWorksheet();
  if (!raw?.trim()) {
    return blank;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<IhcWorksheet>;
    if (parsed && (parsed.profile === 'Ihc' || Array.isArray(parsed.markers))) {
      return {
        profile: 'Ihc',
        panelName: parsed.panelName ?? blank.panelName,
        markers: (parsed.markers ?? []).map((m) => emptyIhcMarker(m)),
        interpretation: parsed.interpretation ?? '',
      };
    }
  } catch {
    /* plain text → interpretation */
  }
  return { ...blank, interpretation: raw };
}

export function serializeIhcWorksheet(data: IhcWorksheet): string {
  return JSON.stringify({
    profile: 'Ihc',
    panelName: data.panelName,
    markers: data.markers,
    interpretation: data.interpretation,
  });
}

export function ihcWorksheetValid(data: IhcWorksheet): boolean {
  return (
    data.markers.some((m) => m.name.trim() && m.result.trim()) || !!data.interpretation.trim()
  );
}

export function ihcWorksheetToPrintHtml(data: IhcWorksheet): string {
  const rows = data.markers
    .filter((m) => m.name.trim() || m.result.trim())
    .map(
      (m) => `<tr>
        <td>${escape(m.code || '—')}</td>
        <td>${escape(m.name || '—')}</td>
        <td>${escape(m.result || '—')}</td>
        <td>${escape(m.percent || '—')}</td>
        <td>${escape(m.intensity || '—')}</td>
        <td>${escape(m.score || '—')}</td>
        <td>${escape(m.notes || '—')}</td>
      </tr>`,
    )
    .join('');

  const table = rows
    ? `<table class="ihc-table">
        <thead>
          <tr>
            <th>Code</th><th>Antibody</th><th>Result</th><th>%</th><th>Intensity</th><th>Score</th><th>Notes</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`
    : '<p>No antibody markers recorded.</p>';

  const panel = data.panelName?.trim()
    ? `<p class="ihc-panel"><strong>Panel:</strong> ${escape(data.panelName)}</p>`
    : '';
  const interp = data.interpretation?.trim()
    ? `<p class="ihc-interp"><strong>Interpretation:</strong> ${escape(data.interpretation)}</p>`
    : '';

  return `${panel}${table}${interp}`;
}

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
