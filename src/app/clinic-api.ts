import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import { API_BASE_URL } from './app.config';

export type ClinicService = {
  id: number;
  name: string;
  category: string;
  fee: number;
  normalMinutes: number;
  urgentMinutes: number;
  pathway: string;
  sampleTypeId: number | null;
  containerId: number | null;
  bottleColorId: number | null;
  sampleGroupId: number | null;
  sampleGroupCode: string | null;
  canSendOut: boolean;
  defaultOutsideLabId: number | null;
};

export type StaffMember = {
  id: number;
  name: string;
  department: string | null;
};

export type PatientSummary = {
  id: number;
  fullName: string;
  phone: string;
  age: number;
  gender: string;
  cnic: string | null;
  passportNo: string | null;
  photoUrl: string | null;
  isPanel: boolean;
  panelName: string | null;
  visitCount: number;
};

export type VisitSummary = {
  id: number;
  visitNumber: string;
  patientId: number;
  patientName: string;
  referredBy: string | null;
  panelName: string | null;
  net: number;
  createdAt: string;
};

export type CreateVisitRequest = {
  patientId?: number | null;
  fullName?: string | null;
  phone?: string | null;
  age?: number | null;
  gender?: string | null;
  cnic?: string | null;
  passportNo?: string | null;
  photoBase64?: string | null;
  isPanel: boolean;
  panelName?: string | null;
  percentOff: number;
  visitOff: number;
  amountReceived: number;
  paymentReceived: boolean;
  isReferred: boolean;
  referredBy?: string | null;
  slipNo?: string | null;
  notes?: string | null;
  services: Array<{
    serviceId: number;
    discount: number;
    urgent: boolean;
    staffId?: number | null;
    staffName?: string | null;
    readyBy?: string | null;
  }>;
};

export type VisitReceipt = {
  id: number;
  visitNumber: string;
  patientName: string;
  net: number;
  amountReceived: number;
  createdAt: string;
};

export type LookupItem = { id: number; code: string; name: string };
export type OutsideLab = { id: number; name: string; phone: string | null };

export type SampleSetup = {
  sampleTypes: LookupItem[];
  containers: LookupItem[];
  bottleColors: LookupItem[];
  sampleGroups: LookupItem[];
  outsideLabs: OutsideLab[];
};

export type CollectionLine = {
  visitServiceId: number;
  visitId: number;
  visitNumber: string;
  patientName: string;
  phone: string;
  serviceId: number;
  serviceName: string;
  urgent: boolean;
  status: string;
  sampleGroupId: number | null;
  sampleGroupCode: string | null;
  sampleGroupName: string | null;
  sampleTypeId: number | null;
  sampleTypeName: string | null;
  containerId: number | null;
  containerName: string | null;
  bottleColorId: number | null;
  bottleColorName: string | null;
  canSendOut: boolean;
  defaultOutsideLabId: number | null;
};

export type CollectionGroup = {
  visitId: number;
  visitNumber: string;
  patientName: string;
  sampleGroupId: number | null;
  groupKey: string;
  groupLabel: string;
  sampleTypeName: string | null;
  containerName: string | null;
  bottleColorName: string | null;
  canSendOut: boolean;
  lines: CollectionLine[];
};

export type SampleBarcode = {
  sampleId: number;
  barcode: string;
  visitNumber: string;
  patientName: string;
  sampleTypeName: string;
  containerName: string;
  bottleColorName: string;
  sampleGroupName: string | null;
  isSendOut: boolean;
  outsideLabName: string | null;
  collectedAt: string;
  tests: string[];
};

export type ResultWorkItem = {
  visitServiceId: number;
  visitId: number;
  visitNumber: string;
  patientName: string;
  serviceName: string;
  status: string;
  urgent: boolean;
  barcode?: string | null;
  isSendOut: boolean;
  existingResultText?: string | null;
};

export type RadiologyWorkItem = {
  visitServiceId: number;
  visitId: number;
  visitNumber: string;
  patientName: string;
  serviceName: string;
  status: string;
  urgent: boolean;
  readyBy: string | null;
};

export type ReportDto = {
  id: number;
  visitId: number;
  visitNumber: string;
  patientName: string;
  phone: string;
  age: number;
  gender: string;
  pathway: string;
  finalizedByName: string | null;
  finalizedAt: string;
  printCount: number;
  lines: Array<{
    serviceName: string;
    resultText: string | null;
    units: string | null;
    referenceRange: string | null;
    urgent: boolean;
  }>;
};

export type VisitSlips = {
  visitId: number;
  visitNumber: string;
  createdAt: string;
  patientName: string;
  phone: string;
  age: number;
  gender: string;
  referredBy: string | null;
  net: number;
  amountReceived: number;
  lines: Array<{
    serviceName: string;
    pathway: string;
    category: string;
    fee: number;
    urgent: boolean;
    readyBy: string | null;
    sampleTypeName: string | null;
    containerName: string | null;
    bottleColorName: string | null;
    status: string;
  }>;
};

export type SendOutSample = {
  sampleId: number;
  barcode: string;
  visitNumber: string;
  patientName: string;
  outsideLabId: number | null;
  outsideLabName: string | null;
  tests: string[];
};

