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

import { ClinicApi, ExistingResult, LookupItem, RadiologyTemplate, ResultWorkItem } from '../clinic-api';
import {
  emptyIhcMarker,
  emptyIhcWorksheet,
  ihcWorksheetValid,
  IhcWorksheet,
  parseIhcWorksheet,
  serializeIhcWorksheet,
} from '../ihc-report';
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
  protected readonly ihcDrafts = signal<Record<number, IhcWorksheet>>({});
  protected readonly antibodies = signal<LookupItem[]>([]);
  protected readonly selectedAntibody = signal<Record<number, number | null>>({});
  protected readonly narrativeTemplates = signal<RadiologyTemplate[]>([]);
  protected readonly selectedNarrativeTemplate = signal<Record<number, number | null>>({});
  protected readonly params = signal<Record<number, ParamOpt[]>>({});
  protected readonly filter = signal('');
  protected readonly error = signal('');
  protected readonly info = signal('');
  protected readonly savingId = signal<number | null>(null);
  protected enteredBy = readPref('enteredBy');
  protected readonly editorModules = radiologyEditorModules;
  protected readonly ihcResultOptions = [
    { label: 'Positive', value: 'Positive' },
    { label: 'Negative', value: 'Negative' },
    { label: 'Equivocal', value: 'Equivocal' },
    { label: 'Not done', value: 'Not done' },
  ];
  protected readonly ihcIntensityOptions = [
    { label: '0', value: '0' },
    { label: '1+', value: '1+' },
    { label: '2+', value: '2+' },
    { label: '3+', value: '3+' },
    { label: 'Strong', value: 'Strong' },
    { label: 'Moderate', value: 'Moderate' },
    { label: 'Weak', value: 'Weak' },
  ];

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
        const ihc: Record<number, IhcWorksheet> = { ...this.ihcDrafts() };
        for (const item of items) {
          const profile = this.profileOf(item);
          if (profile === 'Semen') {
            semen[item.visitServiceId] = parseSemenWorksheet(item.existingResultText);
          } else if (profile === 'Ihc') {
            const sheet = parseIhcWorksheet(item.existingResultText);
            if (sheet.markers.length === 0 && this.antibodies().length > 0) {
              sheet.markers = this.defaultIhcMarkers();
              sheet.panelName = sheet.panelName || 'Breast panel';
            }
            ihc[item.visitServiceId] = sheet;
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
        this.ihcDrafts.set(ihc);
      },
      error: () => this.error.set('Could not load result worklist.'),
    });
    this.api.radiologyTemplates(null, 'Narrative').subscribe({
      next: (list) => this.narrativeTemplates.set(list),
    });
    this.api.sampleSetup().subscribe({
      next: (setup) => {
        this.antibodies.set(setup.antibodies ?? []);
        // Re-seed empty IHC sheets once catalog arrives
        if ((setup.antibodies ?? []).length > 0) {
          this.ihcDrafts.update((map) => {
            const next = { ...map };
            for (const item of this.items()) {
              if (this.profileOf(item) !== 'Ihc') {
                continue;
              }
              const cur = next[item.visitServiceId] ?? parseIhcWorksheet(item.existingResultText);
              if (cur.markers.length === 0) {
                next[item.visitServiceId] = {
                  ...cur,
                  panelName: cur.panelName || 'Breast panel',
                  markers: this.defaultIhcMarkers(setup.antibodies),
                };
              }
            }
            return next;
          });
        }
      },
    });
  }

  private defaultIhcMarkers(list?: LookupItem[]) {
    const catalog = list ?? this.antibodies();
    const preferred = ['ER', 'PR', 'HER2', 'KI67'];
    const picked = preferred
      .map((code) => catalog.find((a) => a.code.toUpperCase() === code))
      .filter((a): a is LookupItem => !!a);
    const source = picked.length > 0 ? picked : catalog.slice(0, 4);
    return source.map((a) => emptyIhcMarker({ code: a.code, name: a.name }));
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

  protected ihc(id: number): IhcWorksheet {
    return this.ihcDrafts()[id] ?? emptyIhcWorksheet();
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

  protected patchIhc(id: number, patch: Partial<IhcWorksheet>): void {
    this.ihcDrafts.update((map) => ({ ...map, [id]: { ...this.ihc(id), ...patch } }));
  }

  protected patchIhcMarker(id: number, index: number, patch: Partial<ReturnType<typeof emptyIhcMarker>>): void {
    const sheet = this.ihc(id);
    const markers = sheet.markers.map((m, i) => (i === index ? { ...m, ...patch } : m));
    this.patchIhc(id, { markers });
  }

  protected setSelectedAntibody(visitServiceId: number, antibodyId: number | null): void {
    this.selectedAntibody.update((map) => ({ ...map, [visitServiceId]: antibodyId }));
  }

  protected addIhcMarker(item: ResultWorkItem): void {
    const id = item.visitServiceId;
    const abId = this.selectedAntibody()[id];
    const ab = abId ? this.antibodies().find((a) => a.id === abId) : null;
    const markers = [
      ...this.ihc(id).markers,
      emptyIhcMarker(ab ? { code: ab.code, name: ab.name } : undefined),
    ];
    this.patchIhc(id, { markers });
    this.setSelectedAntibody(id, null);
  }

  protected removeIhcMarker(id: number, index: number): void {
    const markers = this.ihc(id).markers.filter((_, i) => i !== index);
    this.patchIhc(id, { markers });
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
    if (profile === 'Ihc') {
      this.saveIhc(item);
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

  private saveIhc(item: ResultWorkItem): void {
    const data = this.ihc(item.visitServiceId);
    if (!ihcWorksheetValid(data)) {
      this.error.set(`Enter at least one marker result or interpretation for ${item.serviceName}.`);
      return;
    }
    this.savingId.set(item.visitServiceId);
    this.error.set('');
    this.api
      .saveResult({
        visitServiceId: item.visitServiceId,
        resultText: serializeIhcWorksheet(data),
        enteredByName: this.enteredBy || null,
        source: 'InHouse',
        parameterName: 'IHC worksheet',
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
