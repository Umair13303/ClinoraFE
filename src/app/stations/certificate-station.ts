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

import { ClinicApi, MedicalCertificateDetail, MedicalCertificateWorkItem } from '../clinic-api';
import {
  emptyPhysicalExam,
  parsePhysicalExam,
  physicalExamValid,
  PhysicalExamWorksheet,
  serializePhysicalExam,
} from '../physical-exam';
import { printMedicalCertificate } from '../print/print';
import { readPref, writePref } from './station-prefs';

@Component({
  selector: 'app-certificate-station',
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
  templateUrl: './certificate-station.html',
})
export class CertificateStation implements OnInit {
  private readonly api = inject(ClinicApi);
  private readonly router = inject(Router);

  protected readonly items = signal<MedicalCertificateWorkItem[]>([]);
  protected readonly selected = signal<MedicalCertificateDetail | null>(null);
  protected readonly exam = signal<PhysicalExamWorksheet>(emptyPhysicalExam());
  protected readonly filter = signal('');
  protected readonly error = signal('');
  protected readonly info = signal('');
  protected readonly busy = signal(false);
  protected doctor = readPref('certDoctor');
  protected destination = '';
  protected remarks = '';
  protected fitness: 'Fit' | 'Unfit' = 'Fit';

  protected readonly fitnessOptions = [
    { label: 'Fit', value: 'Fit' },
    { label: 'Unfit', value: 'Unfit' },
  ];

  protected readonly visible = computed(() => {
    const q = this.filter().trim().toLowerCase();
    if (!q) {
      return this.items();
    }
    return this.items().filter(
      (i) =>
        i.visitNumber.toLowerCase().includes(q) ||
        i.patientName.toLowerCase().includes(q) ||
        (i.passportNo ?? '').toLowerCase().includes(q) ||
        (i.destinationCountry ?? '').toLowerCase().includes(q),
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
    this.api.certificateWorklist().subscribe({
      next: (items) => this.items.set(items),
      error: () => this.error.set('Could not load medical certificate queue.'),
    });
  }

  protected open(item: MedicalCertificateWorkItem): void {
    this.error.set('');
    this.api.certificateDetail(item.visitId).subscribe({
      next: (detail) => {
        this.selected.set(detail);
        this.exam.set(parsePhysicalExam(detail.physicalExamJson));
        this.destination = detail.destinationCountry ?? '';
        this.remarks = detail.remarks ?? '';
        this.fitness = detail.fitness === 'Unfit' ? 'Unfit' : 'Fit';
      },
      error: (err) => {
        this.error.set(
          typeof err.error?.message === 'string' ? err.error.message : 'Could not open certificate.',
        );
      },
    });
  }

  protected closeDetail(): void {
    this.selected.set(null);
  }

  protected patchExam(patch: Partial<PhysicalExamWorksheet>): void {
    this.exam.update((e) => ({ ...e, ...patch }));
  }

  protected onDoctor(value: string): void {
    this.doctor = value;
    writePref('certDoctor', value);
  }

  protected savePhysical(): void {
    const detail = this.selected();
    if (!detail) {
      return;
    }
    writePref('certDoctor', this.doctor);
    if (this.doctor.trim().length < 2) {
      this.error.set('Enter examiner / doctor name.');
      return;
    }
    const data = this.exam();
    if (!physicalExamValid(data)) {
      this.error.set('Enter height, weight, BP, or systemic notes.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.api
      .savePhysicalExam({
        visitId: detail.visitId,
        examJson: serializePhysicalExam(data),
        examinedByName: this.doctor.trim(),
      })
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          this.selected.set(res);
          this.exam.set(parsePhysicalExam(res.physicalExamJson));
          this.info.set('Physical examination saved.');
          this.reload();
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(
            typeof err.error?.message === 'string' ? err.error.message : 'Save physical failed.',
          );
        },
      });
  }

  protected issue(): void {
    const detail = this.selected();
    if (!detail) {
      return;
    }
    writePref('certDoctor', this.doctor);
    if (this.doctor.trim().length < 2) {
      this.error.set('Enter issuing doctor name.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.api
      .issueMedicalCertificate({
        visitId: detail.visitId,
        fitness: this.fitness,
        destinationCountry: this.destination.trim() || null,
        remarks: this.remarks.trim() || null,
        issuedByName: this.doctor.trim(),
      })
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          this.selected.set(res);
          this.info.set(`Certificate issued: ${res.fitness}`);
          this.reload();
          printMedicalCertificate(res);
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(
            typeof err.error?.message === 'string' ? err.error.message : 'Issue failed.',
          );
        },
      });
  }

  protected print(): void {
    const detail = this.selected();
    if (!detail) {
      return;
    }
    if (!printMedicalCertificate(detail)) {
      this.error.set('Allow pop-ups to print the certificate.');
    }
  }

  protected fitnessSeverity(fitness: string): 'success' | 'danger' | 'warn' | 'secondary' {
    switch (fitness) {
      case 'Fit':
        return 'success';
      case 'Unfit':
        return 'danger';
      case 'Pending':
        return 'warn';
      default:
        return 'secondary';
    }
  }
}
