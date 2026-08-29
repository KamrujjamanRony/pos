import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Employee } from '../../core/models';
import { Api } from '../../core/services/api';
import { ConfirmService } from '../../core/services/confirm';
import { ListStore } from '../../core/services/list-store';
import { Lookups } from '../../core/services/lookups';
import { PosApi } from '../../core/services/pos-api';
import { ToastService } from '../../core/services/toast';
import { currency, downloadCsv, hueOf, initials, prettyDate, sum, today } from '../../core/util/format';
import { UiAutofocus } from '../../shared/directives/motion';
import { UiButton } from '../../shared/ui/button';
import { UiCombobox } from '../../shared/ui/combobox';
import { UiFilterBar } from '../../shared/ui/filter-bar';
import { UiIcon } from '../../shared/ui/icon';
import { UiModal } from '../../shared/ui/modal';
import { UiBadge, UiEmpty, UiField, UiPageHeader, UiSkeleton } from '../../shared/ui/primitives';
import { UiStat } from '../../shared/ui/stat';

@Component({
  selector: 'app-employees',
  imports: [
    UiPageHeader,
    UiFilterBar,
    UiButton,
    UiModal,
    UiField,
    UiCombobox,
    UiBadge,
    UiStat,
    UiIcon,
    UiEmpty,
    UiSkeleton,
    UiAutofocus,
  ],
  template: `
    <div class="space-y-4">
      <ui-page-header
        icon="briefcase"
        title="Employees"
        subtitle="The team behind the counter, with branch, department and payroll basics."
      >
        <ui-button variant="primary" icon="plus" (pressed)="openCreate()">New employee</ui-button>
      </ui-page-header>

      <div class="grid gap-4 sm:grid-cols-3">
        <ui-stat label="Headcount" [value]="rows().length" format="integer" icon="users" [series]="1" />
        <ui-stat label="Active" [value]="activeCount()" format="integer" icon="checkCircle" [series]="3" />
        <ui-stat label="Monthly payroll" [value]="payroll()" format="money" prefix="৳" icon="money" [series]="6" />
      </div>

      <ui-filter-bar
        [(search)]="search"
        searchLabel="Find an employee"
        placeholder="Name, code, mobile, email…"
        (refresh)="reload()"
        (exported)="exportCsv()"
      >
        <div class="w-44">
          <label class="mb-1.5 block text-[12px] font-medium text-muted" for="emp-branch">Branch</label>
          <select id="emp-branch" class="ctl" [value]="branchFilter()" (change)="branchFilter.set($any($event.target).value)">
            <option value="">All branches</option>
            @for (branch of lookups.branches(); track branch.id) {
              <option [value]="branch.id">{{ branch.name }}</option>
            }
          </select>
        </div>
      </ui-filter-bar>

      @if (store.loading()) {
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          @for (n of [1, 2, 3, 4, 5, 6]; track n) {
            <ui-skeleton [count]="1" [height]="132" />
          }
        </div>
      } @else if (filtered().length) {
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          @for (person of filtered(); track person.id; let i = $index) {
            <article
              class="surface-card stagger group relative overflow-hidden p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card"
              [style]="'--i:' + i"
            >
              <div class="flex items-start gap-3.5">
                <span
                  class="grid size-12 shrink-0 place-items-center rounded-2xl text-[15px] font-semibold text-white transition-transform duration-300 group-hover:scale-105"
                  [style.background]="swatch(person.employeeName)"
                >
                  {{ short(person.employeeName) }}
                </span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <h3 class="truncate text-[14.5px] font-semibold text-ink">{{ person.employeeName }}</h3>
                      <p class="truncate font-mono text-[11.5px] text-brand-text">{{ person.employeeCode }}</p>
                    </div>
                    <ui-badge [tone]="person.isActive ? 'pos' : 'neutral'">
                      {{ person.isActive ? 'Active' : 'Inactive' }}
                    </ui-badge>
                  </div>
                  <p class="mt-1.5 truncate text-[12.5px] text-muted">
                    {{ person.departmentName || '—' }} · {{ person.branchName || '—' }}
                  </p>
                </div>
              </div>

              <dl class="mt-3.5 grid grid-cols-2 gap-2 text-[12px]">
                <div class="flex items-center gap-1.5 text-muted">
                  <ui-icon name="phone" [size]="13" />
                  <dd class="truncate">{{ person.mobileNumber || '—' }}</dd>
                </div>
                <div class="flex items-center gap-1.5 text-muted">
                  <ui-icon name="calendar" [size]="13" />
                  <dd class="truncate">{{ date(person.joiningDate) }}</dd>
                </div>
                <div class="flex items-center gap-1.5 text-muted">
                  <ui-icon name="mail" [size]="13" />
                  <dd class="truncate">{{ person.email || '—' }}</dd>
                </div>
                <div class="flex items-center gap-1.5 text-muted">
                  <ui-icon name="money" [size]="13" />
                  <dd class="num truncate">{{ currency(person.salary) }}</dd>
                </div>
              </dl>

              <div
                class="mt-3.5 flex items-center gap-1 border-t border-line pt-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100"
              >
                <ui-button variant="ghost" size="sm" icon="edit" (pressed)="openEdit(person)">Edit</ui-button>
                <ui-button variant="ghost" size="sm" icon="file" (pressed)="openDocuments(person)">
                  Documents ({{ person.documents.length }})
                </ui-button>
                <span class="flex-1"></span>
                <ui-button
                  variant="ghost"
                  size="icon"
                  icon="trash"
                  [ariaLabel]="'Delete ' + person.employeeName"
                  (pressed)="remove(person)"
                />
              </div>
            </article>
          }
        </div>
      } @else {
        <ui-empty
          title="No employees match"
          message="Adjust the search, or add the first team member."
          icon="briefcase"
        />
      }
    </div>

    <ui-modal
      [(open)]="editorOpen"
      size="lg"
      [heading]="editing() ? 'Edit employee' : 'New employee'"
      subheading="Create and update are multipart on the API — files ride along with the fields."
    >
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ui-field label="Employee code" for="e-code" [required]="true">
          <input id="e-code" uiAutofocus type="text" class="ctl" [value]="employeeCode()" (input)="employeeCode.set($any($event.target).value)" />
        </ui-field>
        <ui-field label="Full name" for="e-name" [required]="true" class="sm:col-span-2">
          <input id="e-name" type="text" class="ctl" [value]="employeeName()" (input)="employeeName.set($any($event.target).value)" />
        </ui-field>
        <ui-field label="Father's name" for="e-father">
          <input id="e-father" type="text" class="ctl" [value]="fatherName()" (input)="fatherName.set($any($event.target).value)" />
        </ui-field>
        <ui-field label="Date of birth" for="e-dob">
          <input id="e-dob" type="date" class="ctl" [value]="dateOfBirth()" (change)="dateOfBirth.set($any($event.target).value)" />
        </ui-field>
        <ui-field label="Gender" for="e-gender">
          <select id="e-gender" class="ctl" [value]="gender()" (change)="gender.set($any($event.target).value)">
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </ui-field>
        <ui-field label="Blood group" for="e-blood">
          <input id="e-blood" type="text" class="ctl" [value]="bloodGroup()" (input)="bloodGroup.set($any($event.target).value)" />
        </ui-field>
        <ui-field label="Mobile number" for="e-mobile">
          <input id="e-mobile" type="tel" class="ctl" [value]="mobileNumber()" (input)="mobileNumber.set($any($event.target).value)" />
        </ui-field>
        <ui-field label="Email" for="e-email">
          <input id="e-email" type="email" class="ctl" [value]="email()" (input)="email.set($any($event.target).value)" />
        </ui-field>
        <ui-field label="NID number" for="e-nid">
          <input id="e-nid" type="text" class="ctl" [value]="nidNumber()" (input)="nidNumber.set($any($event.target).value)" />
        </ui-field>
        <ui-field label="Branch">
          <ui-combobox [options]="lookups.branches()" [labelOf]="nameOf" [keyOf]="idOf" [(value)]="branchId" placeholder="Assign a branch" />
        </ui-field>
        <ui-field label="Department">
          <ui-combobox [options]="lookups.departments()" [labelOf]="nameOf" [keyOf]="idOf" [(value)]="departmentId" placeholder="Assign a department" />
        </ui-field>
        <ui-field label="Joining date" for="e-joining">
          <input id="e-joining" type="date" class="ctl" [value]="joiningDate()" (change)="joiningDate.set($any($event.target).value)" />
        </ui-field>
        <ui-field label="Salary" for="e-salary">
          <input id="e-salary" type="number" class="ctl" [value]="salary()" (input)="salary.set(+$any($event.target).value || 0)" />
        </ui-field>
        <ui-field label="Present address" for="e-address" class="sm:col-span-2">
          <input id="e-address" type="text" class="ctl" [value]="presentAddress()" (input)="presentAddress.set($any($event.target).value)" />
        </ui-field>
        <ui-field label="Photo" for="e-photo" hint="Sent as PhotoFile in the multipart body.">
          <input
            id="e-photo"
            type="file"
            accept="image/*"
            class="ctl h-auto py-1.5 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-brand-text"
            (change)="onPhoto($event)"
          />
        </ui-field>
        <ui-field label="Status" for="e-active">
          <select id="e-active" class="ctl" [value]="isActive() ? 'true' : 'false'" (change)="isActive.set($any($event.target).value === 'true')">
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </ui-field>
      </div>

      <div modal-footer class="flex gap-2">
        <ui-button variant="ghost" (pressed)="editorOpen.set(false)">Cancel</ui-button>
        <ui-button
          variant="primary"
          icon="save"
          [loading]="saving()"
          [disabled]="!employeeName().trim() || !employeeCode().trim()"
          (pressed)="save()"
        >
          {{ editing() ? 'Save employee' : 'Add employee' }}
        </ui-button>
      </div>
    </ui-modal>

    <ui-modal
      [(open)]="documentsOpen"
      variant="drawer"
      size="sm"
      [heading]="(viewing()?.employeeName ?? '') + ' — documents'"
      subheading="Uploaded through the multipart documents endpoint."
    >
      @if (viewing(); as person) {
        <div class="space-y-4">
          <ul class="space-y-2">
            @for (document of person.documents; track document.id) {
              <li class="flex items-center gap-3 rounded-xl border border-line bg-surface-2/50 p-3">
                <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-text">
                  <ui-icon name="file" [size]="16" />
                </span>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-[13px] font-medium text-ink">{{ document.documentTitle }}</p>
                  <p class="truncate text-[11.5px] text-faint">
                    {{ document.documentType }} · {{ document.fileName }}
                  </p>
                </div>
              </li>
            } @empty {
              <li>
                <ui-empty title="No documents yet" message="Upload a CV, certificate or NID scan." icon="file" />
              </li>
            }
          </ul>

          <div class="space-y-3 rounded-xl border border-line p-3.5">
            <p class="text-[13px] font-semibold text-ink">Upload a document</p>
            <div class="grid gap-3 sm:grid-cols-2">
              <ui-field label="Type" for="d-type">
                <input id="d-type" type="text" class="ctl" [value]="documentType()" (input)="documentType.set($any($event.target).value)" />
              </ui-field>
              <ui-field label="Title" for="d-title">
                <input id="d-title" type="text" class="ctl" [value]="documentTitle()" (input)="documentTitle.set($any($event.target).value)" />
              </ui-field>
            </div>
            <ui-field label="File" for="d-file">
              <input
                id="d-file"
                type="file"
                class="ctl h-auto py-1.5 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-brand-text"
                (change)="onDocumentFile($event)"
              />
            </ui-field>
            <ui-button
              variant="soft"
              icon="save"
              [loading]="uploading()"
              [disabled]="!documentFile()"
              (pressed)="uploadDocument()"
            >
              Upload
            </ui-button>
          </div>
        </div>
      }

      <div modal-footer>
        <ui-button variant="ghost" (pressed)="documentsOpen.set(false)">Close</ui-button>
      </div>
    </ui-modal>
  `,
  host: { class: 'block' },
})
export class EmployeesPage {
  private readonly api = inject(PosApi);
  private readonly http = inject(Api);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly lookups = inject(Lookups);

