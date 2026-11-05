import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Select } from 'primeng/select';

import { cacheClinicSettings } from '../auth/station-guard';
import { BranchContext, readAuth } from '../branch-context';
import { BranchDto, ClinicApi, ClinicSettings } from '../clinic-api';
import { cacheClinicLetterhead } from '../print/print';

type NavItem = { path: string; label: string; station: string };

const ALL_NAV: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', station: 'Admin' },
  { path: '/desk', label: 'Front desk', station: 'FrontDesk' },
  { path: '/collection', label: 'Sample collection', station: 'Phlebotomy' },
  { path: '/barcode', label: 'Barcode', station: 'Phlebotomy' },
  { path: '/results', label: 'Result entry', station: 'Lab' },
  { path: '/finalize', label: 'Finalize', station: 'Doctor' },
  { path: '/reports', label: 'Report collection', station: 'FrontDesk' },
  { path: '/radiology', label: 'Radiology', station: 'Radiology' },
  { path: '/outside-lab', label: 'Outside lab', station: 'Lab' },
  { path: '/masters', label: 'Masters', station: 'Admin' },
];

@Component({
  selector: 'app-workspace-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, Select],
  templateUrl: './workspace-shell.html',
})
export class WorkspaceShell implements OnInit {
  private readonly router = inject(Router);
  private readonly api = inject(ClinicApi);
  private readonly branchCtx = inject(BranchContext);

  protected readonly branches = signal<BranchDto[]>([]);
  protected readonly settings = signal<ClinicSettings | null>(null);
  protected readonly roleId = signal(0);
  protected selectedBranchId: number | null = null;

  protected readonly nav = computed(() => {
    const settings = this.settings();
    const roleId = this.roleId();
    const stations =
      settings?.roleStations?.[String(roleId)] ??
      settings?.roleStations?.['default'] ??
      ALL_NAV.map((n) => n.station);
    const allowed = new Set(stations);
    if (allowed.has('Admin')) {
      return ALL_NAV;
    }
    return ALL_NAV.filter((item) => allowed.has(item.station));
  });

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
