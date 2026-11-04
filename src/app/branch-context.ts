import { Injectable, signal } from '@angular/core';

const BRANCH_KEY = 'clinora.branchId';

@Injectable({ providedIn: 'root' })
export class BranchContext {
  readonly branchId = signal<number | null>(readStoredBranch());

  setBranch(id: number | null): void {
    this.branchId.set(id);
    if (id == null) {
      sessionStorage.removeItem(BRANCH_KEY);
    } else {
      sessionStorage.setItem(BRANCH_KEY, String(id));
    }
  }
}

function readStoredBranch(): number | null {
  const raw = sessionStorage.getItem(BRANCH_KEY);
  if (!raw) {
    return null;
  }
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export type AuthSession = {
  token: string;
  name?: string | null;
  email?: string | null;
  roleId?: number;
  branchId?: number | null;
  userTypeId?: number;
};

export function readAuth(): AuthSession | null {
  const raw = sessionStorage.getItem('clinora.auth');
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}
