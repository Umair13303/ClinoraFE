import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Textarea } from 'primeng/textarea';

import { ClinicApi, ResultWorkItem } from '../clinic-api';
import { readPref, writePref } from './station-prefs';

@Component({
  selector: 'app-results-station',
  imports: [FormsModule, Button, InputText, Message, Textarea],
  templateUrl: './results-station.html',
})
export class ResultsStation implements OnInit {
  private readonly api = inject(ClinicApi);
  private readonly router = inject(Router);

  protected readonly items = signal<ResultWorkItem[]>([]);
  protected readonly drafts = signal<Record<number, { text: string; units: string; range: string }>>({});
  protected readonly filter = signal('');
  protected readonly error = signal('');
  protected readonly info = signal('');
  protected readonly savingId = signal<number | null>(null);
  protected enteredBy = readPref('enteredBy');

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

  protected reload(): void {
    this.error.set('');
    this.api.resultsWorklist().subscribe({
      next: (items) => {
        this.items.set(items);
        const drafts: Record<number, { text: string; units: string; range: string }> = {};
        for (const item of items) {
          drafts[item.visitServiceId] = {
            text: item.existingResultText ?? '',
            units: '',
            range: '',
          };
        }
        this.drafts.set(drafts);
      },
      error: () => this.error.set('Could not load result worklist.'),
    });
  }

  protected draft(id: number) {
    return this.drafts()[id] ?? { text: '', units: '', range: '' };
  }

  protected patch(id: number, patch: Partial<{ text: string; units: string; range: string }>): void {
    this.drafts.update((map) => ({ ...map, [id]: { ...this.draft(id), ...patch } }));
  }

  protected onEnteredBy(value: string): void {
    this.enteredBy = value;
    writePref('enteredBy', value);
  }

  protected save(item: ResultWorkItem, event?: Event): void {
    event?.preventDefault();
    const d = this.draft(item.visitServiceId);
    if (!d.text.trim()) {
      this.error.set(`Enter result for ${item.serviceName}.`);
      return;
    }
    this.savingId.set(item.visitServiceId);
    this.error.set('');
    writePref('enteredBy', this.enteredBy);
    this.api
      .saveResult({
        visitServiceId: item.visitServiceId,
        resultText: d.text.trim(),
        units: d.units.trim() || null,
        referenceRange: d.range.trim() || null,
        enteredByName: this.enteredBy || null,
        source: 'InHouse',
      })
      .subscribe({
        next: () => {
          this.savingId.set(null);
          this.info.set(`Saved ${item.serviceName} · ${item.visitNumber}`);
          this.reload();
        },
        error: (err) => {
          this.savingId.set(null);
          this.error.set(typeof err.error?.message === 'string' ? err.error.message : 'Save failed.');
        },
      });
  }
}
