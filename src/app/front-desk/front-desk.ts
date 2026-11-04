import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';

import {
  ClinicApi,
  ClinicService,
  CreateVisitRequest,
  PatientSummary,
  StaffMember,
  VisitReceipt,
  VisitSummary,
} from '../clinic-api';
import { printVisitSlips } from '../print/print';

type ServiceLine = {
  id: number;
  discount: number;
  urgent: boolean;
  staffName: string;
  readyBy: string;
};

@Component({
  selector: 'app-front-desk',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    CurrencyPipe,
    DatePipe,
    Button,
    Checkbox,
    Dialog,
    InputNumber,
    InputText,
    Message,
    Select,
    SelectButton,
    TableModule,
  ],
  templateUrl: './front-desk.html',
  styleUrl: './front-desk.css',
})
export class FrontDesk implements OnInit {
  private readonly api = inject(ClinicApi);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly serviceInput = viewChild<ElementRef<HTMLInputElement>>('serviceInput');

  protected readonly serviceQuery = signal('');
  protected readonly patientQuery = signal('');
  protected readonly catalog = signal<ClinicService[]>([]);
  protected readonly staffList = signal<StaffMember[]>([]);
  protected readonly matches = signal<ClinicService[]>([]);
  protected readonly lines = signal<ServiceLine[]>([]);
  protected readonly selectedPatient = signal<PatientSummary | null>(null);
  protected readonly phoneHits = signal<PatientSummary[]>([]);
  protected readonly patientHits = signal<PatientSummary[]>([]);
  protected readonly today = signal<VisitSummary[]>([]);
  protected readonly showFind = signal(false);
  protected readonly showToday = signal(false);
  protected readonly isPanel = signal(false);
  protected readonly isReferred = signal(false);
  protected readonly paymentReceived = signal(false);
  protected readonly amountReceived = signal(0);
  protected readonly percentDiscount = signal(0);
  protected readonly fixedDiscount = signal(0);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal('');
  protected readonly receipt = signal<VisitReceipt | null>(null);
  protected readonly loadError = signal('');
  protected readonly staffFocusId = signal<number | null>(null);
  protected readonly photoPreview = signal<string | null>(null);
  protected readonly photoBase64 = signal<string | null>(null);
  protected readonly patientDetailsOpen = signal(false);

  protected visitType: 'regular' | 'panel' = 'regular';
  protected referralMode: 'walkin' | 'referred' = 'walkin';

  protected readonly genderOptions = [
    { label: 'Female', value: 'Female' },
    { label: 'Male', value: 'Male' },
    { label: 'Other', value: 'Other' },
  ];
  protected readonly visitTypeOptions = [
    { label: 'Regular', value: 'regular' },
    { label: 'Panel', value: 'panel' },
  ];
  protected readonly referralOptions = [
    { label: 'Walk-in', value: 'walkin' },
    { label: 'Referred', value: 'referred' },
  ];

