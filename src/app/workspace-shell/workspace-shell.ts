import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Select } from 'primeng/select';

import { API_BASE_URL } from '../app.config';
import { cacheClinicSettings } from '../auth/station-guard';
import { BranchContext, readAuth } from '../branch-context';
import { BranchDto, ClinicApi, ClinicSettings } from '../clinic-api';
import { cacheClinicLetterhead } from '../print/print';

type MenuRight = {
  displayName: string | null;
  url: string | null;
  operationType: string | null;
  priority: number;
};

type MenuSubMenu = {
  subMenu: string | null;
  rights: MenuRight[];
};

type DatabaseMenu = {
  menu: string | null;
  subMenu: MenuSubMenu[];
};

const ROUTE_BY_MENU_URL: Record<string, string> = {
  dashboard: '/dashboard',
  frontdesk: '/desk',
  'front-desk': '/desk',
  desk: '/desk',
  collection: '/collection',
  samplecollection: '/collection',
  barcode: '/barcode',
  receiving: '/receiving',
  labreceiving: '/receiving',
  results: '/results',
  resultentry: '/results',
  finalize: '/finalize',
  reports: '/reports',
  reportcollection: '/reports',
  radiology: '/radiology',
  vaccination: '/vaccination',
  certificate: '/certificate',
  medicalcertificate: '/certificate',
  outsidelab: '/outside-lab',
  masters: '/masters',
  admin: '/masters',
};

const VALID_ROUTES = new Set([
  '/dashboard', '/desk', '/collection', '/barcode', '/receiving', '/results',
  '/finalize', '/reports', '/radiology', '/vaccination', '/certificate',
  '/outside-lab', '/masters',
]);

@Component({
  selector: 'app-workspace-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, Select],
  templateUrl: './workspace-shell.html',
})
export class WorkspaceShell implements OnInit {
  private readonly router = inject(Router);
  private readonly api = inject(ClinicApi);
  private readonly branchCtx = inject(BranchContext);
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  protected readonly branches = signal<BranchDto[]>([]);
  protected readonly settings = signal<ClinicSettings | null>(null);
  protected readonly menus = signal<DatabaseMenu[]>([]);
  protected readonly menuError = signal('');
  protected readonly roleId = signal(0);
  protected selectedBranchId: number | null = null;

  protected readonly hasMenus = computed(() => this.menus().some((menu) =>
    menu.subMenu?.some((subMenu) => subMenu.rights?.length),
  ));

  ngOnInit(): void {
    const auth = readAuth();
    if (!auth?.token) {
      void this.router.navigateByUrl('/login');
      return;
    }
    this.roleId.set(auth.roleId ?? 0);
    this.selectedBranchId = this.branchCtx.branchId() ?? auth.branchId ?? null;
    if (this.selectedBranchId) {
      this.branchCtx.setBranch(this.selectedBranchId);
    }

    this.http
      .get<DatabaseMenu[]>(`${this.apiBaseUrl}/api/ApplicationConfiguration/COMAuthentication/UserMenu_Populate`)
      .subscribe({
        next: (menus) => {
          this.menus.set(menus ?? []);
          this.menuError.set('');
        },
        error: () => this.menuError.set('Could not load menus. Check the API response and your access.'),
      });

    this.api.branches().subscribe({
      next: (list) => {
        this.branches.set(list);
        if (!this.selectedBranchId && list.length > 0) {
          this.selectedBranchId = list[0].id;
          this.branchCtx.setBranch(list[0].id);
        }
      },
    });
    this.api.clinicSettings().subscribe({
      next: (settings) => {
        this.settings.set(settings);
        cacheClinicSettings(settings);
        cacheClinicLetterhead(settings);
      },
    });
  }

  protected routeFor(url: string | null): string | null {
    if (!url?.trim()) return null;
    const trimmed = url.trim();
    const routeCandidate = `/${trimmed.replace(/^\/+|\/+$/g, '').split(/[?#]/)[0]}`.toLowerCase();
    if (VALID_ROUTES.has(routeCandidate)) return routeCandidate;

    const key = trimmed
      .replace(/\\/g, '/')
      .replace(/[?#].*$/, '')
      .split('/')
      .filter(Boolean)
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9-]/g, '');
    return key ? ROUTE_BY_MENU_URL[key] ?? null : null;
  }

  protected onBranchChange(id: number | null): void {
    this.selectedBranchId = id;
    this.branchCtx.setBranch(id);
    // Force active station to reload with the new X-Branch-Id header.
    const url = this.router.url;
    void this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      void this.router.navigateByUrl(url);
    });
  }

  protected signOut(): void {
    sessionStorage.removeItem('clinora.auth');
    sessionStorage.removeItem('clinora.branchId');
    sessionStorage.removeItem('clinora.settings');
    void this.router.navigateByUrl('/login');
  }
}
