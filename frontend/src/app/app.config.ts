import {
  ApplicationConfig,
  provideZoneChangeDetection,
  provideEnvironmentInitializer,
  provideAppInitializer,
  inject,
  isDevMode,
  PLATFORM_ID,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import {
  HttpClient,
  provideHttpClient,
  withFetch,
} from "@angular/common/http";
import { provideRouter, withComponentInputBinding } from "@angular/router";
import { RouteReuseStrategy } from "@angular/router";
import {
  IonicRouteStrategy,
  provideIonicAngular,
} from "@ionic/angular/standalone";
import {
  provideTranslateService,
  TranslateLoader,
  TranslateService,
} from "@ngx-translate/core";
import { TranslateHttpLoader } from "@ngx-translate/http-loader";

import { routes } from "./app.routes";
import {
  PreferencesService,
  SUPPORTED_LANGUAGES,
} from "./services/preferences.service";

function registerServiceWorker(): void {
  const platformId = inject(PLATFORM_ID);
  if (!isPlatformBrowser(platformId) || isDevMode()) return;
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js", { scope: "/" })
      .catch((err) => console.warn("SW registration failed", err));
  });
}

function translateHttpLoaderFactory(http: HttpClient): TranslateHttpLoader {
  return new TranslateHttpLoader(http, "./i18n/", ".json");
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ mode: "ios" }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch()),
    provideTranslateService({
      defaultLanguage: "en",
      loader: {
        provide: TranslateLoader,
        useFactory: translateHttpLoaderFactory,
        deps: [HttpClient],
      },
    }),
    provideAppInitializer(() => {
      const translate = inject(TranslateService);
      const prefs = inject(PreferencesService);
      translate.addLangs([...SUPPORTED_LANGUAGES]);
      translate.use(prefs.language());
    }),
    provideEnvironmentInitializer(registerServiceWorker),
  ],
};