  protected readonly currency = currency;
  protected readonly date = prettyDate;
  protected readonly short = initials;
  protected readonly nameOf = (row: { name: string }) => row.name;
  protected readonly idOf = (row: { id: number }) => row.id;

  protected readonly search = signal('');
  protected readonly branchFilter = signal('');
  protected readonly editorOpen = signal(false);
  protected readonly documentsOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly uploading = signal(false);
  protected readonly editing = signal<Employee | null>(null);
  protected readonly viewing = signal<Employee | null>(null);

  protected readonly employeeCode = signal('');
  protected readonly employeeName = signal('');
  protected readonly fatherName = signal('');
  protected readonly dateOfBirth = signal('');
  protected readonly gender = signal('Male');
  protected readonly bloodGroup = signal('');
  protected readonly mobileNumber = signal('');
  protected readonly email = signal('');
  protected readonly nidNumber = signal('');
  protected readonly presentAddress = signal('');
  protected readonly branchId = signal<number | string | null>(null);
  protected readonly departmentId = signal<number | string | null>(null);
  protected readonly joiningDate = signal(today());
  protected readonly salary = signal(0);
  protected readonly isActive = signal(true);
  private readonly photo = signal<File | null>(null);

  protected readonly documentType = signal('Certificate');
  protected readonly documentTitle = signal('');
  protected readonly documentFile = signal<File | null>(null);

