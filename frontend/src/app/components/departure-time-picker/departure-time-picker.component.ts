import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { TranslatePipe } from "@ngx-translate/core";

import {
  PreferencesService,
  type Language,
} from "../../services/preferences.service";

interface DraftState {
  /** Local date with hour/minute zeroed out (the calendar's selected day). */
  day: Date;
  /** 0–23, always stored as 24h regardless of display preference. */
  hour: number;
  /** 0, 15, 30, or 45. */
  minute: number;
}

interface DayCell {
  date: Date;
  label: string;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isDisabled: boolean;
  ariaLabel: string;
}

const HOUR_MIN = 0;
const HOUR_MAX = 23;
const MINUTE_MIN = 0;
const MINUTE_MAX = 59;

/**
 * EV-friendly EU locale tags. Short language codes default to en-US in
 * Intl (MM/DD/YYYY, Sunday-first); regional tags give us EU formatting
 * across all four supported languages.
 */
function toLocaleTag(language: Language): string {
  switch (language) {
    case "en": return "en-GB";
    case "sv": return "sv-SE";
    case "de": return "de-DE";
    case "es": return "es-ES";
  }
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function parseValue(value: string): DraftState {
  const fallback = (): DraftState => {
    const d = new Date();
    d.setHours(d.getHours() + 8, 0, 0, 0);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return { day, hour: d.getHours(), minute: 0 };
  };
  if (!value) return fallback();
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return fallback();
  const [, y, mo, da, hh, mm] = m;
  const day = new Date(+y, +mo - 1, +da);
  return {
    day,
    hour: clamp(+hh, HOUR_MIN, HOUR_MAX),
    minute: clamp(+mm, MINUTE_MIN, MINUTE_MAX),
  };
}

function formatValue(draft: DraftState): string {
  const y = draft.day.getFullYear();
  const m = pad2(draft.day.getMonth() + 1);
  const d = pad2(draft.day.getDate());
  return `${y}-${m}-${d}T${pad2(draft.hour)}:${pad2(draft.minute)}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

@Component({
  selector: "app-departure-time-picker",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: "./departure-time-picker.component.html",
  styleUrl: "./departure-time-picker.component.scss",
})
export class DepartureTimePickerComponent {
  private readonly prefs = inject(PreferencesService);

  readonly value = input.required<string>();
  readonly minDate = input<string | undefined>(undefined);
  readonly valueChange = output<string>();

  readonly open = signal(false);
  readonly draft = signal<DraftState>(parseValue(""));
  readonly viewMonth = signal<{ year: number; month: number }>({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });

  /** Viewport-relative coordinates for the popover panel (desktop only). */
  readonly panelPos = signal<{ top: number; left: number } | null>(null);

  private readonly triggerRef = viewChild<ElementRef<HTMLButtonElement>>("trigger");
  private readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>("dialog");

  readonly localeTag = computed(() => toLocaleTag(this.prefs.language()));
  readonly is12h = computed<boolean>(() => this.prefs.timeFormat() === "12h");

  readonly triggerLabel = computed(() => {
    const v = this.value();
    const draft = parseValue(v);
    const date = new Date(
      draft.day.getFullYear(),
      draft.day.getMonth(),
      draft.day.getDate(),
      draft.hour,
      draft.minute,
    );
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat(this.localeTag(), {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: this.is12h(),
    }).format(date);
  });

  readonly monthLabel = computed(() => {
    const { year, month } = this.viewMonth();
    const ref = new Date(year, month, 1);
    return new Intl.DateTimeFormat(this.localeTag(), {
      month: "long",
      year: "numeric",
    }).format(ref);
  });

  readonly weekdayHeader = computed(() => {
    const fmt = new Intl.DateTimeFormat(this.localeTag(), { weekday: "short" });
    const aria = new Intl.DateTimeFormat(this.localeTag(), { weekday: "long" });
    const monday = new Date(2024, 0, 1); // 2024-01-01 was a Monday
    const labels: { short: string; aria: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      labels.push({ short: fmt.format(d), aria: aria.format(d) });
    }
    return labels;
  });

  readonly monthGrid = computed<DayCell[]>(() => {
    const { year, month } = this.viewMonth();
    const draft = this.draft();
    const today = startOfDay(new Date());
    const minFloor = this.minDate() ? startOfDay(new Date(this.minDate()!)) : today;

    const first = new Date(year, month, 1);
    const firstDayIndex = (first.getDay() + 6) % 7; // Mon=0..Sun=6
    const gridStart = new Date(year, month, 1 - firstDayIndex);

    const ariaFmt = new Intl.DateTimeFormat(this.localeTag(), {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const cells: DayCell[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const day = startOfDay(d);
      cells.push({
        date: day,
        label: String(d.getDate()),
        inMonth: d.getMonth() === month,
        isToday: sameDay(day, today),
        isSelected: sameDay(day, draft.day),
        isDisabled: day.getTime() < minFloor.getTime(),
        ariaLabel: ariaFmt.format(d),
      });
    }
    return cells;
  });

  readonly displayHour = computed<number>(() => {
    const h = this.draft().hour;
    if (!this.is12h()) return h;
    const mod = h % 12;
    return mod === 0 ? 12 : mod;
  });

  /** Min/max for the visible hour input — depends on 12h vs 24h. */
  readonly hourBounds = computed(() =>
    this.is12h() ? { min: 1, max: 12 } : { min: HOUR_MIN, max: HOUR_MAX },
  );

  readonly meridiem = computed<"AM" | "PM">(() =>
    this.draft().hour >= 12 ? "PM" : "AM",
  );

  constructor() {
    effect(() => {
      const v = this.value();
      if (!this.open()) {
        const parsed = parseValue(v);
        this.draft.set(parsed);
        this.viewMonth.set({
          year: parsed.day.getFullYear(),
          month: parsed.day.getMonth(),
        });
      }
    });

    /*
     * Bridge: signal `open()` ↔ native <dialog> imperative API.
     *
     * Native <dialog> is imperative: showModal() / close(). The component
     * keeps `open` as the source of truth (signal), so this effect must
     * mirror it onto the element. Two pitfalls to avoid:
     *
     *   1. showModal() throws InvalidStateError if the dialog is already
     *      open — guard with `dialog.open`.
     *   2. close() fires the `close` event, which we use to flip `open`
     *      back to false. If we don't guard symmetrically, calling close()
     *      on an already-closed dialog is a no-op but still fine.
     *
     * TODO (you write): read both `dialogRef()` (a viewChild signal) and
     * `open()` here, then sync the dialog. ~6 lines.
     */
    effect(() => {
      const dialog = this.dialogRef()?.nativeElement;
      if (!dialog) return;
      const isOpen = this.open();
      if (isOpen && !dialog.open) {
        dialog.showModal();
        this.computePanelPosition();
      } else if (!isOpen && dialog.open) {
        dialog.close();
      }
    });
  }

  /**
   * Native <dialog> emits `close` on Escape, on form[method="dialog"]
   * submission, and when we call .close() ourselves. We mirror that into
   * the signal so the component state stays consistent regardless of
   * how the dialog was dismissed.
   */
  onDialogClose(): void {
    if (this.open()) this.closeWithoutSaving();
  }

  /**
   * A click on the <dialog> element itself (not on a child) means the
   * user clicked the ::backdrop. Treat that as "cancel".
   */
  onDialogClick(event: MouseEvent): void {
    if (event.target === this.dialogRef()?.nativeElement) {
      this.closeWithoutSaving();
    }
  }

  toggleOpen(): void {
    if (!this.open()) {
      this.computePanelPosition();
    }
    this.open.update((o) => !o);
  }

  private computePanelPosition(): void {
    const trigger = this.triggerRef()?.nativeElement;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const PANEL_W = 360;
    const MARGIN = 12;
    const viewport = window.innerWidth;
    // Anchor to trigger's left edge but never let the panel hang off-screen.
    const left = Math.min(
      Math.max(MARGIN, rect.left),
      viewport - PANEL_W - MARGIN,
    );
    this.panelPos.set({ top: rect.bottom + 6, left });
  }

  @HostListener("window:resize")
  @HostListener("window:scroll")
  onViewportChange(): void {
    if (this.open()) this.computePanelPosition();
  }

  closeWithoutSaving(): void {
    this.open.set(false);
    const parsed = parseValue(this.value());
    this.draft.set(parsed);
  }

  commit(): void {
    this.valueChange.emit(formatValue(this.draft()));
    this.open.set(false);
  }

  prevMonth(): void {
    this.viewMonth.update(({ year, month }) =>
      month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 },
    );
  }

  nextMonth(): void {
    this.viewMonth.update(({ year, month }) =>
      month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 },
    );
  }

  selectDay(cell: DayCell): void {
    if (cell.isDisabled) return;
    this.draft.update((d) => ({ ...d, day: cell.date }));
  }

  setHour(raw: number | string): void {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    if (this.is12h()) {
      const clamped = clamp(Math.trunc(n), 1, 12);
      const mer = this.meridiem();
      const normalized = clamped === 12 ? 0 : clamped;
      const hour24 = mer === "PM" ? normalized + 12 : normalized;
      this.draft.update((d) => ({ ...d, hour: hour24 }));
    } else {
      this.draft.update((d) => ({ ...d, hour: clamp(Math.trunc(n), HOUR_MIN, HOUR_MAX) }));
    }
  }

  setMinute(raw: number | string): void {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    this.draft.update((d) => ({ ...d, minute: clamp(Math.trunc(n), MINUTE_MIN, MINUTE_MAX) }));
  }

  setMeridiem(mer: "AM" | "PM"): void {
    this.draft.update((d) => {
      const base = d.hour % 12;
      return { ...d, hour: mer === "PM" ? base + 12 : base };
    });
  }

  applyChip(kind: "in8h" | "tomorrowMorning" | "tomorrowEvening"): void {
    const now = new Date();
    const target = new Date();
    if (kind === "in8h") {
      // now + 8h, rounded UP to the next quarter-hour for a nicer label.
      target.setTime(now.getTime() + 8 * 60 * 60 * 1000);
      const m = target.getMinutes();
      const next = Math.ceil(m / 15) * 15;
      if (next === 60) {
        target.setHours(target.getHours() + 1, 0, 0, 0);
      } else {
        target.setMinutes(next, 0, 0);
      }
    } else if (kind === "tomorrowMorning") {
      target.setDate(now.getDate() + 1);
      target.setHours(7, 0, 0, 0);
    } else {
      target.setDate(now.getDate() + 1);
      target.setHours(17, 0, 0, 0);
    }
    const next: DraftState = {
      day: startOfDay(target),
      hour: target.getHours(),
      minute: target.getMinutes(),
    };
    this.draft.set(next);
    this.viewMonth.set({ year: next.day.getFullYear(), month: next.day.getMonth() });
    this.valueChange.emit(formatValue(next));
    this.open.set(false);
  }

  @HostListener("document:keydown.escape")
  onEscape(): void {
    if (this.open()) this.closeWithoutSaving();
  }

  trackCell = (_: number, c: DayCell): number => c.date.getTime();
  trackNum = (_: number, n: number): number => n;
}
