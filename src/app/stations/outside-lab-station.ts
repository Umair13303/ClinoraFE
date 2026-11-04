import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { Textarea } from 'primeng/textarea';

import { ClinicApi, OutsideLab, SendOutSample, Shipment } from '../clinic-api';

@Component({
  selector: 'app-outside-lab-station',
  imports: [FormsModule, Button, Checkbox, InputText, Message, Select, Textarea, DatePipe],
  templateUrl: './outside-lab-station.html',
})
export class OutsideLabStation implements OnInit {
  private readonly api = inject(ClinicApi);
  private readonly router = inject(Router);

  protected readonly pending = signal<SendOutSample[]>([]);
  protected readonly shipments = signal<Shipment[]>([]);
  protected readonly labs = signal<OutsideLab[]>([]);
  protected readonly picked = signal<Record<number, boolean>>({});
  protected readonly receiveDrafts = signal<Record<number, string>>({});
  protected readonly filter = signal('');
  protected readonly error = signal('');
  protected readonly info = signal('');
  protected readonly shipping = signal(false);
  protected readonly receivingId = signal<number | null>(null);
  protected outsideLabId: number | null = null;
  protected awb = '';
  protected notes = '';

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
        s.tests.some((t) => t.toLowerCase().includes(q)),
    );
  });

  protected readonly pickedCount = computed(
    () => this.visiblePending().filter((s) => this.picked()[s.sampleId]).length,
  );

  ngOnInit(): void {
    if (!sessionStorage.getItem('clinora.auth')) {
      void this.router.navigateByUrl('/login');
      return;
    }
    this.api.sampleSetup().subscribe({
      next: (setup) => {
        this.labs.set(setup.outsideLabs);
        this.outsideLabId = setup.outsideLabs[0]?.id ?? null;
      },
    });
    this.reload();
  }

  protected reload(): void {
    this.error.set('');
    this.api.sendOutPending().subscribe({
      next: (pending) => {
        this.pending.set(pending);
        const picked: Record<number, boolean> = {};
        for (const sample of pending) {
          picked[sample.sampleId] = true;
        }
        this.picked.set(picked);
        const preferred = pending.find((s) => s.outsideLabId)?.outsideLabId;
        if (preferred) {
          this.outsideLabId = preferred;
        }
      },
      error: () => this.error.set('Could not load send-out samples.'),
    });
    this.api.shipments().subscribe({
      next: (shipments) => this.shipments.set(shipments),
      error: () => this.error.set('Could not load shipments.'),
    });
  }

  protected toggle(id: number, checked: boolean): void {
    this.picked.update((map) => ({ ...map, [id]: checked }));
  }

  protected setReceiveDraft(id: number, value: string): void {
    this.receiveDrafts.update((map) => ({ ...map, [id]: value }));
  }

  protected ship(): void {
    const sampleIds = this.visiblePending()
      .filter((s) => this.picked()[s.sampleId])
      .map((s) => s.sampleId);
    if (!this.outsideLabId || sampleIds.length === 0) {
      this.error.set('Pick outside lab and at least one sample.');
      return;
    }
    this.shipping.set(true);
    this.error.set('');
    this.api
      .createShipment({
        outsideLabId: this.outsideLabId,
        awb: this.awb || null,
        notes: this.notes || null,
        sampleIds,
      })
      .subscribe({
        next: () => {
          this.shipping.set(false);
          this.info.set(`Shipped ${sampleIds.length} sample(s).`);
          this.awb = '';
          this.notes = '';
          this.reload();
        },
        error: (err) => {
          this.shipping.set(false);
          this.error.set(typeof err.error?.message === 'string' ? err.error.message : 'Ship failed.');
        },
      });
  }

  protected receive(shipment: Shipment): void {
    const items = shipment.items.map((item) => ({
      visitServiceId: item.visitServiceId,
      resultText: (this.receiveDrafts()[item.visitServiceId] || '').trim(),
    }));
    this.receivingId.set(shipment.id);
    this.error.set('');
    this.api.receiveShipment(shipment.id, { notes: null, items }).subscribe({
      next: () => {
        this.receivingId.set(null);
        const withResults = items.filter((i) => i.resultText).length;
        this.info.set(
          withResults
            ? `Received #${shipment.id} · ${withResults} result(s) entered`
            : `Received #${shipment.id} · open Result entry to fill values`,
        );
        this.reload();
      },
      error: (err) => {
        this.receivingId.set(null);
        this.error.set(typeof err.error?.message === 'string' ? err.error.message : 'Receive failed.');
      },
    });
  }
}
