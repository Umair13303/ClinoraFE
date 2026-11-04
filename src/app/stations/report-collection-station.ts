import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Tag } from 'primeng/tag';

import { ClinicApi, ReportDto } from '../clinic-api';
import { printFinalReport } from '../print/print';

@Component({
  selector: 'app-report-collection-station',
  imports: [FormsModule, DatePipe, Button, Card, IconField, InputIcon, InputText, Message, Tag],
  templateUrl: './report-collection-station.html',
})
export class ReportCollectionStation implements OnInit {
  private readonly api = inject(ClinicApi);
  private readonly router = inject(Router);

  protected query = '';
  protected readonly reports = signal<ReportDto[]>([]);
  protected readonly error = signal('');
  protected readonly info = signal('');
  protected readonly searching = signal(false);
  protected readonly printingId = signal<number | null>(null);
  protected readonly mode = signal<'today' | 'search'>('today');
  protected readonly todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  ngOnInit(): void {
    if (!sessionStorage.getItem('clinora.auth')) {
      void this.router.navigateByUrl('/login');
      return;
    }
    this.loadToday();
  }

  protected loadToday(): void {
    this.searching.set(true);
    this.error.set('');
    this.info.set('');
    this.mode.set('today');
    this.query = '';
    this.api.todayReports().subscribe({
      next: (list) => {
        this.searching.set(false);
        this.reports.set(list);
        this.info.set(
          list.length
            ? `${list.length} report${list.length === 1 ? '' : 's'} finalized today`
            : 'No reports finalized today yet.',
        );
      },
      error: () => {
        this.searching.set(false);
        this.reports.set([]);
        this.error.set('Could not load today’s reports.');
      },
    });
  }

  protected search(event?: Event): void {
    event?.preventDefault();
    const q = this.query.trim();
    if (q.length < 2) {
      this.loadToday();
      return;
    }
    this.searching.set(true);
    this.error.set('');
    this.info.set('');
    this.mode.set('search');
    this.api.lookupReports(q).subscribe({
      next: (list) => {
        this.searching.set(false);
        this.reports.set(list);
        if (list.length === 0) {
          this.info.set('No finalized report found for this search.');
        } else if (list.length === 1) {
          this.info.set(`Found ${list[0].visitNumber} · ${list[0].patientName}`);
        } else {
          this.info.set(`${list.length} reports found — select one to print.`);
        }
      },
      error: (err) => {
        this.searching.set(false);
        this.reports.set([]);
        this.error.set(typeof err.error?.message === 'string' ? err.error.message : 'Lookup failed.');
      },
    });
  }

  protected print(report: ReportDto): void {
    this.printingId.set(report.id);
    this.error.set('');
    const printed = printFinalReport(report);
    if (printed) {
      this.api.markReportPrinted(report.id).subscribe({
        next: (res) => {
          this.printingId.set(null);
          this.info.set(`Printed ${report.visitNumber} · print count ${res.printCount}`);
          this.reports.update((list) =>
            list.map((r) => (r.id === report.id ? { ...r, printCount: res.printCount } : r)),
          );
        },
        error: () => {
          this.printingId.set(null);
          this.info.set(`Printed ${report.visitNumber}`);
        },
      });
    } else {
      this.printingId.set(null);
      this.error.set('Print dialog was blocked — allow popups and try again.');
    }
  }

  protected lineSummary(report: ReportDto): string {
    return (report.lines ?? []).map((l) => l.serviceName).join(' · ') || 'No lines';
  }
}
