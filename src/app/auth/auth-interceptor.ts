import { HttpInterceptorFn } from '@angular/common/http';

const BRANCH_KEY = 'clinora.branchId';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const headers: Record<string, string> = {};

  const raw = sessionStorage.getItem('clinora.auth');
  if (raw) {
    try {
      const auth = JSON.parse(raw) as { token?: string };
      if (auth.token) {
        headers['Authorization'] = `Bearer ${auth.token}`;
      }
    } catch {
      /* ignore bad auth blob */
    }
  }

  const branchRaw = sessionStorage.getItem(BRANCH_KEY);
  if (branchRaw && Number(branchRaw) > 0) {
    headers['X-Branch-Id'] = branchRaw;
  }

  if (Object.keys(headers).length === 0) {
    return next(req);
  }

  return next(req.clone({ setHeaders: headers }));
};
