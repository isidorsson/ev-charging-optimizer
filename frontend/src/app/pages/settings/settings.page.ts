import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonList,
  IonListHeader,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
} from "@ionic/angular/standalone";
import { TranslatePipe } from "@ngx-translate/core";

import {
  PreferencesService,
  SUPPORTED_LANGUAGES,
  SUPPORTED_TIME_FORMATS,
  type Language,
  type TimeFormat,
} from "../../services/preferences.service";

@Component({
  selector: "app-settings",
  standalone: true,
  imports: [
    CommonModule,
    TranslatePipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonBackButton,
    IonList,
    IonListHeader,
    IonItem,
    IonLabel,
    IonSelect,
    IonSelectOption,
  ],
  templateUrl: "./settings.page.html",
  styleUrl: "./settings.page.scss",
})
export class SettingsPage {
  readonly prefs = inject(PreferencesService);

  readonly timeFormats = SUPPORTED_TIME_FORMATS;
  readonly languages = SUPPORTED_LANGUAGES;

  onTimeFormatChange(value: TimeFormat): void {
    this.prefs.setTimeFormat(value);
  }

  onLanguageChange(value: Language): void {
    this.prefs.setLanguage(value);
  }
}
