import { Routes } from '@angular/router';

import { FrontDesk } from './front-desk/front-desk';
import { Login } from './login/login';
import { BarcodeStation } from './stations/barcode-station';
import { CollectionStation } from './stations/collection-station';
import { FinalizeStation } from './stations/finalize-station';
import { OutsideLabStation } from './stations/outside-lab-station';
import { RadiologyStation } from './stations/radiology-station';
import { ResultsStation } from './stations/results-station';
import { WorkspaceShell } from './workspace-shell/workspace-shell';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', component: Login },
  {
    path: '',
    component: WorkspaceShell,
    children: [
      { path: 'desk', component: FrontDesk },
      { path: 'collection', component: CollectionStation },
      { path: 'barcode', component: BarcodeStation },
      { path: 'results', component: ResultsStation },
      { path: 'finalize', component: FinalizeStation },
      { path: 'radiology', component: RadiologyStation },
      { path: 'outside-lab', component: OutsideLabStation },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
