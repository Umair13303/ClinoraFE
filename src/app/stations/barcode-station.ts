import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Button } from 'primeng/button';
import { Message } from 'primeng/message';

import { ClinicApi, SampleBarcode } from '../clinic-api';
import { printBarcodeLabel } from '../print/print';

@Component({
  selector: 'app-barcode-station',
  imports: [Button, Message, DatePipe],
  templateUrl: './barcode-station.html',
})
export class BarcodeStation implements OnInit {
  private readonly api = inject(ClinicApi);
  private readonly router = inject(Router);

  protected readonly samples = signal<SampleBarcode[]>([]);
  protected readonly error = signal('');

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
}
