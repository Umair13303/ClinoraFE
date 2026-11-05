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
import { Select } from 'primeng/select';
import { Tag } from 'primeng/tag';
import { Textarea } from 'primeng/textarea';

import { ClinicApi, VaccinationWorkItem } from '../clinic-api';
import { printVaccinationCard } from '../print/print';
import { readPref, writePref } from './station-prefs';

type Draft = {
  batchNo: string;
  lotNo: string;
  expiryDate: string;
  doseNumber: string;
  site: string;
  route: string;
  nextDueAt: string;
  notes: string;
};

@Component({
  selector: 'app-vaccination-station',
  imports: [
    FormsModule,
    Button,
    Card,
    IconField,
    InputIcon,
    InputText,
    Message,
    Select,
    Tag,
    Textarea,
    DatePipe,
  ],
  templateUrl: './vaccination-station.html',
})
export class VaccinationStation implements OnInit {
  private readonly api = inject(ClinicApi);
  private readonly router = inject(Router);

  protected readonly items = signal<VaccinationWorkItem[]>([]);
  protected readonly drafts = signal<Record<number, Draft>>({});
  protected readonly filter = signal('');
  protected readonly error = signal('');
  protected readonly info = signal('');
  protected readonly savingId = signal<number | null>(null);
  protected administeredBy = readPref('vaccineBy');

  protected readonly siteOptions = [
    { label: 'Left deltoid', value: 'Left deltoid' },
    { label: 'Right deltoid', value: 'Right deltoid' },
    { label: 'Left thigh', value: 'Left thigh' },
    { label: 'Right thigh', value: 'Right thigh' },
    { label: 'Oral', value: 'Oral' },
    { label: 'Other', value: 'Other' },
  ];

  protected readonly routeOptions = [
    { label: 'IM', value: 'IM' },
    { label: 'SC', value: 'SC' },
    { label: 'ID', value: 'ID' },
    { label: 'Oral', value: 'Oral' },
    { label: 'Nasal', value: 'Nasal' },
  ];

  protected readonly pending = computed(() =>
    this.visible().filter((i) => i.status === 'AwaitingAdministration'),
  );
  protected readonly doneToday = computed(() =>
    this.visible().filter((i) => i.status === 'Administered'),
  );

  protected readonly visible = computed(() => {
    const q = this.filter().trim().toLowerCase();
    if (!q) {
      return this.items();
    }
    return this.items().filter(
      (item) =>
        item.visitNumber.toLowerCase().includes(q) ||
        item.patientName.toLowerCase().includes(q) ||
        item.serviceName.toLowerCase().includes(q) ||
        item.phone.toLowerCase().includes(q),
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
    this.api.vaccinationWorklist().subscribe({
      next: (items) => {
        this.items.set(items);
        const drafts: Record<number, Draft> = { ...this.drafts() };
        for (const item of items) {
          if (!drafts[item.visitServiceId]) {
            drafts[item.visitServiceId] = this.draftFrom(item);
          }
        }
        this.drafts.set(drafts);
      },
      error: () => this.error.set('Could not load vaccination queue.'),
    });
  }

  protected draft(id: number): Draft {
    return this.drafts()[id] ?? emptyDraft();
  }

  protected patch(id: number, patch: Partial<Draft>): void {
    this.drafts.update((map) => ({ ...map, [id]: { ...this.draft(id), ...patch } }));
  }

  protected onBy(value: string): void {
    this.administeredBy = value;
    writePref('vaccineBy', value);
  }

  protected save(item: VaccinationWorkItem): void {
    writePref('vaccineBy', this.administeredBy);
    if (this.administeredBy.trim().length < 2) {
      this.error.set('Enter who administered the vaccine.');
      return;
    }
    const d = this.draft(item.visitServiceId);
    this.savingId.set(item.visitServiceId);
    this.error.set('');
    this.api
      .administerVaccination({
        visitServiceId: item.visitServiceId,
        batchNo: d.batchNo.trim() || null,
        lotNo: d.lotNo.trim() || null,
        expiryDate: d.expiryDate || null,
        doseNumber: d.doseNumber.trim() || null,
        site: d.site || null,
        route: d.route || null,
        administeredByName: this.administeredBy.trim(),
        nextDueAt: d.nextDueAt || null,
        notes: d.notes.trim() || null,
      })
      .subscribe({
        next: (res) => {
          this.savingId.set(null);
          this.info.set(`Administered ${res.serviceName} · ${res.visitNumber}`);
          this.reload();
        },
        error: (err) => {
          this.savingId.set(null);
          this.error.set(
            typeof err.error?.message === 'string' ? err.error.message : 'Administer failed.',
          );
        },
      });
  }

  protected printCard(item: VaccinationWorkItem): void {
    this.error.set('');
    this.api.vaccinationCard(item.visitServiceId).subscribe({
      next: (card) => {
        if (!printVaccinationCard(card)) {
          this.error.set('Allow pop-ups to print the vaccination card.');
        }
      },
      error: (err) => {
        this.error.set(
          typeof err.error?.message === 'string' ? err.error.message : 'Could not load card.',
        );
      },
    });
  }

  private draftFrom(item: VaccinationWorkItem): Draft {
    const r = item.record;
    return {
      batchNo: r?.batchNo ?? '',
      lotNo: r?.lotNo ?? '',
      expiryDate: toDateInput(r?.expiryDate),
      doseNumber: r?.doseNumber ?? '',
      site: r?.site ?? '',
      route: r?.route ?? 'IM',
      nextDueAt: toDateInput(r?.nextDueAt),
      notes: r?.notes ?? '',
    };
  }
}

function emptyDraft(): Draft {
  return {
    batchNo: '',
    lotNo: '',
    expiryDate: '',
    doseNumber: '',
    site: '',
    route: 'IM',
    nextDueAt: '',
    notes: '',
  };
}

function toDateInput(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return value.slice(0, 10);
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
