import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth';
import { resetMockDatabase } from '../../core/http/mock-backend';
import { ConfirmService } from '../../core/services/confirm';
import { Lookups } from '../../core/services/lookups';
import { PosApi } from '../../core/services/pos-api';
import { ThemeService, type ThemePreference } from '../../core/services/theme';
import { ToastService } from '../../core/services/toast';
import { UiButton } from '../../shared/ui/button';
import { UiIcon } from '../../shared/ui/icon';
import { UiSegmented } from '../../shared/ui/overlays';
import { UiBadge, UiCard, UiField, UiPageHeader } from '../../shared/ui/primitives';

@Component({
  selector: 'app-settings',
  imports: [UiPageHeader, UiCard, UiField, UiButton, UiBadge, UiSegmented, UiIcon],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="settings"
        title="Workspace settings"
        subtitle="Appearance, connection details and the demo data behind this build."
      />

      <div class="grid gap-4 xl:grid-cols-2">
        <ui-card heading="Appearance" subheading="Applies to this browser only" icon="sun">
          <div class="space-y-4">
            <div>
              <p class="mb-2 text-[12.5px] font-medium text-muted">Theme</p>
              <ui-segmented [options]="themeOptions" [(value)]="themePreference" ariaLabel="Theme" />
            </div>

            <div class="flex items-center gap-3 rounded-xl border border-line bg-surface-2/50 p-3.5">
              <span class="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-text">
                <ui-icon [name]="theme.isDark() ? 'moon' : 'sun'" [size]="18" />
              </span>
              <div class="min-w-0">
                <p class="text-[13px] font-medium text-ink">
                  Currently {{ theme.isDark() ? 'dark' : 'light' }}
                </p>
                <p class="text-[12px] text-muted">
                  {{
                    theme.preference() === 'system'
                      ? 'Following your operating system.'
                      : 'Set explicitly for this browser.'
                  }}
                </p>
              </div>
            </div>

            <div class="rounded-xl border border-line p-3.5">
              <p class="text-[13px] font-medium text-ink">Palette</p>
              <p class="mt-0.5 text-[12px] text-muted">
                Chart series, validated for colour-vision deficiency in both themes.
              </p>
              <div class="mt-2.5 flex gap-1.5">
                @for (slot of [1, 2, 3, 4, 5, 6]; track slot) {
                  <span
                    class="h-7 flex-1 rounded-lg"
                    [style.background]="'var(--viz-' + slot + ')'"
                    [attr.aria-label]="'Series ' + slot"
                  ></span>
                }
              </div>
            </div>
          </div>
        </ui-card>

        <ui-card heading="Connection" subheading="Where this build sends its requests" icon="database">
          <dl class="space-y-3 text-[13px]">
            <div class="flex items-center justify-between gap-3">
              <dt class="text-muted">Data source</dt>
              <dd>
                <ui-badge [tone]="demo ? 'warn' : 'pos'">
                  {{ demo ? 'In-memory demo backend' : 'Live API' }}
                </ui-badge>
              </dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt class="text-muted">Base URL</dt>
              <dd class="truncate font-mono text-[12px] text-brand-text">{{ baseUrl }}</dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt class="text-muted">Signed in as</dt>
              <dd class="font-medium text-ink">{{ auth.user()?.displayName }}</dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt class="text-muted">Role</dt>
              <dd class="font-medium text-ink">{{ auth.user()?.role }}</dd>
            </div>
          </dl>

          @if (demo) {
            <div class="mt-4 rounded-xl border border-warn/40 bg-warn-soft/60 p-3.5">
              <p class="flex items-center gap-2 text-[13px] font-medium text-ink">
                <ui-icon name="alert" [size]="15" />
                Demo mode is on
              </p>
              <p class="mt-1 text-[12.5px] leading-relaxed text-muted">
                Every screen is talking to a seeded in-memory implementation of the POS API. Set
                <code class="font-mono text-brand-text">useMockBackend: false</code> in
                <code class="font-mono">environments/environment.ts</code> to point at the real
                server.
              </p>
              <div class="mt-3 flex gap-2">
                <ui-button variant="outline" size="sm" icon="refresh" (pressed)="reseed()">
                  Reseed demo data
                </ui-button>
              </div>
            </div>
          }
        </ui-card>

        <ui-card heading="Contact the team" subheading="Posts to the ContactMail endpoint" icon="mail">
          <form class="space-y-4" (submit)="sendMail($event)">
            <div class="grid gap-4 sm:grid-cols-2">
              <ui-field label="Your name" for="ct-name" [required]="true">
                <input id="ct-name" type="text" class="ctl" [value]="name()" (input)="name.set($any($event.target).value)" />
              </ui-field>
              <ui-field label="Email" for="ct-email" [required]="true">
                <input id="ct-email" type="email" class="ctl" [value]="email()" (input)="email.set($any($event.target).value)" />
              </ui-field>
            </div>
            <ui-field label="Subject" for="ct-subject">
              <input id="ct-subject" type="text" class="ctl" [value]="subject()" (input)="subject.set($any($event.target).value)" />
            </ui-field>
            <ui-field label="Message" for="ct-message" [required]="true">
              <textarea id="ct-message" class="ctl" rows="3" [value]="message()" (input)="message.set($any($event.target).value)"></textarea>
            </ui-field>
            <ui-button
              type="submit"
              variant="primary"
              icon="mail"
              [loading]="sending()"
              [disabled]="!name().trim() || !email().trim() || !message().trim()"
            >
              Send message
            </ui-button>
          </form>
        </ui-card>

        <ui-card heading="Session" subheading="Sign out of this browser" icon="lock">
          <div class="space-y-3">
            <p class="text-[13px] leading-relaxed text-muted">
              Signing out clears the stored token and refresh token, and revokes the refresh token
              on the server.
            </p>
            <ui-button variant="danger" icon="logout" (pressed)="signOut()">Sign out</ui-button>
          </div>
        </ui-card>
      </div>
    </div>
  `,
  host: { class: 'block' },
})
export class SettingsPage {
  protected readonly theme = inject(ThemeService);
  protected readonly auth = inject(AuthService);
  private readonly api = inject(PosApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly lookups = inject(Lookups);

  protected readonly demo = environment.useMockBackend;
  protected readonly baseUrl = environment.apiBaseUrl;

  protected readonly themePreference = this.theme.preference;
  protected readonly themeOptions = [
    { value: 'light' as ThemePreference, label: 'Light', icon: 'sun' as const },
    { value: 'dark' as ThemePreference, label: 'Dark', icon: 'moon' as const },
    { value: 'system' as ThemePreference, label: 'System', icon: 'monitor' as const },
  ];

  protected readonly name = signal(this.auth.user()?.displayName ?? '');
  protected readonly email = signal('');
  protected readonly subject = signal('Enquiry');
  protected readonly message = signal('');
  protected readonly sending = signal(false);

  protected async reseed(): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Reseed the demo book?',
      message:
        'Every document, party and balance is regenerated from the seed. Anything you entered in this session is lost.',
      confirmLabel: 'Reseed',
      tone: 'danger',
    });
    if (!confirmed) return;

    resetMockDatabase();
    await this.lookups.refresh('items');
    this.toast.success('Demo data reseeded', 'Reload a screen to see the fresh book.');
  }

  protected async sendMail(event: Event): Promise<void> {
    event.preventDefault();
    this.sending.set(true);
    try {
      await firstValueFrom(
        this.api.contactMail({
          name: this.name(),
          email: this.email(),
          subject: this.subject(),
          message: this.message(),
        }),
      );
      this.toast.success('Message sent', 'The team will get back to you.');
      this.message.set('');
    } catch {
      /* surfaced by the error interceptor */
    } finally {
      this.sending.set(false);
    }
  }

  protected signOut(): void {
    void this.auth.logout();
  }
}