  protected readonly store = new ListStore<Employee>(() => this.api.employees.search({}));

  protected readonly rows = computed(() => this.store.rows());

  protected readonly filtered = computed(() => {
    const needle = this.search().toLowerCase();
    return this.rows().filter((row) => {
      const inBranch = !this.branchFilter() || String(row.branchId) === this.branchFilter();
      const hit =
        !needle ||
        `${row.employeeName} ${row.employeeCode} ${row.mobileNumber} ${row.email}`
          .toLowerCase()
          .includes(needle);
      return inBranch && hit;
    });
  });

  protected readonly activeCount = computed(() => this.rows().filter((row) => row.isActive).length);
  protected readonly payroll = computed(() =>
    sum(this.rows().filter((row) => row.isActive), (row) => row.salary),
  );

  constructor() {
    void this.lookups.ensure();
    void this.reload();
  }

  protected reload(): void {
    void this.store.load();
  }

  protected swatch(name: string): string {
    return `linear-gradient(135deg, oklch(0.6 0.16 ${hueOf(name)}), oklch(0.5 0.19 ${(hueOf(name) + 45) % 360}))`;
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.employeeCode.set(`EMP-${String(this.rows().length + 1).padStart(3, '0')}`);
    this.employeeName.set('');
    this.fatherName.set('');
    this.dateOfBirth.set('');
    this.gender.set('Male');
    this.bloodGroup.set('');
    this.mobileNumber.set('');
    this.email.set('');
    this.nidNumber.set('');
    this.presentAddress.set('');
    this.branchId.set(this.lookups.branches()[0]?.id ?? null);
    this.departmentId.set(this.lookups.departments()[0]?.id ?? null);
    this.joiningDate.set(today());
    this.salary.set(0);
    this.isActive.set(true);
    this.photo.set(null);
    this.editorOpen.set(true);
  }

