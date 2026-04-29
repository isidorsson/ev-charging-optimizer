import { Injectable, computed, effect, inject, signal } from "@angular/core";
import { TranslateService } from "@ngx-translate/core";

export type TimeFormat = "12h" | "24h";
export type Language = "en" | "sv" | "de" | "es";

export const SUPPORTED_LANGUAGES: readonly Language[] = ["en", "sv", "de", "es"] as const;
export const SUPPORTED_TIME_FORMATS: readonly TimeFormat[] = ["12h", "24h"] as const;

interface StoredPrefs {
  timeFormat: TimeFormat;
  language: Language;
}

const STORAGE_KEY = "evopt.prefs";

function detectDefaultLanguage(): Language {
  if (typeof navigator === "undefined") return "en";
  const tag = navigator.language?.split("-")[0]?.toLowerCase();
  return SUPPORTED_LANGUAGES.includes(tag as Language) ? (tag as Language) : "en";
}

function loadFromStorage(): Partial<StoredPrefs> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

@Injectable({ providedIn: "root" })
export class PreferencesService {
  private readonly translate = inject(TranslateService);

  private readonly stored = loadFromStorage();

  readonly timeFormat = signal<TimeFormat>(
    SUPPORTED_TIME_FORMATS.includes(this.stored.timeFormat as TimeFormat)
      ? (this.stored.timeFormat as TimeFormat)
      : "24h",
  );

  readonly language = signal<Language>(
    SUPPORTED_LANGUAGES.includes(this.stored.language as Language)
      ? (this.stored.language as Language)
      : detectDefaultLanguage(),
  );

  readonly snapshot = computed<StoredPrefs>(() => ({
    timeFormat: this.timeFormat(),
    language: this.language(),
  }));

  constructor() {
    effect(() => {
      const snap = this.snapshot();
      if (typeof localStorage !== "undefined") {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
        } catch {
          /* quota / private mode — ignore */
        }
      }
    });

    effect(() => {
      const lang = this.language();
      this.translate.use(lang);
    });
  }

  setTimeFormat(value: TimeFormat): void {
    this.timeFormat.set(value);
  }

  setLanguage(value: Language): void {
    this.language.set(value);
  }
}
