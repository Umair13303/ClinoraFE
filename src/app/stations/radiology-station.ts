import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Editor } from 'primeng/editor';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { Tag } from 'primeng/tag';

import { ClinicApi, RadiologyTemplate, RadiologyWorkItem, ReportDto } from '../clinic-api';
import { printFinalReport } from '../print/print';
import { plainToEditorHtml, radiologyEditorModules, sanitizeReportHtml, stripHtml } from '../rich-text';
import { readPref, writePref } from './station-prefs';

@Component({
  selector: 'app-radiology-station',
  imports: [
    FormsModule,
    Button,
    Card,
    Editor,
    IconField,
    InputIcon,
    InputText,
    Message,
    Select,
    Tag,
    RouterLink,
  ],
  templateUrl: './radiology-station.html',
})
export class RadiologyStation implements OnInit {
  private readonly api = inject(ClinicApi);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly items = signal<RadiologyWorkItem[]>([]);
  protected readonly templates = signal<RadiologyTemplate[]>([]);
  protected readonly findings = signal<Record<number, string>>({});
  protected readonly selectedTemplateId = signal<Record<number, number | null>>({});
  protected readonly filter = signal('');
  protected readonly error = signal('');
  protected readonly info = signal('');
  protected readonly busyId = signal<number | null>(null);
  protected readonly signedReport = signal<ReportDto | null>(null);
  protected performedBy = readPref('radiologist');
  protected readonly editorModules = radiologyEditorModules;

