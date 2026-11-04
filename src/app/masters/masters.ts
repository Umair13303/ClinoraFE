import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Dialog } from 'primeng/dialog';
import { Editor } from 'primeng/editor';
import { FloatLabel } from 'primeng/floatlabel';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { MultiSelect } from 'primeng/multiselect';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { ToggleSwitch } from 'primeng/toggleswitch';

import {
  ClinicApi,
  LookupItem,
  OutsideLab,
  RadiologyTemplate,
  SampleSetup,
  ServiceAdmin,
  ServiceParameter,
} from '../clinic-api';
import { plainToEditorHtml, radiologyEditorModules, stripHtml } from '../rich-text';

type Tab = 'services' | 'lookups' | 'radiology' | 'narrative';
type LookupKind = 'sample-types' | 'containers' | 'bottle-colors' | 'sample-groups';

@Component({
  selector: 'app-masters',
  imports: [
    FormsModule,
    DecimalPipe,
    Button,
    Card,
    Dialog,
    Editor,
    FloatLabel,
    IconField,
    InputIcon,
    InputNumber,
    InputText,
    Message,
    MultiSelect,
    Select,
    SelectButton,
    TableModule,
    Tag,
    ToggleSwitch,
  ],
  templateUrl: './masters.html',
  styleUrl: './masters.css',
})
export class Masters implements OnInit {
  private readonly api = inject(ClinicApi);
  private readonly router = inject(Router);

  protected readonly tab = signal<Tab>('services');
  protected readonly services = signal<ServiceAdmin[]>([]);
  protected readonly templates = signal<RadiologyTemplate[]>([]);
  protected readonly narrativeTemplates = signal<RadiologyTemplate[]>([]);
  protected readonly setup = signal<SampleSetup | null>(null);
  protected templateProfile: 'Radiology' | 'Narrative' = 'Radiology';
  protected readonly error = signal('');
  protected readonly info = signal('');
  protected readonly saving = signal(false);
  protected readonly loading = signal(true);
  protected readonly editorOpen = signal(false);
  protected readonly templateEditorOpen = signal(false);
  protected readonly serviceQuery = signal('');
  protected readonly pathwayFilter = signal<string | null>(null);

  protected editing: ServiceAdmin | null = null;
  protected editingTemplate: RadiologyTemplate | null = null;
  protected paramDraft: ServiceParameter = emptyParam();
  protected lookupKind: LookupKind = 'sample-types';
  protected lookupCode = '';
  protected lookupName = '';
  protected labName = '';
  protected labPhone = '';

  protected readonly tabOptions = [
    { label: 'Services', value: 'services', icon: 'pi pi-list' },
    { label: 'Radiology', value: 'radiology', icon: 'pi pi-image' },
    { label: 'Histo templates', value: 'narrative', icon: 'pi pi-file-edit' },
    { label: 'Lookups', value: 'lookups', icon: 'pi pi-database' },
  ];

  protected readonly modalities = [
    { label: 'X-Ray', value: 'XRay' },
    { label: 'Ultrasound', value: 'Ultrasound' },
    { label: 'CT', value: 'CT' },
    { label: 'MRI', value: 'MRI' },
    { label: 'Other', value: 'Other' },
  ];

  protected readonly narrativeModalities = [
    { label: 'Histopathology', value: 'Histo' },
    { label: 'Cytology', value: 'Cyto' },
    { label: 'Other', value: 'Other' },
  ];

  protected readonly reportProfiles = [
    { label: 'Standard (table)', value: 'Standard' },
    { label: 'Narrative (histo/cyto)', value: 'Narrative' },
    { label: 'Semen worksheet', value: 'Semen' },
  ];

  protected readonly editorModules = radiologyEditorModules;

  protected readonly pathways = [
    { label: 'Laboratory', value: 'Laboratory' },
    { label: 'Radiology', value: 'Radiology' },
    { label: 'Consultation', value: 'Consultation' },
  ];