export type Shipment = {
  id: number;
  outsideLabId: number;
  outsideLabName: string;
  status: string;
  awb: string | null;
  notes: string | null;
  sentAt: string;
  receivedAt: string | null;
  items: Array<{
    sampleId: number;
    barcode: string;
    visitServiceId: number;
    visitNumber: string;
    patientName: string;
    serviceName: string;
  }>;
};

@Injectable({ providedIn: 'root' })
export class ClinicApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  services(query = '') {
    let params = new HttpParams();
    if (query.trim()) {
      params = params.set('query', query.trim());
    }
    return this.http.get<ClinicService[]>(`${this.baseUrl}/api/services`, { params });
  }

  staff(query = '') {
    let params = new HttpParams();
    if (query.trim()) {
      params = params.set('query', query.trim());
    }
    return this.http.get<StaffMember[]>(`${this.baseUrl}/api/staff`, { params });
  }

  patients(query: string) {
    return this.http.get<PatientSummary[]>(`${this.baseUrl}/api/patients`, {
      params: new HttpParams().set('query', query),
    });
  }

  visits() {
    return this.http.get<VisitSummary[]>(`${this.baseUrl}/api/visits`);
  }

  createVisit(body: CreateVisitRequest) {
    return this.http.post<VisitReceipt>(`${this.baseUrl}/api/visits`, body);
  }

  visitSlips(visitId: number) {
    return this.http.get<VisitSlips>(`${this.baseUrl}/api/visits/${visitId}/slips`);
  }

  sampleSetup() {
    return this.http.get<SampleSetup>(`${this.baseUrl}/api/lookups/sample-setup`);
  }

  collectionWorklist(visitId?: number) {
    let params = new HttpParams();
    if (visitId) {
      params = params.set('visitId', String(visitId));
    }
    return this.http.get<CollectionGroup[]>(`${this.baseUrl}/api/worklist/collection`, { params });
  }

  collectSample(body: {
    visitId: number;
    visitServiceIds: number[];
    sampleTypeId: number;
    containerId: number;
    bottleColorId: number;
    sampleGroupId?: number | null;
    phlebotomistName?: string | null;
    isSendOut: boolean;
    outsideLabId?: number | null;
  }) {
    return this.http.post<SampleBarcode>(`${this.baseUrl}/api/samples/collect`, body);
  }

  sampleBarcode(id: number) {
    return this.http.get<SampleBarcode>(`${this.baseUrl}/api/samples/${id}/barcode`);
  }

  recentSamples() {
    return this.http.get<SampleBarcode[]>(`${this.baseUrl}/api/samples/recent`);
  }

  sendOutPending() {
    return this.http.get<SendOutSample[]>(`${this.baseUrl}/api/samples/send-out-pending`);
  }

  resultsWorklist() {
    return this.http.get<ResultWorkItem[]>(`${this.baseUrl}/api/worklist/results`);
  }

  finalizeWorklist() {
    return this.http.get<ResultWorkItem[]>(`${this.baseUrl}/api/worklist/finalize`);
  }

  radiologyWorklist() {
    return this.http.get<RadiologyWorkItem[]>(`${this.baseUrl}/api/worklist/radiology`);
  }

  saveResult(body: {
    visitServiceId: number;
    resultText: string;
    units?: string | null;
    referenceRange?: string | null;
    enteredByName?: string | null;
    source?: string;
  }) {
    return this.http.post<{ message: string }>(`${this.baseUrl}/api/results`, body);
  }

  finalizeReport(body: {
    visitId: number;
    visitServiceIds: number[];
    finalizedByName?: string | null;
    pathway: string;
  }) {
    return this.http.post<ReportDto>(`${this.baseUrl}/api/reports/finalize`, body);
  }

  report(id: number) {
    return this.http.get<ReportDto>(`${this.baseUrl}/api/reports/${id}`);
  }

  markReportPrinted(id: number) {
    return this.http.post<{ printCount: number }>(`${this.baseUrl}/api/reports/${id}/printed`, {});
  }

  radiologyComplete(body: { visitServiceId: number; findings?: string | null; performedByName?: string | null }) {
    return this.http.post<{ message: string }>(`${this.baseUrl}/api/radiology/complete`, body);
  }

  shipments() {
    return this.http.get<Shipment[]>(`${this.baseUrl}/api/outside-lab/shipments`);
  }

  createShipment(body: { outsideLabId: number; awb?: string | null; notes?: string | null; sampleIds: number[] }) {
    return this.http.post<Shipment>(`${this.baseUrl}/api/outside-lab/shipments`, body);
  }

  receiveShipment(
    id: number,
    body: {
      notes?: string | null;
      items: Array<{
        visitServiceId: number;
        resultText: string;
        units?: string | null;
        referenceRange?: string | null;
      }>;
    },
  ) {
    return this.http.post<Shipment>(`${this.baseUrl}/api/outside-lab/shipments/${id}/receive`, body);
  }

  mediaUrl(path: string | null | undefined): string | null {
    if (!path) {
      return null;
    }
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
      return path;
    }
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }
}
