const PREFIX = 'clinora.station.';

export function readPref(key: string): string {
  try {
    return sessionStorage.getItem(PREFIX + key) ?? '';
  } catch {
    return '';
  }
}

export function writePref(key: string, value: string): void {
  try {
    sessionStorage.setItem(PREFIX + key, value);
  } catch {
    /* ignore */
  }
}
