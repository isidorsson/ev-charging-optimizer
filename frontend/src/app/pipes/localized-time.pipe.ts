import { Pipe, PipeTransform, inject } from "@angular/core";
import { PreferencesService } from "../services/preferences.service";

export type LocalTimeKind = "time" | "dayTime";

@Pipe({
  name: "localTime",
  standalone: true,
  pure: false,
})
export class LocalizedTimePipe implements PipeTransform {
  private readonly prefs = inject(PreferencesService);

  transform(value: string | Date | null | undefined, kind: LocalTimeKind = "time"): string {
    if (value === null || value === undefined || value === "") return "—";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    const hour12 = this.prefs.timeFormat() === "12h";
    const lang = this.prefs.language();

    const options: Intl.DateTimeFormatOptions = {
      hour: "2-digit",
      minute: "2-digit",
      hour12,
    };
    if (kind === "dayTime") options.weekday = "short";

    return new Intl.DateTimeFormat(lang, options).format(date);
  }
}
