import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UiConfirmHost, UiToastHost } from './shared/ui/overlays';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, UiToastHost, UiConfirmHost],
  template: `
    <router-outlet />
    <ui-toast-host />
    <ui-confirm-host />
  `,
})
export class App {}
