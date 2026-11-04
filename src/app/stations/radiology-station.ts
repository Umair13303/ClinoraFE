import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Textarea } from 'primeng/textarea';

import { ClinicApi, RadiologyWorkItem } from '../clinic-api';
import { readPref, writePref } from './station-prefs';

@Component({
  selector: 'app-radiology-station',
  imports: [FormsModule, Button, InputText, Message, Textarea],
  templateUrl: './radiology-station.html',
})
export class RadiologyStation implements OnInit {
  private readonly api = inject(ClinicApi);
  private readonly router = inject(Router);

  protected readonly items = signal<RadiologyWorkItem[]>([]);
  protected readonly findings = signal<Record<number, string>>({});
  protected readonly filter = signal('');
  protected readonly error = signal('');
  protected readonly info = signal('');
  protected readonly busyId = signal<number | null>(null);
  protected performedBy = readPref('radiologist');

  protected readonly visible = computed(() => {
    const q = this.filter().trim().toLowerCase();
    if (!q) {
      return this.items();
    }
    return this.items().filter(
      (item) =>
        item.visitNumber.toLowerCase().includes(q) ||
        item.patientName.toLowerCase().includes(q) ||
        item.serviceName.toLowerCase().includes(q),
    );
  });

  ngOnInit(): void {
    if (!sessionStorage.getItem('clinora.auth')) {
      void this.router.navigateByUrl('/login');
      return;
    }
    this.reload();
  }

  protected reload(): void {
    this.error.set('');
    this.api.radiologyWorklist().subscribe({
      next: (items) => this.items.set(items),
      error: () => this.error.set('Could not load radiology worklist.'),
    });
  }

  protected onPerformedBy(value: string): void {
    this.performedBy = value;
    writePref('radiologist', value);
  }

  protected setFindings(id: number, value: string): void {
    this.findings.update((map) => ({ ...map, [id]: value }));
  }

  protected complete(item: RadiologyWorkItem): void {
    if (item.status !== 'AwaitingImaging') {
      this.error.set('Already imaged — open Finalize to sign and print.');
      return;
    }
    this.busyId.set(item.visitServiceId);
    this.error.set('');
    writePref('radiologist', this.performedBy);
    this.api
      .radiologyComplete({
        visitServiceId: item.visitServiceId,
        findings: this.findings()[item.visitServiceId] || 'Imaging completed.',
        performedByName: this.performedBy || null,
      })
      .subscribe({
        next: () => {
          this.busyId.set(null);
          this.info.set(`Imaged ${item.serviceName} · go to Finalize`);
          this.reload();
        },
        error: (err) => {
          this.busyId.set(null);
          this.error.set(typeof err.error?.message === 'string' ? err.error.message : 'Update failed.');
        },
      });
  }
}
