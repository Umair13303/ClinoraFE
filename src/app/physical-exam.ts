export type PhysicalExamWorksheet = {
  profile: 'PhysicalExam';
  /** Candidate extras (Wafid-style report) */
  nationality: string;
  maritalStatus: string;
  profession: string;
  passportExpiry: string;
  heightCm: string;
  weightKg: string;
  bmi: string;
  bp: string;
  pulse: string;
  rr: string;
  /** Distant unaided */
  visionRight: string;
  visionLeft: string;
  visionNearRight: string;
  visionNearLeft: string;
  colorVision: string;
  hearingRight: string;
  hearingLeft: string;
  /** System exam — typically NAD */
  respiratory: string;
  cardiovascular: string;
  gastro: string;
  nervous: string;
  genitourinary: string;
  musculoskeletal: string;
  others: string;
  /** Mental status */
  appearance: string;
  speech: string;
  cognition: string;
  orientation: string;
  generalAppearance: string;
  systemicNotes: string;
  fitnessComment: string;
};

export function emptyPhysicalExam(): PhysicalExamWorksheet {
  return {
    profile: 'PhysicalExam',
    nationality: 'Pakistani',
    maritalStatus: '',
    profession: '',
    passportExpiry: '',
    heightCm: '',
    weightKg: '',
    bmi: '',
    bp: '',
    pulse: '',
    rr: '',
    visionRight: '',
    visionLeft: '',
    visionNearRight: '',
    visionNearLeft: '',
    colorVision: '',
    hearingRight: 'Normal',
    hearingLeft: 'Normal',
    respiratory: 'NAD',
    cardiovascular: 'NAD',
    gastro: 'NAD',
    nervous: 'NAD',
    genitourinary: 'NAD',
    musculoskeletal: 'NAD',
    others: 'NAD',
    appearance: 'NAD',
    speech: 'NAD',
    cognition: 'NAD',
    orientation: 'NAD',
    generalAppearance: '',
    systemicNotes: '',
    fitnessComment: '',
  };
}

export function parsePhysicalExam(raw: string | null | undefined): PhysicalExamWorksheet {
  const blank = emptyPhysicalExam();
  if (!raw?.trim()) {
    return blank;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PhysicalExamWorksheet> & { hearing?: string };
    if (parsed && (parsed.profile === 'PhysicalExam' || typeof parsed.heightCm === 'string')) {
      const merged = { ...blank, ...parsed, profile: 'PhysicalExam' as const };
      // Migrate old single hearing field
      if (!parsed.hearingRight && !parsed.hearingLeft && parsed.hearing) {
        merged.hearingRight = parsed.hearing;
        merged.hearingLeft = parsed.hearing;
      }
      return merged;
    }
  } catch {
    /* fall through */
  }
  return { ...blank, systemicNotes: raw };
}

export function serializePhysicalExam(data: PhysicalExamWorksheet): string {
  const height = Number.parseFloat(data.heightCm);
  const weight = Number.parseFloat(data.weightKg);
  let bmi = data.bmi;
  if ((!bmi || !bmi.trim()) && height > 0 && weight > 0) {
    const meters = height / 100;
    bmi = (weight / (meters * meters)).toFixed(2);
  }
  return JSON.stringify({ ...data, bmi, profile: 'PhysicalExam' });
}

export function physicalExamValid(data: PhysicalExamWorksheet): boolean {
  return !!(data.heightCm.trim() || data.weightKg.trim() || data.bp.trim() || data.systemicNotes.trim());
}

export function physicalExamToPrintHtml(data: PhysicalExamWorksheet): string {
  const row = (label: string, value: string, unit = '') =>
    `<tr><th>${escape(label)}</th><td>${escape(value || '—')}${value && unit ? ` ${unit}` : ''}</td></tr>`;

  return `<table class="pe-table">
    <tbody>
      ${row('Height', data.heightCm, 'cm')}
      ${row('Weight', data.weightKg, 'kg')}
      ${row('BMI', data.bmi)}
      ${row('Blood pressure', data.bp, 'mmHg')}
      ${row('Pulse', data.pulse, '/min')}
      ${row('RR', data.rr, '/min')}
      ${row('Vision distant R/L', `${data.visionRight || '—'} / ${data.visionLeft || '—'}`)}
      ${row('Vision near R/L', `${data.visionNearRight || '—'} / ${data.visionNearLeft || '—'}`)}
      ${row('Color vision', data.colorVision)}
      ${row('Hearing R/L', `${data.hearingRight || '—'} / ${data.hearingLeft || '—'}`)}
      ${row('Respiratory', data.respiratory)}
      ${row('CVS', data.cardiovascular)}
      ${row('GI', data.gastro)}
      ${row('CNS', data.nervous)}
      ${row('GU', data.genitourinary)}
      ${row('MSK', data.musculoskeletal)}
      ${row('Examiner comment', data.fitnessComment)}
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
