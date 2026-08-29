import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { GalleryImage } from '../../core/models';
import { Api } from '../../core/services/api';
import { ConfirmService } from '../../core/services/confirm';
import { ListStore } from '../../core/services/list-store';
import { PosApi } from '../../core/services/pos-api';
import { PrintService } from '../../core/services/print';
import { ToastService } from '../../core/services/toast';
import { hueOf, initials, prettyDate } from '../../core/util/format';
import { UiButton } from '../../shared/ui/button';
import { UiFilterBar } from '../../shared/ui/filter-bar';
import { UiIcon } from '../../shared/ui/icon';
import { UiModal } from '../../shared/ui/modal';
import { UiBadge, UiEmpty, UiField, UiPageHeader, UiSkeleton } from '../../shared/ui/primitives';

@Component({
  selector: 'app-gallery',
  imports: [
    UiPageHeader,
    UiFilterBar,
    UiButton,
    UiModal,
    UiField,
    UiBadge,
    UiIcon,
    UiEmpty,
    UiSkeleton,
  ],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="image"
        title="Image gallery"
        subtitle="Banners, promos and product artwork the storefront pulls from."
      >
        <ui-button variant="primary" icon="plus" (pressed)="openCreate()">Upload image</ui-button>
      </ui-page-header>

      <ui-filter-bar
        [(search)]="search"
        [exportable]="false"
        searchLabel="Find an image"
        placeholder="Type or description…"
        (refresh)="reload()"
        (printed)="printPdf()"
      >
        <div class="w-44">
          <label class="mb-1.5 block text-[12px] font-medium text-muted" for="g-type">Type</label>
          <select
            id="g-type"
            class="ctl"
            [value]="typeFilter()"
            (change)="typeFilter.set($any($event.target).value)"
          >
            <option value="">All types</option>
            @for (type of types(); track type) {
              <option [value]="type">{{ type }}</option>
            }
          </select>
        </div>
      </ui-filter-bar>

      @if (store.loading()) {
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          @for (n of [1, 2, 3, 4, 5, 6, 7, 8]; track n) {
            <ui-skeleton [count]="1" [height]="180" />
          }
        </div>
      } @else if (filtered().length) {
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          @for (image of filtered(); track image.id; let i = $index) {
            <figure
              class="surface-card stagger group overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card"
              [style]="'--i:' + i"
            >
              <div
                class="relative grid aspect-[4/3] place-items-center overflow-hidden"
                [style.background]="swatch(image.type + image.description)"
              >
                @if (image.imageUrl) {
                  <img
                    [src]="image.imageUrl"
                    [alt]="image.description || image.type"
                    class="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                } @else {
                  <span class="text-[28px] font-semibold text-white/85">{{
                    short(image.type)
                  }}</span>
                }
                <span class="absolute top-2.5 left-2.5">
                  <ui-badge tone="brand">{{ image.type }}</ui-badge>
                </span>
              </div>
              <figcaption class="flex items-start gap-2 p-3.5">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-[13.5px] font-medium text-ink">
                    {{ image.description || 'Untitled' }}
                  </p>
                  <p class="truncate text-[11.5px] text-faint">{{ date(image.postDate) }}</p>
                </div>
                <div class="flex shrink-0 gap-1">
                  <ui-button
                    variant="ghost"
                    size="icon"
                    icon="edit"
                    ariaLabel="Edit image"
                    (pressed)="openEdit(image)"
                  />
                  <ui-button
                    variant="ghost"
                    size="icon"
                    icon="trash"
                    ariaLabel="Delete image"
                    (pressed)="remove(image)"
                  />
                </div>
              </figcaption>
            </figure>
          }
        </div>
      } @else {
        <ui-empty
          title="No images yet"
          message="Upload a banner or promo artwork to get started."
          icon="image"
        />
      }
    </div>

    <ui-modal
      [(open)]="editorOpen"
      size="md"
      [heading]="editing() ? 'Edit image' : 'Upload image'"
      subheading="Sent as multipart/form-data, exactly as the API expects."
    >
      <div class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <ui-field label="Type" for="gi-type" [required]="true" hint="Banner, Promo, Product…">
            <input
              id="gi-type"
              type="text"
              class="ctl"
              [value]="type()"
              (input)="type.set($any($event.target).value)"
            />
          </ui-field>
          <ui-field label="Description" for="gi-desc">
            <input
              id="gi-desc"
              type="text"
              class="ctl"
              [value]="description()"
              (input)="description.set($any($event.target).value)"
            />
          </ui-field>
        </div>

        <ui-field
          label="Image file"
          for="gi-file"
          [hint]="editing() ? 'Leave empty to keep the current image.' : 'PNG or JPG.'"
        >
          <input
            id="gi-file"
            type="file"
            accept="image/*"
            class="ctl h-auto py-1.5 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-brand-text"
            (change)="onFile($event)"
          />
        </ui-field>

        @if (preview(); as source) {
          <div class="overflow-hidden rounded-xl border border-line">
            <img [src]="source" alt="Selected image preview" class="max-h-56 w-full object-cover" />
          </div>
        }

        <p class="flex items-center gap-2 text-[12.5px] text-faint">
          <ui-icon name="info" [size]="14" />
          The demo backend stores the file name only; a real server keeps the binary.
        </p>
      </div>

      <div modal-footer class="flex gap-2">
        <ui-button variant="ghost" (pressed)="editorOpen.set(false)">Cancel</ui-button>
        <ui-button
          variant="primary"
          icon="save"
          [loading]="saving()"
          [disabled]="!type().trim()"
          (pressed)="save()"
        >
          {{ editing() ? 'Save image' : 'Upload' }}
        </ui-button>
      </div>
    </ui-modal>
  `,
  host: { class: 'block' },
})
export class GalleryPage {
  private readonly api = inject(PosApi);
  private readonly http = inject(Api);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly print = inject(PrintService);

  protected readonly date = prettyDate;
  protected readonly short = initials;

  protected readonly search = signal('');
  protected readonly typeFilter = signal('');
  protected readonly editorOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly editing = signal<GalleryImage | null>(null);

  protected readonly type = signal('Banner');
  protected readonly description = signal('');
  protected readonly preview = signal<string | null>(null);
  private readonly file = signal<File | null>(null);

  protected readonly store = new ListStore<GalleryImage>(() => this.api.gallery.search({}));

  protected readonly types = computed(() => [
    ...new Set(
      this.store
        .rows()
        .map((row) => row.type)
        .filter(Boolean),
    ),
  ]);

  protected readonly filtered = computed(() => {
    const needle = this.search().toLowerCase();
    return this.store.rows().filter((row) => {
      const matchesType = !this.typeFilter() || row.type === this.typeFilter();
      const hit = !needle || `${row.type} ${row.description}`.toLowerCase().includes(needle);
      return matchesType && hit;
    });
  });

  constructor() {
    void this.reload();
  }

  protected reload(): void {
    void this.store.load();
  }

  /** The gallery as an inventory list — file names, types and who added them. */
  protected printPdf(): void {
    this.print.report({
      title: 'Image gallery',
      subtitle: 'Banners, promos and product artwork on file',
      filename: 'image-gallery',
      filters: [
        { label: 'Type', value: this.typeFilter() || 'All types' },
        { label: 'Search', value: this.search() || 'All images' },
      ],
      summary: [
        { label: 'Images', value: String(this.filtered().length) },
        { label: 'Types in use', value: String(this.types().length) },
      ],
      sections: [
        {
          rows: this.filtered().map((row) => ({
            Type: row.type,
            Description: row.description,
            File: row.fileName ?? row.imageUrl,
            'Added by': row.postBy ?? '',
            Added: prettyDate(row.postDate),
          })),
          emptyMessage: 'No images match this selection.',
        },
      ],
    });
  }

  protected swatch(seed: string): string {
    const hue = hueOf(seed);
    return `linear-gradient(135deg, oklch(0.6 0.15 ${hue}), oklch(0.45 0.18 ${(hue + 55) % 360}))`;
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.type.set('Banner');
    this.description.set('');
    this.file.set(null);
    this.preview.set(null);
    this.editorOpen.set(true);
  }

  protected openEdit(image: GalleryImage): void {
    this.editing.set(image);
    this.type.set(image.type);
    this.description.set(image.description ?? '');
    this.file.set(null);
    this.preview.set(image.imageUrl || null);
    this.editorOpen.set(true);
  }

  protected onFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.file.set(file);
    this.preview.set(file ? URL.createObjectURL(file) : null);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    try {
      const body = new FormData();
      body.append('Type', this.type());
      body.append('Description', this.description());
      const file = this.file();
      if (file) body.append('ImageFile', file, file.name);

      const current = this.editing();
      if (current) {
        await firstValueFrom(this.http.put(`ImageGallery/${current.id}`, body));
        this.toast.success('Image saved', `${this.type()} artwork was updated.`);
      } else {
        await firstValueFrom(this.http.post('ImageGallery', body));
        this.toast.success('Image uploaded', `${this.type()} artwork was added.`);
      }
      this.editorOpen.set(false);
      this.reload();
    } catch {
      /* surfaced by the error interceptor */
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(image: GalleryImage): Promise<void> {
    if (!(await this.confirm.askDelete(`image “${image.description || image.type}”`))) return;
    await firstValueFrom(this.api.gallery.remove(image.id));
    this.store.removeWhere((candidate) => candidate.id === image.id);
    this.toast.success('Image deleted', 'The artwork was removed from the gallery.');
  }
}
