import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { readAuth } from '../branch-context';
import { ClinicSettings } from '../clinic-api';

const SETTINGS_KEY = 'clinora.settings';

export function cacheClinicSettings(settings: ClinicSettings): void {
  sessionStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function readClinicSettings(): ClinicSettings | null {
  const raw = sessionStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as ClinicSettings;
  } catch {
    return null;
  }
}

export function stationsForRole(roleId: number | undefined | null): string[] {
  const settings = readClinicSettings();
  const map = settings?.roleStations ?? {};
  const key = String(roleId ?? '');
  return map[key] ?? map['default'] ?? [];
}

export function roleAllowsStation(station: string, roleId?: number | null): boolean {
  const allowed = stationsForRole(roleId);
  if (allowed.some((s) => s.toLowerCase() === 'admin')) {
    return true;
  }
  return allowed.some((s) => s.toLowerCase() === station.toLowerCase());
}

export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  if (!readAuth()?.token) {
    return router.createUrlTree(['/login']);
  }
  return true;
};

export const stationGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  const auth = readAuth();
  if (!auth?.token) {
    return router.createUrlTree(['/login']);
  }

  const station = route.data['station'] as string | undefined;
  if (!station) {
    return true;
  }

  // Deny station routes until RoleStations are cached (login/shell load settings first).
  if (!readClinicSettings()) {
    return router.createUrlTree(['/dashboard']);
  }

  if (roleAllowsStation(station, auth.roleId)) {
    return true;
  }

  return router.createUrlTree(['/dashboard']);
};