  protected openEdit(person: Employee): void {
    this.editing.set(person);
    this.employeeCode.set(person.employeeCode);
    this.employeeName.set(person.employeeName);
    this.fatherName.set(person.fatherName ?? '');
    this.dateOfBirth.set(person.dateOfBirth ?? '');
    this.gender.set(person.gender ?? 'Male');
    this.bloodGroup.set(person.bloodGroup ?? '');
    this.mobileNumber.set(person.mobileNumber ?? '');
    this.email.set(person.email ?? '');
    this.nidNumber.set(person.nidNumber ?? '');
    this.presentAddress.set(person.presentAddress ?? '');
    this.branchId.set(person.branchId);
    this.departmentId.set(person.departmentId);
    this.joiningDate.set(person.joiningDate ?? today());
    this.salary.set(person.salary ?? 0);
    this.isActive.set(person.isActive);
    this.photo.set(null);
    this.editorOpen.set(true);
  }

  protected openDocuments(person: Employee): void {
    this.viewing.set(person);
    this.documentTitle.set('');
    this.documentFile.set(null);
    this.documentsOpen.set(true);
  }

  protected onPhoto(event: Event): void {
    this.photo.set((event.target as HTMLInputElement).files?.[0] ?? null);
  }

  protected onDocumentFile(event: Event): void {
    this.documentFile.set((event.target as HTMLInputElement).files?.[0] ?? null);
  }

