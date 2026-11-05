import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Checkbox } from 'primeng/checkbox';
import { Editor } from 'primeng/editor';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Select } from 'primeng/select';
import { Tag } from 'primeng/tag';
import { Textarea } from 'primeng/textarea';

import { ClinicApi, ExistingResult, RadiologyTemplate, ResultWorkItem } from '../clinic-api';
import { plainToEditorHtml, radiologyEditorModules, stripHtml } from '../rich-text';
import {
  emptySemenWorksheet,
  parseSemenWorksheet,
  SemenWorksheet,
  semenWorksheetValid,
  serializeSemenWorksheet,
} from '../semen-report';
import { readPref, writePref } from './station-prefs';

type ParamOpt = { id: number; name: string; unit: string | null; refLow: number | null; refHigh: number | null };
type Draft = { text: string; units: string; range: string; critical: boolean; paramId: number | null };
type ParamRow = {
  paramId: number;
  name: string;
  text: string;
  units: string;
  range: string;
  critical: boolean;
  refLow: number | null;
  refHigh: number | null;
};

@Component({
  selector: 'app-results-station',
  imports: [
    FormsModule,
    Button,
    Card,
    Checkbox,
    Editor,
    IconField,
    InputIcon,
    InputText,
    Message,
    Select,
    Tag,
    Textarea,
  ],
  templateUrl: './results-station.html',
})
export class ResultsStation implements OnInit {
  private readonly api = inject(ClinicApi);
  private readonly router = inject(Router);

