import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';

import { API_BASE_URL } from '../app.config';
import { cacheClinicSettings } from '../auth/station-guard';
import { ClinicApi } from '../clinic-api';
import { cacheClinicLetterhead } from '../print/print';

type LoginResponse = {
  token: string;
  userId: number;
  email: string | null;
  name: string | null;
  branchId: number | null;
  companyId: number | null;
  userTypeId: number;
  roleId: number;
};

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, Button, InputText, Message],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_BASE_URL);
  private readonly clinicApi = inject(ClinicApi);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly submitting = signal(false);
  protected readonly error = signal('');

  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['admin@clinora.local', [Validators.required, Validators.email]],
    password: ['Admin@123', [Validators.required, Validators.minLength(4)]],
  });

  protected submit(): void {
    this.error.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Enter a valid email and password.');
      return;
    }

    this.submitting.set(true);
    const { email, password } = this.form.getRawValue();

    this.http
      .post<LoginResponse>(`${this.api}/api/ApplicationConfiguration/COMAuthentication/UserLogin_Validation`, {
        email,
        password,
      })
      .subscribe({
        next: (payload) => {
          sessionStorage.setItem(
            'clinora.auth',
            JSON.stringify({
              token: payload.token,
              name: payload.name,
              email: payload.email,
              roleId: payload.roleId,
              branchId: payload.branchId,
              userTypeId: payload.userTypeId,
            }),
          );
          if (payload.branchId) {
            sessionStorage.setItem('clinora.branchId', String(payload.branchId));
          }
          this.clinicApi.clinicSettings().subscribe({
            next: (settings) => {
              cacheClinicSettings(settings);
              cacheClinicLetterhead(settings);
              this.submitting.set(false);
              void this.router.navigateByUrl('/dashboard');
            },
            error: () => {
              this.submitting.set(false);
              void this.router.navigateByUrl('/dashboard');
            },
          });
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          const message =
            typeof err.error?.message === 'string'
              ? err.error.message
              : err.status === 0
                ? 'Cannot reach the Clinora API. Is it running on port 5013?'
                : 'Invalid email or password.';
          this.error.set(message);
        },
      });
  }
}
