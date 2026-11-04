import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const raw = sessionStorage.getItem('clinora.auth');
  if (!raw) {
    return next(req);
  }

  try {
    const auth = JSON.parse(raw) as { token?: string };
    if (!auth.token) {
      return next(req);
    }

    return next(
      req.clone({
        setHeaders: {
          Authorization: `Bearer ${auth.token}`,
        },
      }),
    );
  } catch {
    return next(req);
  }
};