  protected readonly items = signal<ResultWorkItem[]>([]);
  protected readonly drafts = signal<Record<number, Draft>>({});
  protected readonly paramRows = signal<Record<number, ParamRow[]>>({});
  protected readonly semenDrafts = signal<Record<number, SemenWorksheet>>({});
  protected readonly narrativeTemplates = signal<RadiologyTemplate[]>([]);
  protected readonly selectedNarrativeTemplate = signal<Record<number, number | null>>({});
  protected readonly params = signal<Record<number, ParamOpt[]>>({});
  protected readonly filter = signal('');
  protected readonly error = signal('');
  protected readonly info = signal('');
  protected readonly savingId = signal<number | null>(null);
  protected enteredBy = readPref('enteredBy');
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
        item.serviceName.toLowerCase().includes(q) ||
        (item.barcode ?? '').toLowerCase().includes(q),
    );
  });

  ngOnInit(): void {
    if (!sessionStorage.getItem('clinora.auth')) {
      void this.router.navigateByUrl('/login');
      return;
    }
    this.reload();
  }

  protected profileOf(item: ResultWorkItem): string {
    return item.reportProfile || 'Standard';
  }

  protected reload(): void {
    this.error.set('');
    this.api.resultsWorklist().subscribe({
      next: (items) => {
        this.items.set(items);
        const drafts: Record<number, Draft> = {};
        const semen: Record<number, SemenWorksheet> = { ...this.semenDrafts() };
        for (const item of items) {
          const profile = this.profileOf(item);
          if (profile === 'Semen') {
            semen[item.visitServiceId] = parseSemenWorksheet(item.existingResultText);
          } else if (profile === 'Narrative') {
            drafts[item.visitServiceId] = {
              text: plainToEditorHtml(item.existingResultText),
              units: '',
              range: '',
              critical: !!item.isCritical,
              paramId: null,
            };
          } else {
            drafts[item.visitServiceId] = {
              text: item.existingResultText ?? '',
              units: item.existingUnits ?? '',
              range: item.existingReferenceRange ?? '',
              critical: !!item.isCritical,
              paramId: null,
            };
            if (item.serviceId) {
              this.loadParams(item);
            }
          }
        }
        this.drafts.set(drafts);
        this.semenDrafts.set(semen);
      },
      error: () => this.error.set('Could not load result worklist.'),
    });
    this.api.radiologyTemplates(null, 'Narrative').subscribe({
      next: (list) => this.narrativeTemplates.set(list),
    });
  }

  protected templatesFor(item: ResultWorkItem): RadiologyTemplate[] {
    return this.narrativeTemplates().filter(
      (t) => !t.serviceIds?.length || t.serviceIds.includes(item.serviceId),
    );
  }

  private loadParams(item: ResultWorkItem): void {
    const apply = (list: ParamOpt[]) => {
      this.params.update((map) => ({ ...map, [item.serviceId]: list }));
      if (list.length > 0) {
        this.paramRows.update((map) => ({
          ...map,
          [item.visitServiceId]: this.buildParamRows(list, item.existingResults ?? []),
        }));
      }
    };

    const cached = this.params()[item.serviceId];
    if (cached) {
      apply(cached);
      return;
    }
    this.api.resultParameters(item.serviceId).subscribe({
      next: (list) => apply(list),
    });
  }

  private buildParamRows(catalog: ParamOpt[], existing: ExistingResult[]): ParamRow[] {
    return catalog.map((p) => {
      const match = existing.find(
        (e) => (e.parameterName ?? '').localeCompare(p.name, undefined, { sensitivity: 'accent' }) === 0,
      );
      return {
        paramId: p.id,
        name: p.name,
        text: match?.resultText ?? '',
        units: match?.units ?? p.unit ?? '',
        range:
          match?.referenceRange ??
          (p.refLow != null || p.refHigh != null ? `${p.refLow ?? ''}–${p.refHigh ?? ''}` : ''),
        critical: !!match?.isCritical,
        refLow: p.refLow,
        refHigh: p.refHigh,
      };
    });
  }

  protected draft(id: number): Draft {
    return this.drafts()[id] ?? { text: '', units: '', range: '', critical: false, paramId: null };
  }

  protected rows(id: number): ParamRow[] {
    return this.paramRows()[id] ?? [];
  }

  protected semen(id: number): SemenWorksheet {
    return this.semenDrafts()[id] ?? emptySemenWorksheet();
  }

  protected patch(id: number, patch: Partial<Draft>): void {
    this.drafts.update((map) => ({ ...map, [id]: { ...this.draft(id), ...patch } }));
  }

  protected patchRow(visitServiceId: number, paramId: number, patch: Partial<ParamRow>): void {
    this.paramRows.update((map) => ({
      ...map,
      [visitServiceId]: (map[visitServiceId] ?? []).map((row) =>
        row.paramId === paramId ? { ...row, ...patch } : row,
      ),
    }));
  }

  protected patchSemen(id: number, patch: Partial<SemenWorksheet>): void {
    this.semenDrafts.update((map) => ({ ...map, [id]: { ...this.semen(id), ...patch } }));
  }

  protected onNarrativeTemplate(item: ResultWorkItem, templateId: number | null): void {
    this.selectedNarrativeTemplate.update((map) => ({ ...map, [item.visitServiceId]: templateId }));
    if (!templateId) {
      return;
    }
    const template = this.narrativeTemplates().find((t) => t.id === templateId);
    if (template) {
      this.patch(item.visitServiceId, { text: plainToEditorHtml(template.body) });
    }
  }

  protected onEnteredBy(value: string): void {
    this.enteredBy = value;
    writePref('enteredBy', value);
  }

  protected save(item: ResultWorkItem, event?: Event): void {
    event?.preventDefault();
    const profile = this.profileOf(item);
    writePref('enteredBy', this.enteredBy);

    if (profile === 'Semen') {
      this.saveSemen(item);
      return;
    }
    if (profile === 'Narrative') {
      this.saveNarrative(item);
      return;
    }
    this.saveStandard(item);
  }

  private saveStandard(item: ResultWorkItem): void {
    const rows = this.rows(item.visitServiceId);
    if (rows.length > 0) {
      const filled = rows.filter((r) => r.text.trim());
      if (filled.length === 0) {
        this.error.set(`Enter at least one parameter for ${item.serviceName}.`);
        return;
      }
      this.savingId.set(item.visitServiceId);
      this.error.set('');
      forkJoin(
        filled.map((row) =>
          this.api.saveResult({
            visitServiceId: item.visitServiceId,
            resultText: row.text.trim(),
            units: row.units.trim() || null,
            referenceRange: row.range.trim() || null,
            enteredByName: this.enteredBy || null,
            source: 'InHouse',
            parameterName: row.name,
            refLow: row.refLow,
            refHigh: row.refHigh,
            isCritical: row.critical,
          }),
        ),
      ).subscribe({
        next: (resList) => {
          const anyCritical = resList.some((r) => r.isCritical);
          const anyAbnormal = resList.some((r) => r.isAbnormal);
          this.onSaved(item, { isCritical: anyCritical, isAbnormal: anyAbnormal });
        },
        error: (err) => this.onSaveError(err),
      });
      return;
    }

    const d = this.draft(item.visitServiceId);
    if (!d.text.trim()) {
      this.error.set(`Enter result for ${item.serviceName}.`);
      return;
    }
    this.savingId.set(item.visitServiceId);
    this.error.set('');
    this.api
      .saveResult({
        visitServiceId: item.visitServiceId,
        resultText: d.text.trim(),
        units: d.units.trim() || null,
        referenceRange: d.range.trim() || null,
        enteredByName: this.enteredBy || null,
        source: 'InHouse',
        parameterName: null,
        isCritical: d.critical,
      })
      .subscribe({
        next: (res) => this.onSaved(item, res),
        error: (err) => this.onSaveError(err),
      });
  }

  private saveNarrative(item: ResultWorkItem): void {
    const d = this.draft(item.visitServiceId);
    if (stripHtml(d.text).length < 3) {
      this.error.set(`Enter narrative report for ${item.serviceName}.`);
      return;
    }
    const templateId = this.selectedNarrativeTemplate()[item.visitServiceId] ?? null;
    const template = templateId ? this.narrativeTemplates().find((t) => t.id === templateId) : null;
    this.savingId.set(item.visitServiceId);
    this.error.set('');
    this.api
      .saveResult({
        visitServiceId: item.visitServiceId,
        resultText: d.text.trim(),
        enteredByName: this.enteredBy || null,
        source: 'InHouse',
        parameterName: template?.name ?? item.existingParameterName ?? null,
        isCritical: d.critical,
      })
      .subscribe({
        next: (res) => this.onSaved(item, res),
        error: (err) => this.onSaveError(err),
      });
  }

  private saveSemen(item: ResultWorkItem): void {
    const data = this.semen(item.visitServiceId);
    if (!semenWorksheetValid(data)) {
      this.error.set(`Enter volume, concentration, or impression for ${item.serviceName}.`);
      return;
    }
    this.savingId.set(item.visitServiceId);
    this.error.set('');
    this.api
      .saveResult({
        visitServiceId: item.visitServiceId,
        resultText: serializeSemenWorksheet(data),
        enteredByName: this.enteredBy || null,
        source: 'InHouse',
        parameterName: 'Semen worksheet',
      })
      .subscribe({
        next: (res) => this.onSaved(item, res),
        error: (err) => this.onSaveError(err),
      });
  }

  private onSaved(item: ResultWorkItem, res: { isCritical?: boolean; isAbnormal?: boolean }): void {
    this.savingId.set(null);
    const flags = [res.isCritical ? 'CRITICAL' : '', res.isAbnormal ? 'Abnormal' : '']
      .filter(Boolean)
      .join(' · ');
    this.info.set(`Saved ${item.serviceName} · ${item.visitNumber}${flags ? ' · ' + flags : ''}`);
    this.reload();
  }

  private onSaveError(err: { error?: { message?: string } }): void {
    this.savingId.set(null);
    this.error.set(typeof err.error?.message === 'string' ? err.error.message : 'Save failed.');
  }
}
