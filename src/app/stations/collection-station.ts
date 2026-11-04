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

import { ClinicApi, CollectionGroup, OutsideLab, SampleBarcode, SampleSetup } from '../clinic-api';
import { printBarcodeLabel } from '../print/print';
import { readPref, writePref } from './station-prefs';

@Component({
  selector: 'app-collection-station',
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
  ],
  templateUrl: './collection-station.html',
})
export class CollectionStation implements OnInit {
  private readonly api = inject(ClinicApi);
  private readonly router = inject(Router);

  protected readonly groups = signal<CollectionGroup[]>([]);
  protected readonly setup = signal<SampleSetup | null>(null);
  protected readonly error = signal('');
  protected readonly info = signal('');
  protected readonly filter = signal('');
  protected phlebotomist = readPref('phlebotomist');
  protected readonly selected = signal<Record<number, boolean>>({});
  protected readonly sendOut = signal<Record<string, boolean>>({});
  protected readonly outsideLabId = signal<Record<string, number | null>>({});
  protected readonly busyKey = signal<string | null>(null);
  protected readonly lastBarcode = signal<SampleBarcode | null>(null);

  protected readonly visibleGroups = computed(() => {
    const q = this.filter().trim().toLowerCase();
    if (!q) {
      return this.groups();
    }
    return this.groups().filter(
      (g) =>
        g.visitNumber.toLowerCase().includes(q) ||
        g.patientName.toLowerCase().includes(q) ||
        g.groupLabel.toLowerCase().includes(q) ||
        g.lines.some((l) => l.serviceName.toLowerCase().includes(q) || l.phone.includes(q)),
    );
  });

  ngOnInit(): void {
    if (!sessionStorage.getItem('clinora.auth')) {
      void this.router.navigateByUrl('/login');
      return;
    }
    this.api.sampleSetup().subscribe({
      next: (setup) => this.setup.set(setup),
      error: () => this.error.set('Could not load sample setup.'),
    });
    this.reload();
  }

  protected reload(): void {
    this.error.set('');
    this.api.collectionWorklist().subscribe({
      next: (groups) => {
        this.groups.set(groups);
        const selected: Record<number, boolean> = {};
        const labs: Record<string, number | null> = {};
        for (const group of groups) {
          for (const line of group.lines) {
            selected[line.visitServiceId] = true;
          }
          labs[group.groupKey] =
            group.lines.find((l) => l.defaultOutsideLabId)?.defaultOutsideLabId ??
            this.setup()?.outsideLabs[0]?.id ??
            null;
        }
        this.selected.set(selected);
        this.outsideLabId.set(labs);
      },
      error: () => this.error.set('Could not load collection worklist.'),
    });
  }

  protected outsideLabs(): OutsideLab[] {
    return this.setup()?.outsideLabs ?? [];
  }

  protected onPhlebotomist(value: string): void {
    this.phlebotomist = value;
    writePref('phlebotomist', value);
  }

  protected selectedCount(group: CollectionGroup): number {
    return group.lines.filter((line) => this.selected()[line.visitServiceId] !== false).length;
  }

  protected collect(group: CollectionGroup): void {
    const ids = group.lines
      .filter((line) => this.selected()[line.visitServiceId] !== false)
      .map((line) => line.visitServiceId);

    if (ids.length === 0) {
      this.error.set('Select at least one test in this tube group.');
      return;
    }

    const first = group.lines.find((line) => ids.includes(line.visitServiceId)) ?? group.lines[0];
    if (!first?.sampleTypeId || !first.containerId || !first.bottleColorId) {
      this.error.set('Service is missing sample type / container / color. Check service setup.');
      return;
    }

    const isSendOut = Boolean(this.sendOut()[group.groupKey]);
    const labId = this.outsideLabId()[group.groupKey] ?? first.defaultOutsideLabId ?? null;
    if (isSendOut && !labId) {
      this.error.set('Choose an outside lab before collecting send-out samples.');
      return;
    }

    this.busyKey.set(group.groupKey);
    this.error.set('');
    this.info.set('');
    writePref('phlebotomist', this.phlebotomist);

    this.api
      .collectSample({
        visitId: group.visitId,
        visitServiceIds: ids,
        sampleTypeId: first.sampleTypeId,
        containerId: first.containerId,
        bottleColorId: first.bottleColorId,
        sampleGroupId: group.sampleGroupId,
        phlebotomistName: this.phlebotomist || null,
        isSendOut,
        outsideLabId: isSendOut ? labId : null,
      })
      .subscribe({
        next: (barcode) => {
          this.busyKey.set(null);
          this.lastBarcode.set(barcode);
          const printed = printBarcodeLabel(barcode);
          this.info.set(
            printed
              ? `Collected ${barcode.barcode} · print dialog opened`
              : `Collected ${barcode.barcode} · use Reprint barcode if dialog was blocked`,
          );
          this.reload();
        },
        error: (err) => {
          this.busyKey.set(null);
          this.error.set(typeof err.error?.message === 'string' ? err.error.message : 'Collect failed.');
        },
      });
  }

  protected toggleLine(id: number, checked: boolean): void {
    this.selected.update((map) => ({ ...map, [id]: checked }));
  }

  protected toggleSendOut(key: string, checked: boolean): void {
    this.sendOut.update((map) => ({ ...map, [key]: checked }));
  }

  protected setLab(key: string, id: number | null): void {
    this.outsideLabId.update((map) => ({ ...map, [key]: id }));
  }

  protected reprintLast(): void {
    const sample = this.lastBarcode();
    if (!sample) {
      this.error.set('No barcode to reprint yet.');
      return;
    }
    printBarcodeLabel(sample);
  }
}
