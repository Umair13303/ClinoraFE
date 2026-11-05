import { Routes } from '@angular/router';

import { authGuard, stationGuard } from './auth/station-guard';
import { Dashboard } from './dashboard/dashboard';
import { FrontDesk } from './front-desk/front-desk';
import { Login } from './login/login';
import { Masters } from './masters/masters';
import { BarcodeStation } from './stations/barcode-station';
import { CollectionStation } from './stations/collection-station';
import { FinalizeStation } from './stations/finalize-station';
import { OutsideLabStation } from './stations/outside-lab-station';
import { RadiologyStation } from './stations/radiology-station';
import { ReportCollectionStation } from './stations/report-collection-station';
import { ResultsStation } from './stations/results-station';
import { WorkspaceShell } from './workspace-shell/workspace-shell';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', component: Login },
  {
    path: '',
    component: WorkspaceShell,
    canActivate: [authGuard],
    canActivateChild: [stationGuard],
    children: [
      { path: 'dashboard', component: Dashboard },
      { path: 'desk', component: FrontDesk, data: { station: 'FrontDesk' } },
      { path: 'collection', component: CollectionStation, data: { station: 'Phlebotomy' } },
      { path: 'barcode', component: BarcodeStation, data: { station: 'Phlebotomy' } },
      { path: 'results', component: ResultsStation, data: { station: 'Lab' } },
      { path: 'finalize', component: FinalizeStation, data: { station: 'Doctor' } },
      { path: 'reports', component: ReportCollectionStation, data: { station: 'FrontDesk' } },
      { path: 'radiology', component: RadiologyStation, data: { station: 'Radiology' } },
      { path: 'outside-lab', component: OutsideLabStation, data: { station: 'Lab' } },
      { path: 'masters', component: Masters, data: { station: 'Admin' } },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
