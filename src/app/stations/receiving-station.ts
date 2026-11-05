import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Tag } from 'primeng/tag';

import { ClinicApi, ReceivingSample, SampleBarcode } from '../clinic-api';
import { readPref, writePref } from './station-prefs';

@Component({
  selector: 'app-receiving-station',
  imports: [
    FormsModule,
    Button,
    Card,
    IconField,
    InputIcon,
    InputText,
    Message,
    Tag,
    DatePipe,
  ],
  templateUrl: './receiving-station.html',
})
export class ReceivingStation implements OnInit {
  private readonly api = inject(ClinicApi);
  private readonly router = inject(Router);

  protected readonly pending = signal<ReceivingSample[]>([]);
  protected readonly error = signal('');
  protected readonly info = signal('');
  protected readonly filter = signal('');
  protected readonly busy = signal(false);
  protected readonly lastReceived = signal<SampleBarcode | null>(null);
  protected barcode = '';
  protected receivedBy = readPref('labReceiver');

  protected readonly visiblePending = computed(() => {
    const q = this.filter().trim().toLowerCase();
    if (!q) {
      return this.pending();
    }
    return this.pending().filter(
      (s) =>
        s.barcode.toLowerCase().includes(q) ||
        s.visitNumber.toLowerCase().includes(q) ||
        s.patientName.toLowerCase().includes(q) ||
        s.tests.some((t) => t.toLowerCase().includes(q)) ||
        (s.sampleGroupName ?? '').toLowerCase().includes(q),
    );
  });

  ngOnInit(): void {
    if (!sessionStorage.getItem('clinora.auth')) {
      void this.router.navigateByUrl('/login');
      return;
    }
    this.reload();
  }

  protected onReceiver(value: string): void {
    this.receivedBy = value;
    writePref('labReceiver', value);
  }

  protected reload(): void {
    this.error.set('');
    this.api.receivingWorklist().subscribe({
      next: (rows) => this.pending.set(rows),
      error: () => this.error.set('Could not load receiving queue.'),
    });
  }

  protected scanReceive(): void {
    const code = this.barcode.trim();
    if (!code) {
      this.error.set('Scan or enter a barcode.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.info.set('');
    writePref('labReceiver', this.receivedBy);
    this.api
      .receiveSampleByBarcode({
        barcode: code,
        receivedBy: this.receivedBy.trim() || null,
      })
      .subscribe({
        next: (sample) => {
          this.busy.set(false);
          this.barcode = '';
          this.lastReceived.set(sample);
          this.info.set(
            `Received ${sample.barcode} · ${sample.patientName} · now In lab`,
          );
          this.reload();
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(
            typeof err.error?.message === 'string' ? err.error.message : 'Receive failed.',
          );
        },
      });
  }

  protected receiveRow(sample: ReceivingSample): void {
    this.busy.set(true);
    this.error.set('');
    this.info.set('');
    writePref('labReceiver', this.receivedBy);
    this.api
      .receiveSample(sample.sampleId, { receivedBy: this.receivedBy.trim() || null })
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.lastReceived.set(updated);
          this.info.set(`Received ${updated.barcode} · now In lab`);
          this.reload();
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(
            typeof err.error?.message === 'string' ? err.error.message : 'Receive failed.',
          );
        },
      });
  }
}