  /** The employee endpoints are multipart, so the payload is built as FormData. */
  private buildFormData(): FormData {
    const body = new FormData();
    const fields: Record<string, string | number | boolean | null> = {
      EmployeeCode: this.employeeCode(),
      EmployeeName: this.employeeName(),
      FatherName: this.fatherName(),
      DateOfBirth: this.dateOfBirth(),
      Gender: this.gender(),
      BloodGroup: this.bloodGroup(),
      MobileNumber: this.mobileNumber(),
      Email: this.email(),
      NidNumber: this.nidNumber(),
      PresentAddress: this.presentAddress(),
      BranchId: this.branchId(),
      DepartmentId: this.departmentId(),
      JoiningDate: this.joiningDate(),
      Salary: this.salary(),
      IsActive: this.isActive(),
      PostBy: 'Aman',
    };
    for (const [key, value] of Object.entries(fields)) {
      if (value === null || value === undefined || value === '') continue;
      body.append(key, String(value));
    }
    const photo = this.photo();
    if (photo) body.append('PhotoFile', photo, photo.name);
    return body;
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    try {
      const body = this.buildFormData();
      const current = this.editing();
      if (current) {
        await firstValueFrom(this.http.put(`Employee/${current.id}`, body));
        this.toast.success('Employee saved', `${this.employeeName()} was updated.`);
      } else {
        await firstValueFrom(this.http.post('Employee', body));
        this.toast.success('Employee added', `${this.employeeName()} joined the team.`);
      }
      this.editorOpen.set(false);
      this.reload();
      void this.lookups.refresh('employees');
    } catch {
      /* surfaced by the error interceptor */
    } finally {
      this.saving.set(false);
    }
  }

  protected async uploadDocument(): Promise<void> {
    const person = this.viewing();
    const file = this.documentFile();
    if (!person || !file) return;

    this.uploading.set(true);
    try {
      const body = new FormData();
      body.append('Files', file, file.name);
      body.append('DocumentTypes', this.documentType());
      body.append('DocumentTitles', this.documentTitle() || file.name);
      const updated = await firstValueFrom(
        this.http.post<Employee>(`Employee/${person.id}/Documents`, body),
      );
      this.viewing.set(updated);
      this.toast.success('Document uploaded', `${this.documentTitle() || file.name} was attached.`);
      this.documentFile.set(null);
      this.documentTitle.set('');
      this.reload();
    } catch {
      /* surfaced by the error interceptor */
    } finally {
      this.uploading.set(false);
    }
  }

  protected async remove(person: Employee): Promise<void> {
    if (!(await this.confirm.askDelete(`employee “${person.employeeName}”`))) return;
    await firstValueFrom(this.api.employees.remove(person.id));
    this.store.removeWhere((candidate) => candidate.id === person.id);
    this.toast.success('Employee deleted', `${person.employeeName} was removed.`);
    void this.lookups.refresh('employees');
  }

  protected exportCsv(): void {
    downloadCsv(
      'employees',
      this.filtered().map((row) => ({
        Code: row.employeeCode,
        Name: row.employeeName,
        Branch: row.branchName,
        Department: row.departmentName,
        Mobile: row.mobileNumber,
        Email: row.email,
        Joined: row.joiningDate,
        Salary: row.salary,
        Active: row.isActive ? 'Yes' : 'No',
      })),
    );
  }
}
