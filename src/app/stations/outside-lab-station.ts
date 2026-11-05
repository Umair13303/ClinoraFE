import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Checkbox } from 'primeng/checkbox';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { Tag } from 'primeng/tag';
import { Textarea } from 'primeng/textarea';

import { ClinicApi, OutsideLab, SendOutSample, Shipment } from '../clinic-api';

@Component({
  selector: 'app-outside-lab-station',
  imports: [
    FormsModule,
    Button,
    Card,
    Checkbox,
    IconField,
    InputIcon,
    InputText,
    Message,
    Select,
    Tag,
    Textarea,
    DatePipe,
  ],
  templateUrl: './outside-lab-station.html',
})
export class OutsideLabStation implements OnInit {
  private readonly api = inject(ClinicApi);
  private readonly router = inject(Router);

  protected readonly pending = signal<SendOutSample[]>([]);
  protected readonly shipments = signal<Shipment[]>([]);
  protected readonly labs = signal<OutsideLab[]>([]);
  protected readonly picked = signal<Record<number, boolean>>({});
  protected readonly receiveDrafts = signal<
    Record<number, { resultText: string; units: string; referenceRange: string; parameterName: string }>
  >({});
  protected readonly filter = signal('');
  protected readonly error = signal('');
  protected readonly info = signal('');
  protected readonly shipping = signal(false);
  protected readonly receivingId = signal<number | null>(null);
  protected outsideLabId: number | null = null;
  protected awb = '';
  protected notes = '';
  protected expectedAt = '';

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

  protected receiveDraft(id: number): {
    resultText: string;
    units: string;
    referenceRange: string;
    parameterName: string;
  } {
    return (
      this.receiveDrafts()[id] ?? {
        resultText: '',
        units: '',
        referenceRange: '',
        parameterName: '',
      }
    );
  }

  protected patchReceiveDraft(
    id: number,
    patch: Partial<{ resultText: string; units: string; referenceRange: string; parameterName: string }>,
  ): void {
    this.receiveDrafts.update((map) => ({
      ...map,
      [id]: { ...this.receiveDraft(id), ...patch },
    }));
  }

  protected ship(): void {
    const selected = this.visiblePending().filter((s) => this.picked()[s.sampleId]);
    if (!this.outsideLabId || selected.length === 0) {
      this.error.set('Pick outside lab and at least one sample.');
      return;
    }
    const mismatched = selected.filter(
      (s) => s.outsideLabId != null && s.outsideLabId !== this.outsideLabId,
    );
    if (mismatched.length > 0) {
      this.error.set(
        `Uncheck samples meant for another lab (${mismatched.map((s) => s.barcode).join(', ')}).`,
      );
      return;
    }
    const sampleIds = selected.map((s) => s.sampleId);
    this.shipping.set(true);
    this.error.set('');
    this.api
      .createShipment({
        outsideLabId: this.outsideLabId,
        awb: this.awb || null,
        notes: this.notes || null,
        expectedAt: this.expectedAt ? new Date(this.expectedAt).toISOString() : null,
        sampleIds,
      })
      .subscribe({
        next: () => {
          this.shipping.set(false);
          this.info.set(`Shipped ${sampleIds.length} sample(s).`);
          this.awb = '';
          this.notes = '';
          this.expectedAt = '';
          this.reload();
        },
        error: (err) => {
          this.shipping.set(false);
          this.error.set(typeof err.error?.message === 'string' ? err.error.message : 'Ship failed.');
        },
      });
  }

  protected receive(shipment: Shipment): void {
    const items = shipment.items
      .map((item) => {
        const d = this.receiveDraft(item.visitServiceId);
        return {
          visitServiceId: item.visitServiceId,
          resultText: d.resultText.trim(),
          units: d.units.trim() || null,
          referenceRange: d.referenceRange.trim() || null,
          parameterName: d.parameterName.trim() || null,
        };
      })
      .filter((i) => i.resultText);
    if (items.length === 0) {
      this.error.set('Enter at least one outside result before marking received.');
      return;
    }
    this.receivingId.set(shipment.id);
    this.error.set('');
    this.api.receiveShipment(shipment.id, { notes: null, items }).subscribe({
      next: (updated) => {
        this.receivingId.set(null);
        this.info.set(
          updated.status === 'Received'
            ? `Received #${shipment.id} · all results entered`
            : `Partial receive #${shipment.id} · ${items.length} result(s) saved`,
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