  protected readonly visible = computed(() => {
    const q = this.filter().trim().toLowerCase();
    if (!q) {
      return this.items();
    }
    return this.items().filter(
      (item) =>
        item.visitNumber.toLowerCase().includes(q) ||
        item.patientName.toLowerCase().includes(q) ||
        item.serviceName.toLowerCase().includes(q),
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
    this.api.radiologyWorklist().subscribe({
      next: (items) => {
        this.items.set(items);
        const map: Record<number, string> = { ...this.findings() };
        const templateMap: Record<number, number | null> = { ...this.selectedTemplateId() };
        for (const item of items) {
          if (item.existingFindings && !map[item.visitServiceId]) {
            map[item.visitServiceId] = plainToEditorHtml(item.existingFindings);
          }
          if (item.templateName && templateMap[item.visitServiceId] == null) {
            const match = this.templates().find((t) => t.name === item.templateName);
            if (match) {
              templateMap[item.visitServiceId] = match.id;
            }
          }
        }
        this.findings.set(map);
        this.selectedTemplateId.set(templateMap);
      },
      error: () => this.error.set('Could not load radiology worklist.'),
    });
    this.api.radiologyTemplates().subscribe({
      next: (list) => {
        this.templates.set(list);
        // Re-match template names once templates arrive.
        const templateMap: Record<number, number | null> = { ...this.selectedTemplateId() };
        for (const item of this.items()) {
          if (item.templateName && templateMap[item.visitServiceId] == null) {
            const match = list.find((t) => t.name === item.templateName);
            if (match) {
              templateMap[item.visitServiceId] = match.id;
            }
          }
        }
        this.selectedTemplateId.set(templateMap);
      },
      error: () => {
        /* templates optional on first load */
      },
    });
  }

  protected templatesFor(item: RadiologyWorkItem): RadiologyTemplate[] {
    return this.templates().filter(
      (t) => !t.serviceIds?.length || t.serviceIds.includes(item.serviceId),
    );
  }

  protected statusLabel(status: string): string {
    switch (status) {
      case 'AwaitingImaging':
        return 'Awaiting imaging';
      case 'Performed':
        return 'Performed';
      case 'Imaged':
        return 'Draft ready';
      default:
        return status;
    }
  }

  protected statusSeverity(status: string): 'warn' | 'info' | 'success' | 'secondary' {
    switch (status) {
      case 'AwaitingImaging':
        return 'warn';
      case 'Performed':
        return 'info';
      case 'Imaged':
        return 'success';
      default:
        return 'secondary';
    }
  }

  protected canEnterFindings(item: RadiologyWorkItem): boolean {
    return item.status === 'Performed' || item.status === 'Imaged';
  }

  protected onPerformedBy(value: string): void {
    this.performedBy = value;
    writePref('radiologist', value);
  }

  protected setFindings(id: number, value: string): void {
    this.findings.update((map) => ({ ...map, [id]: value }));
  }

  protected onTemplateSelect(item: RadiologyWorkItem, templateId: number | null): void {
    this.selectedTemplateId.update((map) => ({ ...map, [item.visitServiceId]: templateId }));
    if (!templateId) {
      return;
    }
    const template = this.templates().find((t) => t.id === templateId);
    if (!template) {
      return;
    }
    this.setFindings(item.visitServiceId, plainToEditorHtml(template.body));
  }

  protected previewHtml(html: string | null | undefined): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(sanitizeReportHtml(html));
  }

  protected markPerformed(item: RadiologyWorkItem): void {
    this.busyId.set(item.visitServiceId);
    this.error.set('');
    this.info.set('');
    writePref('radiologist', this.performedBy);
    this.api
      .radiologyPerform({
        visitServiceId: item.visitServiceId,
        performedByName: this.performedBy || null,
      })
      .subscribe({
        next: () => {
          this.busyId.set(null);
          this.info.set(`Marked ${item.serviceName} as performed. Enter findings, then approve & sign.`);
          this.reload();
        },
        error: (err: { error?: { message?: string } }) => {
          this.busyId.set(null);
          this.error.set(
            typeof err.error?.message === 'string' ? err.error.message : 'Could not mark study performed.',
          );
        },
      });
  }

  protected saveDraft(item: RadiologyWorkItem): void {
    this.submit(item, false);
  }

  protected sign(item: RadiologyWorkItem): void {
    this.submit(item, true);
  }

  private submit(item: RadiologyWorkItem, sign: boolean): void {
    const text = (this.findings()[item.visitServiceId] || '').trim();
    if (stripHtml(text).length < 3) {
      this.error.set('Select a template and edit the report before saving.');
      return;
    }
    if (sign && this.performedBy.trim().length < 2) {
      this.error.set('Enter the radiologist name before approving and signing.');
      return;
    }
    const templateId = this.selectedTemplateId()[item.visitServiceId] ?? null;
    const template = templateId ? this.templates().find((t) => t.id === templateId) : null;
    this.busyId.set(item.visitServiceId);
    this.error.set('');
    this.info.set('');
    this.signedReport.set(null);
    writePref('radiologist', this.performedBy);

    const payload = {
      visitServiceId: item.visitServiceId,
      findings: text,
      performedByName: this.performedBy || null,
      templateId,
      templateName: template?.name ?? item.templateName ?? null,
    };

    const onError = (err: { error?: { message?: string } }) => {
      this.busyId.set(null);
      this.error.set(typeof err.error?.message === 'string' ? err.error.message : 'Update failed.');
    };

    if (sign) {
      this.api.radiologySign(payload).subscribe({
        next: (res) => {
          this.busyId.set(null);
          this.signedReport.set(res);
          const printed = printFinalReport(res);
          if (printed) {
            this.api.markReportPrinted(res.id).subscribe({
              next: (mark) => {
                this.signedReport.update((r) => (r ? { ...r, printCount: mark.printCount } : r));
              },
            });
          }
          this.info.set(
            printed
              ? `Approved & signed ${item.serviceName} · print dialog opened · also available in Report collection`
              : `Approved & signed ${item.serviceName} · allow popups to print, or open Report collection`,
          );
          this.reload();
        },
        error: onError,
      });
      return;
    }

    this.api.radiologyComplete(payload).subscribe({
      next: () => {
        this.busyId.set(null);
        this.info.set(`Draft saved for ${item.serviceName}. Approve & sign when ready.`);
        this.reload();
      },
      error: onError,
    });
  }
}
