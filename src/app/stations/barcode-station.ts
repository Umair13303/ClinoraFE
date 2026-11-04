import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Checkbox } from 'primeng/checkbox';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Tag } from 'primeng/tag';

import { ClinicApi, SampleBarcode } from '../clinic-api';
import { printBarcodeLabel } from '../print/print';
import { readPref, writePref } from './station-prefs';

@Component({
  selector: 'app-barcode-station',
  imports: [
    FormsModule,
    Button,
    Card,
    Checkbox,
    IconField,
    InputIcon,
    InputText,
    Message,
    Tag,
    DatePipe,
  ],
  templateUrl: './barcode-station.html',
})
export class BarcodeStation implements OnInit {
  private readonly api = inject(ClinicApi);
  private readonly router = inject(Router);

  protected readonly samples = signal<SampleBarcode[]>([]);
  protected readonly error = signal('');
  protected readonly info = signal('');
  protected readonly rejectingId = signal<number | null>(null);
  protected rejectReason = '';
  protected redraw = true;
  protected rejectedBy = readPref('phlebotomist');

  ngOnInit(): void {
    if (!sessionStorage.getItem('clinora.auth')) {
      void this.router.navigateByUrl('/login');
      return;
    }
    this.reload();
  }

  protected reload(): void {
    this.api.recentSamples().subscribe({
      next: (samples) => this.samples.set(samples),
      error: () => this.error.set('Could not load samples.'),
    });
  }

  protected print(sample: SampleBarcode): void {
    printBarcodeLabel(sample);
  }

  protected reject(sample: SampleBarcode): void {
    if (!this.rejectReason.trim()) {
      this.error.set('Enter a reject reason.');
      return;
    }
    this.rejectingId.set(sample.sampleId);
    this.error.set('');
    writePref('phlebotomist', this.rejectedBy);
    this.api
      .rejectSample(sample.sampleId, {
        reason: this.rejectReason.trim(),
        rejectedByName: this.rejectedBy || null,
        redraw: this.redraw,
      })
      .subscribe({
        next: (res) => {
          this.rejectingId.set(null);
          this.info.set(res.message);
          this.rejectReason = '';
          this.reload();
        },
        error: (err) => {
          this.rejectingId.set(null);
          this.error.set(typeof err.error?.message === 'string' ? err.error.message : 'Reject failed.');
        },
      });
  }
}