  protected readonly form = this.formBuilder.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    phone: ['', [Validators.required, Validators.minLength(7)]],
    age: ['', [Validators.required]],
    gender: ['', Validators.required],
    cnic: [''],
    passportNo: [''],
    panelName: [''],
    referredBy: [''],
    slipNo: [''],
    notes: [''],
    percentOff: [0],
    visitOff: [0],
    amountReceived: [0],
  });

  protected readonly billLines = computed(() => {
    const catalog = this.catalog();
    return this.lines().map((line) => {
      const service = catalog.find((item) => item.id === line.id);
      const fee = service?.fee ?? 0;
      const discount = Math.min(Math.max(line.discount, 0), fee);
      const category = service?.category ?? '';
      return {
        ...line,
        name: service?.name ?? 'Service',
        category,
        allowsStaff: category.toLowerCase() === 'consultation',
        normalMinutes: service?.normalMinutes ?? 60,
        urgentMinutes: service?.urgentMinutes ?? 30,
        fee,
        discount,
        net: fee - discount,
      };
    });
  });

  protected readonly fees = computed(() => this.billLines().reduce((sum, line) => sum + line.fee, 0));
  protected readonly lineDiscounts = computed(() => this.billLines().reduce((sum, line) => sum + line.discount, 0));
  protected readonly afterLines = computed(() => this.fees() - this.lineDiscounts());
  protected readonly visitDiscount = computed(() => {
    const after = this.afterLines();
    const percent = Math.min(Math.max(this.percentDiscount(), 0), 100);
    const fixed = Math.max(this.fixedDiscount(), 0);
    return Math.min(after, Math.round((after * percent) / 100) + fixed);
  });
  protected readonly totalDiscount = computed(() => this.lineDiscounts() + this.visitDiscount());
  protected readonly net = computed(() => this.afterLines() - this.visitDiscount());
  protected readonly shortfall = computed(() => Math.max(this.net() - this.amountReceived(), 0));

  ngOnInit(): void {
    if (!sessionStorage.getItem('clinora.auth')) {
      void this.router.navigateByUrl('/login');
      return;
    }

    this.form.controls.percentOff.valueChanges.subscribe((value) => this.percentDiscount.set(Number(value) || 0));
    this.form.controls.visitOff.valueChanges.subscribe((value) => this.fixedDiscount.set(Number(value) || 0));
    this.form.controls.amountReceived.valueChanges.subscribe((value) => this.amountReceived.set(Number(value) || 0));

    this.api.services().subscribe({
      next: (services) => this.catalog.set(services),
      error: () => this.loadError.set('Could not load services from the API.'),
    });

    this.api.staff().subscribe({
      next: (staff) => this.staffList.set(staff),
      error: () => this.staffList.set([]),
    });

    queueMicrotask(() => this.focusName());
  }

  protected signOut(): void {
    sessionStorage.removeItem('clinora.auth');
    void this.router.navigateByUrl('/login');
  }

  protected onFormKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !(event.target instanceof HTMLTextAreaElement)) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.finder')) {
        return;
      }
      event.preventDefault();
    }

    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.submit();
    }
  }

  protected onPhoneInput(value: string): void {
    this.form.controls.phone.setValue(value);
    if (this.selectedPatient()) {
      return;
    }

    const digits = value.replace(/\D/g, '');
    if (digits.length < 7) {
      this.phoneHits.set([]);
      return;
    }

    this.api.patients(digits).subscribe({
      next: (patients) => this.phoneHits.set(patients),
      error: () => this.phoneHits.set([]),
    });
  }

  protected pickPhoneHit(event: Event): void {
    event.preventDefault();
    const first = this.phoneHits()[0];
    if (first) {
      this.choosePatient(first);
    }
  }

  protected setPaymentReceived(checked: boolean): void {
    this.paymentReceived.set(checked);
    if (checked) {
      const due = this.net();
      this.form.controls.amountReceived.setValue(due);
      this.amountReceived.set(due);
    }
  }

  protected payFull(): void {
    const due = this.net();
    this.form.controls.amountReceived.setValue(due);
    this.amountReceived.set(due);
    this.paymentReceived.set(true);
  }

  protected onServiceInput(value: string): void {
    this.serviceQuery.set(value);
    const query = value.trim().toLowerCase();
    if (!query) {
      this.matches.set([]);
      return;
    }

    this.matches.set(
      this.catalog()
        .filter(
          (service) =>
            service.name.toLowerCase().includes(query) || service.category.toLowerCase().includes(query),
        )
        .filter((service) => !this.lines().some((line) => line.id === service.id))
        .slice(0, 8),
    );
  }

  protected addFirstMatch(event: Event): void {
    event.preventDefault();
    const first = this.matches()[0];
    if (first) {
      this.addService(first.id);
    }
  }

  protected addService(id: number): void {
    if (this.lines().some((line) => line.id === id)) {
      return;
    }

    const service = this.catalog().find((item) => item.id === id);
    this.lines.update((lines) => [
      ...lines,
      {
        id,
        discount: 0,
        urgent: false,
        staffName: '',
        readyBy: this.readyByFromMinutes(service?.normalMinutes ?? 60),
      },
    ]);
    this.serviceQuery.set('');
    this.matches.set([]);
    this.receipt.set(null);
    queueMicrotask(() => this.focusServiceSearch());
  }

  protected removeService(id: number): void {
    this.lines.update((lines) => lines.filter((line) => line.id !== id));
  }

  protected setDiscount(id: number, value: string): void {
    const amount = Number(value) || 0;
    this.lines.update((lines) => lines.map((line) => (line.id === id ? { ...line, discount: amount } : line)));
  }

  protected setStaff(id: number, value: string): void {
    this.lines.update((lines) => lines.map((line) => (line.id === id ? { ...line, staffName: value } : line)));
  }

  protected pickStaff(id: number, name: string): void {
    this.setStaff(id, name);
    this.staffFocusId.set(null);
  }

  protected onStaffBlur(): void {
    queueMicrotask(() => this.staffFocusId.set(null));
  }

  protected staffSuggestions(query: string): StaffMember[] {
    const q = query.trim().toLowerCase();
    if (!q) {
      return this.staffList().slice(0, 6);
    }
    return this.staffList()
      .filter(
        (member) =>
          member.name.toLowerCase().includes(q) || (member.department ?? '').toLowerCase().includes(q),
      )
      .slice(0, 6);
  }

  protected setReady(id: number, value: string): void {
    this.lines.update((lines) => lines.map((line) => (line.id === id ? { ...line, readyBy: value } : line)));
  }

  protected setUrgent(id: number, checked: boolean): void {
    const service = this.catalog().find((item) => item.id === id);
    const minutes = checked ? (service?.urgentMinutes ?? 30) : (service?.normalMinutes ?? 60);
    this.lines.update((lines) =>
      lines.map((line) =>
        line.id === id
          ? { ...line, urgent: checked, readyBy: this.readyByFromMinutes(minutes) }
          : line,
      ),
    );
  }

  private readyByFromMinutes(minutes: number): string {
    const at = new Date(Date.now() + Math.max(minutes, 0) * 60_000);
    const hours = String(at.getHours()).padStart(2, '0');
    const mins = String(at.getMinutes()).padStart(2, '0');
    return `${hours}:${mins}`;
  }

  protected setPanel(value: boolean): void {
    this.isPanel.set(value);
    this.visitType = value ? 'panel' : 'regular';
    if (!value) {
      this.form.controls.panelName.setValue('');
    }
  }

  protected setReferred(value: boolean): void {
    this.isReferred.set(value);
    this.referralMode = value ? 'referred' : 'walkin';
    if (!value) {
      this.form.patchValue({ referredBy: '', slipNo: '', notes: '' });
    }
  }

  protected openFind(): void {
    this.showFind.set(true);
    this.patientQuery.set('');
    this.patientHits.set([]);
  }

  protected openToday(): void {
    this.showToday.set(true);
    this.api.visits().subscribe({
      next: (visits) => this.today.set(visits),
      error: () => this.today.set([]),
    });
  }

  protected reprintSlips(visitId: number): void {
    this.api.visitSlips(visitId).subscribe({
      next: (slips) => printVisitSlips(slips),
      error: () => this.submitError.set('Could not load slips.'),
    });
  }

  protected cancelVisit(visit: VisitSummary): void {
    if (!confirm(`Cancel ${visit.visitNumber}?`)) {
      return;
    }
    this.api.cancelVisit(visit.id).subscribe({
      next: () => {
        this.submitError.set('');
        this.openToday();
      },
      error: (err: HttpErrorResponse) => {
        this.submitError.set(
          typeof err.error?.message === 'string' ? err.error.message : 'Cancel failed.',
        );
      },
    });
  }

  protected searchPatients(value: string): void {
    this.patientQuery.set(value);
    if (value.trim().length < 2) {
      this.patientHits.set([]);
      return;
    }

    this.api.patients(value.trim()).subscribe({
      next: (patients) => this.patientHits.set(patients),
      error: () => this.patientHits.set([]),
    });
  }

  protected pickPatientHit(event: Event): void {
    event.preventDefault();
    const first = this.patientHits()[0];
    if (first) {
      this.choosePatient(first);
    }
  }

  protected choosePatient(patient: PatientSummary): void {
    this.selectedPatient.set(patient);
    this.isPanel.set(patient.isPanel);
    this.phoneHits.set([]);
    this.patientHits.set([]);
    this.patientQuery.set('');
    this.form.patchValue({
      fullName: patient.fullName,
      phone: patient.phone,
      age: String(patient.age),
      gender: patient.gender,
      cnic: patient.cnic ?? '',
      passportNo: patient.passportNo ?? '',
      panelName: patient.panelName ?? '',
    });
    this.photoBase64.set(null);
    this.photoPreview.set(this.api.mediaUrl(patient.photoUrl));
    this.patientDetailsOpen.set(Boolean(patient.cnic || patient.passportNo || patient.photoUrl));
    this.showFind.set(false);
    this.showToday.set(false);
    queueMicrotask(() => this.focusServiceSearch());
  }

  protected clearPatient(): void {
    this.selectedPatient.set(null);
    this.phoneHits.set([]);
    this.patientHits.set([]);
    this.patientQuery.set('');
    this.photoBase64.set(null);
    this.photoPreview.set(null);
    this.patientDetailsOpen.set(false);
    this.form.patchValue({
      fullName: '',
      phone: '',
      age: '',
      gender: '',
      cnic: '',
      passportNo: '',
      panelName: '',
    });
    this.isPanel.set(false);
    queueMicrotask(() => this.focusName());
  }

  protected togglePatientDetails(): void {
    this.patientDetailsOpen.update((open) => !open);
  }

  protected onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/') || file.size > 2_000_000) {
      this.submitError.set('Photo must be an image under 2 MB.');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      this.photoBase64.set(result);
      this.photoPreview.set(result);
      this.submitError.set('');
    };
    reader.readAsDataURL(file);
  }

  protected clearPhoto(): void {
    this.photoBase64.set(null);
    const selected = this.selectedPatient();
    this.photoPreview.set(this.api.mediaUrl(selected?.photoUrl));
  }

  protected pickVisit(visit: VisitSummary): void {
    this.api.patients(visit.patientName).subscribe({
      next: (patients) => {
        const match = patients.find((patient) => patient.id === visit.patientId) ?? patients[0];
        if (match) {
          this.choosePatient(match);
        }
        this.showToday.set(false);
      },
      error: () => this.showToday.set(false),
    });
  }

  protected initials(name: string): string {
    return (
      name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || '—'
    );
  }

  protected submit(): void {
    this.submitError.set('');

    if (this.lines().length === 0) {
      this.submitError.set('Add at least one service.');
      return;
    }

    if (!this.paymentReceived()) {
      this.submitError.set('Mark Payment received before creating the visit.');
      return;
    }

    if (this.shortfall() > 0) {
      this.submitError.set('Amount received must cover the amount due.');
      return;
    }

    const selected = this.selectedPatient();
    if (!selected) {
      const ageRaw = String(this.form.controls.age.value ?? '').trim();
      if (
        this.form.controls.fullName.invalid ||
        this.form.controls.phone.invalid ||
        this.form.controls.gender.invalid ||
        !ageRaw
      ) {
        this.form.markAllAsTouched();
        this.submitError.set('Enter patient name, phone, age, and gender.');
        return;
      }

      const age = Number(ageRaw);
      if (!Number.isFinite(age) || age < 0 || age > 120 || ageRaw === '') {
        this.submitError.set('Enter a valid age.');
        return;
      }
    }

    if (this.isPanel() && !String(this.form.controls.panelName.value ?? '').trim()) {
      this.submitError.set('Panel name is required for panel patients.');
      return;
    }

    const body: CreateVisitRequest = {
      patientId: selected?.id ?? null,
      fullName: selected ? null : this.form.controls.fullName.value.trim(),
      phone: selected ? null : this.form.controls.phone.value.trim(),
      age: selected ? null : Number(String(this.form.controls.age.value ?? '').trim()),
      gender: selected ? null : this.form.controls.gender.value,
      cnic: this.form.controls.cnic.value.trim() || null,
      passportNo: this.form.controls.passportNo.value.trim() || null,
      photoBase64: this.photoBase64(),
      isPanel: this.isPanel(),
      panelName: this.isPanel() ? this.form.controls.panelName.value.trim() : null,
      percentOff: this.percentDiscount(),
      visitOff: this.fixedDiscount(),
      amountReceived: this.amountReceived(),
      paymentReceived: true,
      isReferred: this.isReferred(),
      referredBy: this.isReferred() ? this.form.controls.referredBy.value.trim() : null,
      slipNo: this.isReferred() ? this.form.controls.slipNo.value.trim() : null,
      notes: this.isReferred() ? this.form.controls.notes.value.trim() : null,
      services: this.lines().map((line) => ({
        serviceId: line.id,
        discount: line.discount,
        urgent: line.urgent,
        staffName:
          (this.catalog().find((item) => item.id === line.id)?.category ?? '').toLowerCase() === 'consultation'
            ? line.staffName.trim() || null
            : null,
        readyBy: line.readyBy || null,
      })),
    };

    this.submitting.set(true);
    this.api.createVisit(body).subscribe({
      next: (receipt) => {
        this.submitting.set(false);
        this.receipt.set(receipt);
        this.api.visitSlips(receipt.id).subscribe({
          next: (slips) => printVisitSlips(slips),
        });
        this.resetForNextPatient();
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.submitError.set(
          typeof err.error?.message === 'string' ? err.error.message : 'Could not create the visit.',
        );
      },
    });
  }

  private resetForNextPatient(): void {
    this.selectedPatient.set(null);
    this.phoneHits.set([]);
    this.lines.set([]);
    this.matches.set([]);
    this.serviceQuery.set('');
    this.paymentReceived.set(false);
    this.percentDiscount.set(0);
    this.fixedDiscount.set(0);
    this.amountReceived.set(0);
    this.setPanel(false);
    this.setReferred(false);
    this.photoBase64.set(null);
    this.photoPreview.set(null);
    this.patientDetailsOpen.set(false);
    this.form.reset({
      fullName: '',
      phone: '',
      age: '',
      gender: '',
      cnic: '',
      passportNo: '',
      panelName: '',
      referredBy: '',
      slipNo: '',
      notes: '',
      percentOff: 0,
      visitOff: 0,
      amountReceived: 0,
    });
    queueMicrotask(() => this.focusName());
  }

  private focusName(): void {
    this.nameInput()?.nativeElement.focus();
  }

  private focusServiceSearch(): void {
    this.serviceInput()?.nativeElement.focus();
  }
}
