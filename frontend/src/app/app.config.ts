import {
  ApplicationConfig,
  provideZoneChangeDetection,
  provideEnvironmentInitializer,
  inject,
  isDevMode,
  PLATFORM_ID,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { provideHttpClient, withFetch } from "@angular/common/http";
import { provideRouter, withComponentInputBinding } from "@angular/router";
import { RouteReuseStrategy } from "@angular/router";
import {
  IonicRouteStrategy,
  provideIonicAngular,
} from "@ionic/angular/standalone";

import { routes } from "./app.routes";

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

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ mode: "ios" }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch()),
    provideEnvironmentInitializer(registerServiceWorker),
  ],
};
