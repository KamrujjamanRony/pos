import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { mockBackendInterceptor } from './core/http/mock-backend';
import {
  authInterceptor,
  errorInterceptor,
  progressInterceptor,
} from './core/http/interceptors';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
    ),
    provideHttpClient(
      // Order matters: progress wraps everything, auth stamps the token, the
      // error handler reports, and the mock backend terminates the chain.
      withInterceptors([
        progressInterceptor,
        authInterceptor,
        errorInterceptor,
        mockBackendInterceptor,
      ]),
    ),
  ],
};