  protected readonly pathwayFilterOptions: Array<{ label: string; value: string | null }> = [
    { label: 'All pathways', value: null },
    { label: 'Laboratory', value: 'Laboratory' },
    { label: 'Radiology', value: 'Radiology' },
    { label: 'Consultation', value: 'Consultation' },
  ];

  protected readonly lookupKinds: Array<{ label: string; value: LookupKind; icon: string }> = [
    { label: 'Sample types', value: 'sample-types', icon: 'pi pi-tint' },
    { label: 'Containers', value: 'containers', icon: 'pi pi-box' },
    { label: 'Bottle colors', value: 'bottle-colors', icon: 'pi pi-palette' },
    { label: 'Sample groups', value: 'sample-groups', icon: 'pi pi-objects-column' },
  ];

  protected readonly filteredServices = computed(() => {
    const q = this.serviceQuery().trim().toLowerCase();
    const pathway = this.pathwayFilter();
    return this.services().filter((s) => {
      if (pathway && s.pathway !== pathway) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.pathway.toLowerCase().includes(q)
      );
    });
  });

  protected readonly stats = computed(() => {
    const list = this.services();
    const setup = this.setup();
    return {
      services: list.length,
      lab: list.filter((s) => s.pathway === 'Laboratory').length,
      radiology: list.filter((s) => s.pathway === 'Radiology').length,
      consultation: list.filter((s) => s.pathway === 'Consultation').length,
      templates: this.templates().length,
      narrativeTemplates: this.narrativeTemplates().length,
      semen: list.filter((s) => s.reportProfile === 'Semen').length,
      narrative: list.filter((s) => s.reportProfile === 'Narrative').length,
      lookups:
        (setup?.sampleTypes.length ?? 0) +
        (setup?.containers.length ?? 0) +
        (setup?.bottleColors.length ?? 0) +
        (setup?.sampleGroups.length ?? 0),
      outsideLabs: setup?.outsideLabs.length ?? 0,
    };
  });

  protected readonly radiologyServices = computed(() =>
    this.services()
      .filter((s) => s.pathway === 'Radiology' && s.status)
      .map((s) => ({ label: s.name, value: s.id })),
  );

  protected readonly narrativeServices = computed(() =>
    this.services()
      .filter((s) => s.pathway === 'Laboratory' && s.reportProfile === 'Narrative' && s.status)
      .map((s) => ({ label: s.name, value: s.id })),
  );

  ngOnInit(): void {
    if (!sessionStorage.getItem('clinora.auth')) {
      void this.router.navigateByUrl('/login');
      return;
    }
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set('');
    let pending = 4;
    const done = () => {
      pending -= 1;
      if (pending <= 0) {
        this.loading.set(false);
      }
    };
    this.api.adminServices().subscribe({
      next: (list) => {
        this.services.set(list);
        done();
      },
      error: () => {
        this.error.set('Could not load services.');
        done();
      },
    });
    this.api.sampleSetup().subscribe({
      next: (setup) => {
        this.setup.set(setup);
        done();
      },
      error: () => {
        this.error.set('Could not load lookups.');
        done();
      },
    });
    this.api.radiologyTemplatesAll('Radiology').subscribe({
      next: (list) => {
        this.templates.set(list);
        done();
      },
      error: () => {
        this.error.set('Could not load radiology templates.');
        done();
      },
    });
    this.api.radiologyTemplatesAll('Narrative').subscribe({
      next: (list) => {
        this.narrativeTemplates.set(list);
        done();
      },
      error: () => {
        this.error.set('Could not load narrative templates.');
        done();
      },
    });
  }

  protected startNew(): void {
    this.editing = {
      id: 0,
      name: '',
      category: 'Laboratory',
      fee: 0,
      normalMinutes: 60,
      urgentMinutes: 30,
      pathway: 'Laboratory',
      reportProfile: 'Standard',
      sampleTypeId: null,
      containerId: null,
      bottleColorId: null,
      sampleGroupId: null,
      sampleGroupCode: null,
      canSendOut: false,
      defaultOutsideLabId: null,
      status: true,
      parameters: [],
    };
    this.paramDraft = emptyParam();
    this.editorOpen.set(true);
  }

  protected edit(service: ServiceAdmin): void {
    this.editing = {
      ...service,
      parameters: [...(service.parameters ?? [])],
    };
    this.paramDraft = emptyParam();
    this.editorOpen.set(true);
  }

  protected closeEditor(): void {
    this.editorOpen.set(false);
    this.editing = null;
  }

  protected onEditorVisible(visible: boolean): void {
    if (!visible) {
      this.closeEditor();
    }
  }

  protected onPathwayChange(pathway: string): void {
    if (!this.editing) {
      return;
    }
    this.editing.pathway = pathway;
    if (!this.editing.category || this.editing.category === 'Laboratory' || this.editing.category === 'Radiology' || this.editing.category === 'Consultation') {
      this.editing.category = pathway;
    }
    if (pathway === 'Radiology') {
      this.editing.reportProfile = 'Radiology';
    } else if (pathway === 'Consultation') {
      this.editing.reportProfile = 'Standard';
    } else if (!this.editing.reportProfile || this.editing.reportProfile === 'Radiology') {
      this.editing.reportProfile = 'Standard';
    }
  }

  protected profileSeverity(profile: string | null | undefined): 'success' | 'info' | 'warn' | 'secondary' {
    switch (profile) {
      case 'Narrative':
        return 'warn';
      case 'Semen':
        return 'info';
      case 'Radiology':
        return 'secondary';
      default:
        return 'success';
    }
  }

  protected addParam(): void {
    if (!this.editing || !this.paramDraft.name.trim()) {
      return;
    }
    this.editing.parameters = [
      ...this.editing.parameters,
      {
        ...this.paramDraft,
        name: this.paramDraft.name.trim(),
        unit: this.paramDraft.unit?.trim() || null,
        sortOrder: this.editing.parameters.length + 1,
      },
    ];
    this.paramDraft = emptyParam();
  }

  protected removeParam(index: number): void {
    if (!this.editing) {
      return;
    }
    this.editing.parameters = this.editing.parameters.filter((_, i) => i !== index);
  }

  protected saveService(): void {
    if (!this.editing || this.editing.name.trim().length < 2) {
      this.error.set('Service name is required.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.info.set('');
    const body = {
      ...this.editing,
      name: this.editing.name.trim(),
      status: this.editing.status,
    };
    const req =
      this.editing.id > 0
        ? this.api.updateAdminService(this.editing.id, body)
        : this.api.createAdminService(body);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.info.set('Service saved.');
        this.closeEditor();
        this.reload();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(typeof err.error?.message === 'string' ? err.error.message : 'Save failed.');
      },
    });
  }

  protected lookupItems(): LookupItem[] {
    const setup = this.setup();
    if (!setup) {
      return [];
    }
    switch (this.lookupKind) {
      case 'sample-types':
        return setup.sampleTypes;
      case 'containers':
        return setup.containers;
      case 'bottle-colors':
        return setup.bottleColors;
      case 'sample-groups':
        return setup.sampleGroups;
    }
  }

  protected lookupKindLabel(): string {
    return this.lookupKinds.find((k) => k.value === this.lookupKind)?.label ?? 'Lookup';
  }

  protected saveLookup(): void {
    if (!this.lookupCode.trim() || !this.lookupName.trim()) {
      this.error.set('Lookup code and name are required.');
      return;
    }
    this.saving.set(true);
    this.info.set('');
    this.api
      .upsertLookup(this.lookupKind, {
        code: this.lookupCode.trim(),
        name: this.lookupName.trim(),
        status: true,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.info.set(`${this.lookupKindLabel()} saved.`);
          this.lookupCode = '';
          this.lookupName = '';
          this.reload();
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(typeof err.error?.message === 'string' ? err.error.message : 'Lookup save failed.');
        },
      });
  }

  protected saveLab(): void {
    if (!this.labName.trim()) {
      this.error.set('Outside lab name is required.');
      return;
    }
    this.saving.set(true);
    this.info.set('');
    this.api
      .upsertOutsideLab({
        name: this.labName.trim(),
        phone: this.labPhone.trim() || null,
        status: true,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.info.set('Outside lab saved.');
          this.labName = '';
          this.labPhone = '';
          this.reload();
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(typeof err.error?.message === 'string' ? err.error.message : 'Lab save failed.');
        },
      });
  }

  protected labs(): OutsideLab[] {
    return this.setup()?.outsideLabs ?? [];
  }

  protected pathwaySeverity(pathway: string): 'success' | 'info' | 'warn' | 'secondary' {
    switch (pathway) {
      case 'Laboratory':
        return 'info';
      case 'Radiology':
        return 'warn';
      case 'Consultation':
        return 'success';
      default:
        return 'secondary';
    }
  }

  protected templatePreview(body: string | null | undefined): string {
    const plain = stripHtml(body);
    return plain.length > 120 ? plain.slice(0, 120) + '…' : plain;
  }

  protected startNewTemplate(profile: 'Radiology' | 'Narrative' = 'Radiology'): void {
    this.templateProfile = profile;
    this.editingTemplate = {
      id: 0,
      name: '',
      modality: profile === 'Narrative' ? 'Histo' : 'XRay',
      profile,
      serviceIds: [],
      serviceNames: [],
      serviceName: null,
      body: '',
      status: true,
    };
    this.templateEditorOpen.set(true);
  }

  protected editTemplate(template: RadiologyTemplate): void {
    this.templateProfile = template.profile === 'Narrative' ? 'Narrative' : 'Radiology';
    this.editingTemplate = {
      ...template,
      profile: this.templateProfile,
      serviceIds: [...(template.serviceIds ?? [])],
      serviceNames: [...(template.serviceNames ?? [])],
      body: plainToEditorHtml(template.body),
    };
    this.templateEditorOpen.set(true);
  }

  protected templateServiceOptions(): Array<{ label: string; value: number }> {
    return this.templateProfile === 'Narrative' ? this.narrativeServices() : this.radiologyServices();
  }

  protected templateModalityOptions(): Array<{ label: string; value: string }> {
    return this.templateProfile === 'Narrative' ? this.narrativeModalities : this.modalities;
  }

  protected closeTemplateEditor(): void {
    this.templateEditorOpen.set(false);
    this.editingTemplate = null;
  }

  protected onTemplateEditorVisible(visible: boolean): void {
    if (!visible) {
      this.closeTemplateEditor();
    }
  }

  protected saveTemplate(): void {
    if (!this.editingTemplate) {
      return;
    }
    const name = this.editingTemplate.name.trim();
    const body = (this.editingTemplate.body || '').trim();
    if (name.length < 2 || stripHtml(body).length < 2) {
      this.error.set('Template name and body are required.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.info.set('');
    const payload = {
      name,
      modality: this.editingTemplate.modality,
      profile: this.templateProfile,
      serviceIds: this.editingTemplate.serviceIds ?? [],
      body,
      status: this.editingTemplate.status,
    };
    const req =
      this.editingTemplate.id > 0
        ? this.api.updateRadiologyTemplate(this.editingTemplate.id, payload)
        : this.api.createRadiologyTemplate(payload);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.info.set('Radiology template saved.');
        this.closeTemplateEditor();
        this.reload();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(typeof err.error?.message === 'string' ? err.error.message : 'Template save failed.');
      },
    });
  }
}

function emptyParam(): ServiceParameter {
  return { id: 0, name: '', unit: null, refLow: null, refHigh: null, sortOrder: 0 };
}
