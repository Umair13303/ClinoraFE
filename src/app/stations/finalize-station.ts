import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Checkbox } from 'primeng/checkbox';
import { Dialog } from 'primeng/dialog';
import { Editor } from 'primeng/editor';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Tag } from 'primeng/tag';
import { Textarea } from 'primeng/textarea';

import { ClinicApi, ReportDto, ResultWorkItem } from '../clinic-api';
import { printFinalReport } from '../print/print';
import { plainToEditorHtml, radiologyEditorModules, sanitizeReportHtml, stripHtml } from '../rich-text';
import { parseSemenWorksheet, semenWorksheetToPrintHtml } from '../semen-report';
import { readPref, writePref } from './station-prefs';

type AmendParamRow = {
  parameterName: string;
  text: string;
  units: string;
  range: string;
  critical: boolean;
};

@Component({
  selector: 'app-finalize-station',
  imports: [
    FormsModule,
    Button,
    Card,
    Checkbox,
    Dialog,
    Editor,
    IconField,
    InputIcon,
    InputText,
    Message,
    Tag,
    Textarea,
  ],
  templateUrl: './finalize-station.html',
  styleUrl: './finalize-station.css',
})
export class FinalizeStation implements OnInit {
  private readonly api = inject(ClinicApi);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly items = signal<ResultWorkItem[]>([]);
  protected readonly selected = signal<Record<number, boolean>>({});
  protected readonly criticalAck = signal<Record<number, boolean>>({});
  protected readonly filter = signal('');
  protected readonly error = signal('');
  protected readonly info = signal('');
  protected readonly busyVisit = signal<number | null>(null);
  protected readonly lastReport = signal<ReportDto | null>(null);
  protected doctor = readPref('doctor');
  protected readonly editorModules = radiologyEditorModules;

