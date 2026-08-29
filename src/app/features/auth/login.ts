import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { form, required, submit } from '@angular/forms/signals';
import { FormField } from '@angular/forms/signals';
import { AuthService } from '../../core/auth/auth';
import { ToastService } from '../../core/services/toast';
import { ThemeService } from '../../core/services/theme';
import { UiAutofocus } from '../../shared/directives/motion';
import { UiButton } from '../../shared/ui/button';
import { UiIcon } from '../../shared/ui/icon';
import { UiField } from '../../shared/ui/primitives';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-login',
  imports: [FormField, UiButton, UiField, UiIcon, UiAutofocus],
  template: `
    <div class="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <!-- Brand panel -->
      <section
        class="relative hidden overflow-hidden bg-linear-to-br from-brand via-brand to-accent p-12 text-white lg:flex lg:flex-col"
        aria-hidden="true"
      >
        <div class="grid-dots absolute inset-0 opacity-[0.14]"></div>
        <div
          class="animate-float absolute -top-24 -right-16 size-96 rounded-full bg-white/10 blur-3xl"
        ></div>
        <div
          class="animate-float absolute -bottom-32 -left-20 size-[26rem] rounded-full bg-black/15 blur-3xl"
          style="animation-delay: -3s"
        ></div>

        <div class="relative flex items-center gap-3">
          <span class="grid size-11 place-items-center rounded-2xl bg-white/15 backdrop-blur">
            <ui-icon name="zap" [size]="22" />
          </span>
          <div>
            <p class="text-[17px] leading-tight font-semibold">Aurora POS</p>
            <p class="text-[12.5px] text-white/70">Retail operations platform</p>
          </div>
        </div>

        <div class="relative mt-auto max-w-lg">
          <h2 class="text-[34px] leading-[1.15] font-semibold tracking-tight">
            Every counter, every branch, one ledger.
          </h2>
          <p class="mt-4 text-[15px] leading-relaxed text-white/80">
            Ring up a sale, settle a supplier, move stock between branches and close the day — the
            books stay in balance without a second system.
          </p>

          <dl class="mt-10 grid grid-cols-3 gap-6">
            @for (metric of metrics; track metric.label) {
              <div>
                <dt class="text-[12px] tracking-wide text-white/60 uppercase">{{ metric.label }}</dt>
                <dd class="mt-1 text-[22px] font-semibold">{{ metric.value }}</dd>
              </div>
            }
          </dl>
        </div>
      </section>

      <!-- Form panel -->
      <section class="relative flex items-center justify-center bg-bg px-5 py-10">
        <button
          type="button"
          class="absolute top-5 right-5 grid size-9 place-items-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-ink"
          [attr.aria-label]="theme.isDark() ? 'Switch to light theme' : 'Switch to dark theme'"
          (click)="theme.toggle()"
        >
          <ui-icon [name]="theme.isDark() ? 'moon' : 'sun'" [size]="18" />
        </button>

        <div class="animate-rise w-full max-w-sm">
          <div class="mb-8 lg:hidden">
            <span
              class="grid size-12 place-items-center rounded-2xl bg-linear-to-br from-brand to-accent text-white shadow-glow"
            >
              <ui-icon name="zap" [size]="24" />
            </span>
          </div>

          <h1 class="text-[26px] font-semibold tracking-tight text-ink">Welcome back</h1>
          <p class="mt-1.5 text-[14px] text-muted">
            Sign in to open the terminal and today’s books.
          </p>

          <form class="mt-8 space-y-4" (submit)="onSubmit($event)">
            <ui-field label="Username" for="username" [required]="true" [error]="usernameError()">
              <input
                id="username"
                uiAutofocus
                type="text"
                class="ctl"
                autocomplete="username"
                placeholder="Aman"
                [formField]="loginForm.username"
                [attr.aria-invalid]="usernameError() ? 'true' : null"
              />
            </ui-field>

            <ui-field label="Password" for="password" [required]="true" [error]="passwordError()">
              <div class="relative">
                <input
                  id="password"
                  [type]="revealed() ? 'text' : 'password'"
                  class="ctl pr-11"
                  autocomplete="current-password"
                  placeholder="••••••••"
                  [formField]="loginForm.password"
                  [attr.aria-invalid]="passwordError() ? 'true' : null"
                />
                <button
                  type="button"
                  class="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-faint transition hover:text-ink"
                  [attr.aria-label]="revealed() ? 'Hide password' : 'Show password'"
                  (click)="revealed.set(!revealed())"
                >
                  <ui-icon [name]="revealed() ? 'eye' : 'lock'" [size]="16" />
                </button>
              </div>
            </ui-field>

            <div class="flex items-center justify-between pt-1">
              <label class="flex cursor-pointer items-center gap-2 text-[13px] text-muted">
                <input type="checkbox" class="size-4 accent-[var(--c-brand)]" checked />
                Keep me signed in
              </label>
              <button
                type="button"
                class="rounded text-[13px] font-medium text-brand-text transition hover:underline"
                (click)="forgot()"
              >
                Forgot password?
              </button>
            </div>

            <ui-button
              type="submit"
              variant="primary"
              size="lg"
              [block]="true"
              [loading]="auth.busy()"
              trailingIcon="arrowRight"
            >
              Sign in
            </ui-button>

            <div class="flex items-center gap-3 py-1">
              <span class="h-px flex-1 bg-line"></span>
              <span class="text-[11.5px] tracking-wide text-faint uppercase">or</span>
              <span class="h-px flex-1 bg-line"></span>
            </div>

            <ui-button
              variant="outline"
              size="lg"
              [block]="true"
              icon="compass"
              [disabled]="auth.busy()"
              (pressed)="exploreAsGuest()"
            >
              Explore as guest
            </ui-button>
          </form>

          @if (demo) {
            <p
              class="mt-6 rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[12.5px] leading-relaxed text-muted"
            >
              <strong class="font-semibold text-ink">Demo mode.</strong>
              The bundled in-memory backend is answering. Sign in with
              <code class="font-mono text-brand-text">Aman</code> /
              <code class="font-mono text-brand-text">123455.</code>, or use any username and
              password.
            </p>
          }
        </div>
      </section>
    </div>
  `,
  host: { class: 'block' },
})
export class LoginPage {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly demo = environment.useMockBackend;
  protected readonly revealed = signal(false);

