import { Service, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../services/api';
import { hueOf } from '../util/format';
import type { AuthTokens, LoginRequest, SessionUser } from '../models';

const TOKEN_KEY = 'aurora-pos.session';

interface StoredSession {
  tokens: AuthTokens;
  user: SessionUser;
}

function readStored(): StoredSession | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

/** Owns the signed-in session: tokens, the current user, and sign-in/out. */
@Service()
export class AuthService {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  private readonly session = signal<StoredSession | null>(readStored());

  readonly user = computed(() => this.session()?.user ?? null);
  readonly token = computed(() => this.session()?.tokens.token ?? null);
  readonly refreshToken = computed(() => this.session()?.tokens.refreshToken ?? null);
  readonly isAuthenticated = computed(() => !!this.session());
  readonly busy = signal(false);

  async login(credentials: LoginRequest): Promise<void> {
    this.busy.set(true);
    try {
      const tokens = await firstValueFrom(
        this.api.post<AuthTokens>('Authentication/Login', credentials),
      );
      this.persist(tokens, credentials.username);
    } finally {
      this.busy.set(false);
    }
  }

  /** Explores the app with the read-only guest token the API exposes. */
  async loginAsGuest(): Promise<void> {
    this.busy.set(true);
    try {
      const tokens = await firstValueFrom(
        this.api.post<AuthTokens>('Authentication/guest-token', {}),
      );
      this.persist(tokens, tokens.userName ?? 'guest');
    } finally {
      this.busy.set(false);
    }
  }

  async forgotPassword(userName: string): Promise<void> {
    await firstValueFrom(this.api.post('Authentication/forgot-password', {}, { userName }));
  }

  async logout(): Promise<void> {
    const refreshToken = this.refreshToken();
    this.clear();
    await this.router.navigate(['/login']);
    if (refreshToken) {
      // Best-effort revoke; the local session is already gone either way.
      this.api.post('Authentication/logout', { refreshToken }).subscribe({ error: () => {} });
    }
  }

  clear(): void {
    this.session.set(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }

  private persist(tokens: AuthTokens, fallbackName: string): void {
    const userName = tokens.userName ?? fallbackName;
    const user: SessionUser = {
      id: tokens.userId ?? 1,
      userName,
      displayName: tokens.displayName ?? userName,
      role: tokens.roles?.[0] ?? 'Administrator',
      avatarHue: hueOf(userName),
    };
    const session: StoredSession = { tokens, user };
    this.session.set(session);
    try {
      localStorage.setItem(TOKEN_KEY, JSON.stringify(session));
    } catch {
      /* ignore */
    }
  }
}
