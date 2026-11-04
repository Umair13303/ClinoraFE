import { ApplicationConfig, InjectionToken, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { definePreset } from '@primeuix/themes';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { authInterceptor } from './auth/auth-interceptor';

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');

const ClinoraPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '{teal.50}',
      100: '{teal.100}',
      200: '{teal.200}',
      300: '{teal.300}',
      400: '{teal.400}',
      500: '{teal.500}',
      600: '{teal.600}',
      700: '{teal.700}',
      800: '{teal.800}',
      900: '{teal.900}',
      950: '{teal.950}',
    },
    colorScheme: {
      light: {
        surface: {
          0: '#ffffff',
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        formField: {
          background: '#ffffff',
          borderColor: '#d5dee6',
          hoverBorderColor: '#0f766e',
          focusBorderColor: '#0f766e',
          color: '#0f172a',
          placeholderColor: '#94a3b8',
          shadow: 'none',
          paddingX: '0.6rem',
          paddingY: '0.35rem',
          borderRadius: '0.5rem',
        },
        focusRing: {
          width: '1px',
          style: 'solid',
          color: 'color-mix(in srgb, {primary.500} 28%, transparent)',
          offset: '0px',
        },
      },
    },
  },
  components: {
    button: {
      root: {
        borderRadius: '0.5rem',
        paddingX: '0.7rem',
        paddingY: '0.35rem',
        sm: {
          fontSize: '0.75rem',
          paddingX: '0.55rem',
          paddingY: '0.25rem',
        },
        label: {
          fontWeight: '600',
        },
      },
    },
    selectbutton: {
      root: {
        borderRadius: '0.5rem',
      },
    },
    inputtext: {
      root: {
        borderRadius: '0.5rem',
      },
    },
    dialog: {
      root: {
        borderRadius: '0.85rem',
        shadow: '0 20px 48px rgba(15, 23, 42, 0.2)',
      },
    },
  },
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAnimationsAsync(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    providePrimeNG({
      ripple: true,
      theme: {
        preset: ClinoraPreset,
        options: {
          darkModeSelector: false,
          cssLayer: {
            name: 'primeng',
            order: 'theme, base, primeng',
          },
        },
      },
    }),
    { provide: API_BASE_URL, useValue: environment.apiUrl },
  ],
};