  protected readonly amendOpen = signal(false);
  protected readonly amendLine = signal<ResultWorkItem | null>(null);
  protected amendText = '';
  protected amendUnits = '';
  protected amendRange = '';
  protected amendCritical = false;
  protected amendParams: AmendParamRow[] = [];
  protected readonly amendBusy = signal(false);

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
        // Radiology is approved on /radiology — keep doctor finalize lab-only.
        const labOnly = items.filter(
          (item) => item.reportProfile !== 'Radiology' && item.status !== 'Imaged' && item.status !== 'Performed',
        );
        this.items.set(labOnly);
        const selected: Record<number, boolean> = {};
        for (const item of labOnly) {
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

  protected setCriticalAck(visitId: number, checked: boolean): void {
    this.criticalAck.update((map) => ({ ...map, [visitId]: checked }));
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
    if (printFinalReport(report)) {
      this.api.markReportPrinted(report.id).subscribe();
    }
  }

  protected pendingLines(visitId: number): ResultWorkItem[] {
    return this.selectedLines(visitId).filter((line) => line.status !== 'Finalized');
  }

  protected hasCriticalPending(visitId: number): boolean {
    return this.pendingLines(visitId).some((line) => !!line.isCritical);
  }

  protected canFinalize(visitId: number): boolean {
    if (this.pendingLines(visitId).length === 0) {
      return false;
    }
    if (this.hasCriticalPending(visitId) && !this.criticalAck()[visitId]) {
      return false;
    }
    return true;
  }

  protected profileOf(line: ResultWorkItem): string {
    return line.reportProfile || 'Standard';
  }

  protected previewHtml(line: ResultWorkItem): SafeHtml {
    const profile = this.profileOf(line);
    if (profile === 'Semen') {
      return this.sanitizer.bypassSecurityTrustHtml(
        semenWorksheetToPrintHtml(parseSemenWorksheet(line.existingResultText)),
      );
    }
    if (profile === 'Narrative' || profile === 'Radiology') {
      return this.sanitizer.bypassSecurityTrustHtml(sanitizeReportHtml(line.existingResultText));
    }
    const params = line.existingResults ?? [];
    if (params.length > 1) {
      const rows = params
        .map(
          (r) =>
            `<tr><td>${escapeHtml(r.parameterName || '—')}</td><td>${escapeHtml(r.resultText || '—')}</td><td>${escapeHtml(r.units || '—')}</td><td>${escapeHtml(r.referenceRange || '—')}</td></tr>`,
        )
        .join('');
      return this.sanitizer.bypassSecurityTrustHtml(
        `<table class="fin-preview-table"><thead><tr><th>Param</th><th>Result</th><th>Units</th><th>Ref</th></tr></thead><tbody>${rows}</tbody></table>`,
      );
    }
    const text = escapeHtml(line.existingResultText || '—');
    const meta = [line.existingUnits, line.existingReferenceRange].filter(Boolean).join(' · ');
    return this.sanitizer.bypassSecurityTrustHtml(
      `<div class="fin-preview-plain">${text}${meta ? ` <span class="fin-meta">${escapeHtml(meta)}</span>` : ''}</div>`,
    );
  }

  protected openAmend(line: ResultWorkItem): void {
    this.amendLine.set(line);
    const profile = this.profileOf(line);
    this.amendParams = [];
    if (profile === 'Semen') {
      this.amendText = line.existingResultText ?? '';
    } else if (profile === 'Narrative' || profile === 'Radiology') {
      this.amendText = plainToEditorHtml(line.existingResultText);
    } else {
      const rows = line.existingResults ?? [];
      if (rows.length > 1) {
        this.amendParams = rows.map((r) => ({
          parameterName: r.parameterName || '',
          text: r.resultText ?? '',
          units: r.units ?? '',
          range: r.referenceRange ?? '',
          critical: !!r.isCritical,
        }));
        this.amendText = '';
      } else {
        this.amendText = line.existingResultText ?? '';
      }
    }
    this.amendUnits = line.existingUnits ?? '';
    this.amendRange = line.existingReferenceRange ?? '';
    this.amendCritical = !!line.isCritical;
    this.amendOpen.set(true);
  }

  protected onAmendVisible(visible: boolean): void {
    this.amendOpen.set(visible);
    if (!visible) {
      this.amendLine.set(null);
      this.amendParams = [];
    }
  }

  protected closeAmend(): void {
    this.amendOpen.set(false);
    this.amendLine.set(null);
    this.amendParams = [];
  }

  protected unlockSemenAndOpenResults(): void {
    const line = this.amendLine();
    if (!line) {
      return;
    }
    const text = (line.existingResultText ?? '').trim();
    if (!text) {
      this.error.set('No semen worksheet to unlock.');
      return;
    }
    this.amendBusy.set(true);
    this.error.set('');
    this.api
      .saveResult({
        visitServiceId: line.visitServiceId,
        resultText: text,
        parameterName: line.existingParameterName ?? 'Semen worksheet',
        enteredByName: this.doctor || null,
        amend: true,
        source: 'Amend',
      })
      .subscribe({
        next: () => {
          this.amendBusy.set(false);
          this.closeAmend();
          this.info.set('Semen unlocked — edit worksheet in Result entry, then finalize again.');
          void this.router.navigateByUrl('/results');
        },
        error: (err) => {
          this.amendBusy.set(false);
          this.error.set(typeof err.error?.message === 'string' ? err.error.message : 'Amend failed.');
        },
      });
  }

  protected saveAmend(): void {
    const line = this.amendLine();
    if (!line) {
      return;
    }
    const profile = this.profileOf(line);
    if (profile === 'Semen') {
      this.unlockSemenAndOpenResults();
      return;
    }

    if (this.amendParams.length > 1) {
      const filled = this.amendParams.filter((r) => r.text.trim());
      if (filled.length === 0) {
        this.error.set('Enter at least one parameter value.');
        return;
      }
      this.amendBusy.set(true);
      this.error.set('');
      forkJoin(
        filled.map((row) =>
          this.api.saveResult({
            visitServiceId: line.visitServiceId,
            resultText: row.text.trim(),
            units: row.units.trim() || null,
            referenceRange: row.range.trim() || null,
            parameterName: row.parameterName || null,
            enteredByName: this.doctor || null,
            amend: true,
            source: 'Amend',
            isCritical: row.critical,
          }),
        ),
      ).subscribe({
        next: () => {
          this.amendBusy.set(false);
          this.closeAmend();
          this.info.set('Amendment saved. Finalize again.');
          this.reload();
        },
        error: (err) => {
          this.amendBusy.set(false);
          this.error.set(typeof err.error?.message === 'string' ? err.error.message : 'Amend failed.');
        },
      });
      return;
    }

    const text = this.amendText.trim();
    if (profile === 'Narrative' || profile === 'Radiology') {
      if (stripHtml(text).length < 3) {
        this.error.set('Enter amended report text.');
        return;
      }
    } else if (!text) {
      this.error.set('Enter amended result.');
      return;
    }

    this.amendBusy.set(true);
    this.error.set('');
    this.api
      .saveResult({
        visitServiceId: line.visitServiceId,
        resultText: text,
        units: this.amendUnits.trim() || null,
        referenceRange: this.amendRange.trim() || null,
        parameterName: line.existingParameterName ?? null,
        enteredByName: this.doctor || null,
        amend: true,
        source: 'Amend',
        isCritical: this.amendCritical,
      })
      .subscribe({
        next: (res) => {
          this.amendBusy.set(false);
          this.closeAmend();
          this.info.set(res.message);
          this.reload();
        },
        error: (err) => {
          this.amendBusy.set(false);
          this.error.set(typeof err.error?.message === 'string' ? err.error.message : 'Amend failed.');
        },
      });
  }

  protected finalize(visitId: number): void {
    const picked = this.pendingLines(visitId);
    if (picked.length === 0) {
      this.error.set('Select at least one non-finalized line.');
      return;
    }
    if (this.hasCriticalPending(visitId) && !this.criticalAck()[visitId]) {
      this.error.set('Acknowledge critical results before finalizing.');
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
          this.criticalAck.update((map) => ({ ...map, [visitId]: false }));
          const printed = printFinalReport(report);
          if (printed) {
            this.api.markReportPrinted(report.id).subscribe();
          }
          this.info.set(
            printed
              ? `Finalized ${report.visitNumber} · print dialog opened`
              : `Finalized ${report.visitNumber} · use Reprint report if dialog was blocked`,
          );
          this.reload();
        },
        error: (err) => {
          this.busyVisit.set(null);
          this.error.set(typeof err.error?.message === 'string' ? err.error.message : 'Finalize failed.');
        },
      });
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
