import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Divider } from 'primeng/divider';
import { Message } from 'primeng/message';
import { ProgressBar } from 'primeng/progressbar';
import { Skeleton } from 'primeng/skeleton';
import { Tag } from 'primeng/tag';

import { roleAllowsStation } from '../auth/station-guard';
import { readAuth } from '../branch-context';
import { ClinicApi, WorklistSummary } from '../clinic-api';

type MetricTone = 'teal' | 'sky' | 'amber' | 'violet' | 'rose' | 'slate';

type MetricCard = {
  key: string;
  label: string;
  hint: string;
  value: number;
  route: string;
  icon: string;
  tone: MetricTone;
  alert?: boolean;
};

@Component({
  selector: 'app-dashboard',
  imports: [
    Button,
    Card,
    Divider,
    Message,
    ProgressBar,
    Skeleton,
    Tag,
    RouterLink,
    DatePipe,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  private readonly api = inject(ClinicApi);
  private readonly router = inject(Router);

  protected readonly summary = signal<WorklistSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly refreshedAt = signal<Date | null>(null);
  protected readonly userName = signal('Team');

  protected readonly metrics = computed<MetricCard[]>(() => {
    const s = this.summary();
    if (!s) {
      return [];
    }
    const roleId = readAuth()?.roleId;
    const all: Array<MetricCard & { station: string }> = [
      {
        key: 'collection',
        label: 'Awaiting collection',
        hint: 'Phlebotomy queue',
        value: s.awaitingCollection,
        route: '/collection',
        icon: 'pi pi-inbox',
        tone: 'teal',
        station: 'Phlebotomy',
      },
      {
        key: 'collected',
        label: 'Awaiting receive',
        hint: 'Lab receiving queue',
        value: s.collected ?? 0,
        route: '/receiving',
        icon: 'pi pi-qrcode',
        tone: 'amber',
        station: 'Lab',
      },
      {
        key: 'inLab',
        label: 'In lab',
        hint: 'Result entry pending',
        value: s.inLab,
        route: '/results',
        icon: 'pi pi-flask',
        tone: 'sky',
        station: 'Lab',
      },
      {
        key: 'sentOut',
        label: 'Sent out',
        hint: 'Outside lab shipments',
        value: s.sentOut,
        route: '/outside-lab',
        icon: 'pi pi-send',
        tone: 'amber',
        station: 'Lab',
      },
      {
        key: 'finalize',
        label: 'Awaiting finalize',
        hint: 'Doctor sign-off',
        value: s.awaitingFinalize,
        route: '/finalize',
        icon: 'pi pi-verified',
        tone: 'violet',
        station: 'Doctor',
      },
      {
        key: 'radiology',
        label: 'Radiology',
        hint: 'Imaging worklist',
        value: s.radiology,
        route: '/radiology',
        icon: 'pi pi-image',
        tone: 'slate',
        station: 'Radiology',
      },
      {
        key: 'reports',
        label: 'Report collection',
        hint: 'Print / handover desk',
        value: 0,
        route: '/reports',
        icon: 'pi pi-print',
        tone: 'teal',
        station: 'FrontDesk',
      },
      {
        key: 'overdue',
        label: 'Outside overdue',
        hint: 'Past expected return',
        value: s.outsideOverdue,
        route: '/outside-lab',
        icon: 'pi pi-exclamation-triangle',
        tone: 'rose',
        alert: s.outsideOverdue > 0,
        station: 'Lab',
      },
    ];
    return all
      .filter((m) => roleAllowsStation(m.station, roleId))
      .map(({ station: _station, ...card }) => card);
  });

  protected readonly totalOpen = computed(() =>
    this.metrics().reduce((sum, m) => sum + (m.key === 'overdue' ? 0 : m.value), 0),
  );

  protected readonly attentionCount = computed(
    () =>
      this.metrics().filter(
        (m) =>
          m.value > 0 &&
          (m.alert || m.key === 'collection' || m.key === 'collected' || m.key === 'finalize'),
      ).length,
  );

  protected readonly queueShare = computed(() => {
    const total = Math.max(this.totalOpen(), 1);
    const s = this.summary();
    if (!s) {
      return [];
    }
    return [
      { label: 'Collection', value: s.awaitingCollection, tone: 'teal' },
      { label: 'Receive', value: s.collected ?? 0, tone: 'amber' },
      { label: 'In lab', value: s.inLab, tone: 'sky' },
      { label: 'Sent out', value: s.sentOut, tone: 'slate' },
      { label: 'Finalize', value: s.awaitingFinalize, tone: 'violet' },
      { label: 'Radiology', value: s.radiology, tone: 'slate' },
    ].map((row) => ({ ...row, pct: Math.round((row.value / total) * 100) }));
  });

  ngOnInit(): void {
    if (!sessionStorage.getItem('clinora.auth')) {
      void this.router.navigateByUrl('/login');
      return;
    }
    const auth = readAuth();
    this.userName.set((auth?.name || 'Team').split(' ')[0] || 'Team');
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.worklistSummary().subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.refreshedAt.set(new Date());
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load dashboard summary.');
        this.loading.set(false);
      },
    });
  }

  protected severityFor(card: MetricCard): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    if (card.alert && card.value > 0) {
      return 'danger';
    }
    if (card.value === 0) {
      return 'success';
    }
    if (card.tone === 'amber' || card.tone === 'violet') {
      return 'warn';
    }
    return 'info';
  }

  protected tagLabel(card: MetricCard): string {
    if (card.alert && card.value > 0) {
      return 'Needs attention';
    }
    if (card.value === 0) {
      return 'Clear';
    }
    return 'In queue';
  }
}