  protected readonly metrics = [
    { label: 'Branches', value: '3' },
    { label: 'SKUs', value: '36' },
    { label: 'Modules', value: '14' },
  ];

  private readonly model = signal({ username: 'Aman', password: '123455.' });

  protected readonly loginForm = form(this.model, (path) => {
    required(path.username, { message: 'Enter your username.' });
    required(path.password, { message: 'Enter your password.' });
  });

  protected usernameError(): string {
    const field = this.loginForm.username();
    return field.touched() && field.invalid() ? 'Enter your username.' : '';
  }

  protected passwordError(): string {
    const field = this.loginForm.password();
    return field.touched() && field.invalid() ? 'Enter your password.' : '';
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.loginForm, async () => {
      try {
        await this.auth.login(this.model());
        this.toast.success('Signed in', `Welcome back, ${this.model().username}.`);
        await this.goHome();
      } catch {
        // The HTTP error interceptor has already surfaced the reason.
      }
      return undefined;
    });
  }

  protected async exploreAsGuest(): Promise<void> {
    try {
      await this.auth.loginAsGuest();
      this.toast.info('Guest session', 'You are exploring with a read-only token.');
      await this.goHome();
    } catch {
      /* reported by the interceptor */
    }
  }

  protected async forgot(): Promise<void> {
    const userName = this.model().username;
    if (!userName) {
      this.toast.warn('Username needed', 'Type your username first, then request a reset link.');
      return;
    }
    await this.auth.forgotPassword(userName);
    this.toast.success('Reset requested', `We sent reset instructions for ${userName}.`);
  }

  private async goHome(): Promise<void> {
    const returnUrl = new URLSearchParams(location.search).get('returnUrl');
    await this.router.navigateByUrl(returnUrl || '/dashboard');
  }
}
