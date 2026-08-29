import { HttpClient, HttpParams } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ApiEnvelope, Id } from '../models';

type ParamValue = string | number | boolean | null | undefined;

/** Most endpoints answer `{ data, success, message }`; a few answer the bare payload. */
function unwrap<T>(body: T | ApiEnvelope<T>): T {
  if (body && typeof body === 'object' && 'data' in (body as ApiEnvelope<T>)) {
    return (body as ApiEnvelope<T>).data as T;
  }
  return body as T;
}

function toParams(query?: Record<string, ParamValue>): HttpParams | undefined {
  if (!query) return undefined;
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === '') continue;
    params = params.set(key, String(value));
  }
  return params;
}

/**
 * Thin transport layer over `HttpClient`. It owns the base URL and the
 * response-envelope convention so no feature has to know about either.
 */
@Service()
export class Api {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  get<T>(path: string, query?: Record<string, ParamValue>): Observable<T> {
    return this.http
      .get<T | ApiEnvelope<T>>(this.url(path), { params: toParams(query) })
      .pipe(map(unwrap<T>));
  }

  post<T>(path: string, body: unknown = {}, query?: Record<string, ParamValue>): Observable<T> {
    return this.http
      .post<T | ApiEnvelope<T>>(this.url(path), body, { params: toParams(query) })
      .pipe(map(unwrap<T>));
  }

  put<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.put<T | ApiEnvelope<T>>(this.url(path), body).pipe(map(unwrap<T>));
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T | ApiEnvelope<T>>(this.url(path)).pipe(map(unwrap<T>));
  }

  private url(path: string): string {
    return `${this.base}/${path.replace(/^\/+/, '')}`;
  }
}

/**
 * The CRUD shape every module in the collection repeats:
 * `POST /X` create, `POST /X/Search` list, `GET /X/{id}`, `PUT /X/{id}`, `DELETE /X/{id}`.
 */
export class CrudEndpoint<T, TFilter = Record<string, unknown>> {
  constructor(
    private readonly api: Api,
    readonly resource: string,
  ) {}

  search(filter: TFilter | Record<string, unknown> = {}): Observable<T[]> {
    return this.api.post<T[]>(`${this.resource}/Search`, filter);
  }

  byId(id: Id): Observable<T> {
    return this.api.get<T>(`${this.resource}/${id}`);
  }

  create(payload: Partial<T>): Observable<T> {
    return this.api.post<T>(this.resource, payload);
  }

  update(id: Id, payload: Partial<T>): Observable<T> {
    return this.api.put<T>(`${this.resource}/${id}`, payload);
  }

  remove(id: Id): Observable<unknown> {
    return this.api.delete<unknown>(`${this.resource}/${id}`);
  }

  /** `GET /X/By.../{no}` lookups, e.g. `ByInvoiceNo`. */
  byDocumentNo(segment: string, documentNo: string): Observable<T> {
    return this.api.get<T>(`${this.resource}/${segment}/${encodeURIComponent(documentNo)}`);
  }
}

/** Convenience for services: `private readonly items = endpoint<Item>('ItemRegistration');` */
export function endpoint<T, TFilter = Record<string, unknown>>(
  resource: string,
): CrudEndpoint<T, TFilter> {
  return new CrudEndpoint<T, TFilter>(inject(Api), resource);
}
