import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Select } from 'primeng/select';

import { cacheClinicSettings } from '../auth/station-guard';
import { BranchContext, readAuth } from '../branch-context';
import { BranchDto, ClinicApi, ClinicSettings } from '../clinic-api';
import { cacheClinicLetterhead } from '../print/print';

type NavItem = { path: string; label: string; station: string | null; icon: string };
type NavSection = { label: string; items: NavItem[] };

const ALL_NAV: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', station: null, icon: 'pi pi-th-large' },
  { path: '/desk', label: 'Front desk', station: 'FrontDesk', icon: 'pi pi-users' },
  { path: '/reports', label: 'Reports', station: 'FrontDesk', icon: 'pi pi-file' },
  { path: '/collection', label: 'Sample collection', station: 'Phlebotomy', icon: 'pi pi-box' },
  { path: '/barcode', label: 'Barcode', station: 'Phlebotomy', icon: 'pi pi-qrcode' },
  { path: '/receiving', label: 'Lab receiving', station: 'Lab', icon: 'pi pi-inbox' },
  { path: '/results', label: 'Result entry', station: 'Lab', icon: 'pi pi-list-check' },
  { path: '/finalize', label: 'Finalize reports', station: 'Doctor', icon: 'pi pi-check-square' },
  { path: '/outside-lab', label: 'Outside lab', station: 'Lab', icon: 'pi pi-send' },
  { path: '/radiology', label: 'Radiology', station: 'Radiology', icon: 'pi pi-images' },
  { path: '/vaccination', label: 'Vaccination', station: 'Vaccination', icon: 'pi pi-heart' },
  { path: '/certificate', label: 'Medical certificates', station: 'MedicalCertificate', icon: 'pi pi-verified' },
  { path: '/masters', label: 'Masters & setup', station: 'Admin', icon: 'pi pi-sliders-h' },
];

const NAV_SECTIONS: Array<{ label: string; paths: string[] }> = [
  { label: 'Overview', paths: ['/dashboard'] },
  { label: 'Front office', paths: ['/desk', '/reports'] },
  { label: 'Laboratory', paths: ['/collection', '/barcode', '/receiving', '/results', '/finalize', '/outside-lab'] },
  { label: 'Clinical services', paths: ['/radiology', '/vaccination', '/certificate'] },
  { label: 'Administration', paths: ['/masters'] },
];

@Component({
  selector: 'app-workspace-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, Select],
  templateUrl: './workspace-shell.html',
  styleUrl: './workspace-shell.css',
})
export class WorkspaceShell implements OnInit {
  private readonly router = inject(Router);
  private readonly api = inject(ClinicApi);
  private readonly branchCtx = inject(BranchContext);

  protected readonly branches = signal<BranchDto[]>([]);
  protected readonly settings = signal<ClinicSettings | null>(null);
  protected readonly roleId = signal(0);
  protected readonly currentUser = readAuth();
  protected selectedBranchId: number | null = null;

  protected readonly nav = computed(() => {
    const settings = this.settings();
    const roleId = this.roleId();
    const stations =
      settings?.roleStations?.[String(roleId)] ??
      settings?.roleStations?.['default'] ??
      ALL_NAV.map((item) => item.station).filter((station): station is string => !!station);
    const allowed = new Set(stations.map((station) => station.toLowerCase()));
    if (allowed.has('admin')) {
      return ALL_NAV;
    }
    return ALL_NAV.filter((item) => item.station === null || allowed.has(item.station.toLowerCase()));
  });

  protected readonly navSections = computed<NavSection[]>(() => {
    const visible = new Map(this.nav().map((item) => [item.path, item]));
    return NAV_SECTIONS
      .map((section) => ({
        label: section.label,
        items: section.paths.map((path) => visible.get(path)).filter((item): item is NavItem => !!item),
      }))
      .filter((section) => section.items.length > 0);
  });

  protected readonly userInitials = computed(() => {
    const value = this.currentUser?.name?.trim() || this.currentUser?.email?.trim() || 'User';
    return value.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('');
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
