import type { Routes } from "@angular/router";

export const routes: Routes = [
  {
    path: "",
    loadComponent: () =>
      import("./pages/home/home.page").then((m) => m.HomePage),
  },
  {
    path: "schedule",
    loadComponent: () =>
      import("./pages/schedule/schedule.page").then((m) => m.SchedulePage),
  },
  {
    path: "settings",
    loadComponent: () =>
      import("./pages/settings/settings.page").then((m) => m.SettingsPage),
  },
  { path: "**", redirectTo: "" },
];
