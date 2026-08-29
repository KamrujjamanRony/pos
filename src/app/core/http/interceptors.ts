import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject, signal } from '@angular/core';
import { catchError, finalize, throwError } from 'rxjs';
import { AuthService } from '../auth/auth';
import { ToastService } from '../services/toast';

/** Number of HTTP calls in flight, used by the top progress bar. */
export const inFlight = signal(0);

const ANONYMOUS = ['Authentication/Login', 'Authentication/guest-token', 'Authentication/refresh-token'];

/** Attaches the bearer token to everything except the anonymous auth endpoints. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();
  const anonymous = ANONYMOUS.some((path) => req.url.includes(path));

  const request =
    token && !anonymous
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(request);
};

/** Drives the global progress indicator. */
export const progressInterceptor: HttpInterceptorFn = (req, next) => {
  inFlight.update((n) => n + 1);
  return next(req).pipe(finalize(() => inFlight.update((n) => Math.max(0, n - 1))));
};

function describe(error: HttpErrorResponse): string {
  if (error.status === 0) return 'Cannot reach the server. Check that the API is running.';
  if (error.status === 401) return 'Your session has expired. Please sign in again.';
  if (error.status === 403) return 'You do not have permission to do that.';
  if (error.status === 404) return 'The requested record no longer exists.';
  const body: unknown = error.error;
  if (typeof body === 'string' && body.trim()) return body;
  const detail = body as { message?: string; title?: string } | null;
  return detail?.message ?? detail?.title ?? `Request failed (${error.status}).`;
}

/** Surfaces failures as a toast once, and signs the user out on a 401. */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const auth = inject(AuthService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const silent = req.headers.has('X-Silent');
      if (!silent) toast.error('Request failed', describe(error));
      if (error.status === 401 && auth.isAuthenticated()) void auth.logout();
      return throwError(() => error);
    }),
  );
};
