import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';

import { ClinicApi, ReportDto, ResultWorkItem } from '../clinic-api';
import { printFinalReport } from '../print/print';
import { readPref, writePref } from './station-prefs';

@Component({
  selector: 'app-finalize-station',
  imports: [FormsModule, Button, Checkbox, InputText, Message],
  templateUrl: './finalize-station.html',
})
export class FinalizeStation implements OnInit {
  private readonly api = inject(ClinicApi);
  private readonly router = inject(Router);

  protected readonly items = signal<ResultWorkItem[]>([]);
  protected readonly selected = signal<Record<number, boolean>>({});
  protected readonly filter = signal('');
  protected readonly error = signal('');
  protected readonly info = signal('');
  protected readonly busyVisit = signal<number | null>(null);
  protected readonly lastReport = signal<ReportDto | null>(null);
  protected doctor = readPref('doctor');

  protected readonly visitGroups = computed(() => {
    const q = this.filter().trim().toLowerCase();
    const map = new Map<
      number,
      { visitId: number; visitNumber: string; patientName: string; lines: ResultWorkItem[] }
    >();
    for (const item of this.items()) {
      if (
        q &&
        !(
          item.visitNumber.toLowerCase().includes(q) ||
          item.patientName.toLowerCase().includes(q) ||
          item.serviceName.toLowerCase().includes(q)
        )
      ) {
        continue;
      }
      const group = map.get(item.visitId) ?? {
        visitId: item.visitId,
        visitNumber: item.visitNumber,
        patientName: item.patientName,
        lines: [],
      };
      group.lines.push(item);
      map.set(item.visitId, group);
    }
    return [...map.values()];
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
    this.api.finalizeWorklist().subscribe({
      next: (items) => {
        this.items.set(items);
        const selected: Record<number, boolean> = {};
        for (const item of items) {
          selected[item.visitServiceId] = true;
        }
        this.selected.set(selected);
      },
      error: () => this.error.set('Could not load finalize queue.'),
    });
  }

  protected onDoctor(value: string): void {
    this.doctor = value;
    writePref('doctor', value);
  }

  protected toggle(id: number, checked: boolean): void {
    this.selected.update((map) => ({ ...map, [id]: checked }));
  }

  protected selectedLines(visitId: number): ResultWorkItem[] {
    return this.items().filter((item) => item.visitId === visitId && this.selected()[item.visitServiceId]);
  }

  protected reprintLast(): void {
    const report = this.lastReport();
    if (!report) {
      this.error.set('No report to reprint yet.');
      return;
    }
    printFinalReport(report);
  }

  protected finalize(visitId: number): void {
    const picked = this.selectedLines(visitId);
    if (picked.length === 0) {
      this.error.set('Select at least one line.');
      return;
    }

    const pathway = picked.every((line) => line.status === 'Imaged')
      ? 'Radiology'
      : picked.every((line) => line.status === 'ResultEntered')
        ? 'Laboratory'
        : 'Mixed';

    this.busyVisit.set(visitId);
    this.error.set('');
    writePref('doctor', this.doctor);

    this.api
      .finalizeReport({
        visitId,
        visitServiceIds: picked.map((line) => line.visitServiceId),
        finalizedByName: this.doctor || 'Doctor',
        pathway,
      })
      .subscribe({
        next: (report) => {
          this.busyVisit.set(null);
          this.lastReport.set(report);
          const printed = printFinalReport(report);
          this.info.set(
            printed
              ? `Finalized ${report.visitNumber} · print dialog opened`
              : `Finalized ${report.visitNumber} · use Reprint report if dialog was blocked`,
          );
          this.api.markReportPrinted(report.id).subscribe();
          this.reload();
        },
        error: (err) => {
          this.busyVisit.set(null);
          this.error.set(typeof err.error?.message === 'string' ? err.error.message : 'Finalize failed.');
        },
      });
  }
}
