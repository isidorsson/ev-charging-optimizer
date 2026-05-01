import { Component } from "@angular/core";
import { IonApp, IonRouterOutlet } from "@ionic/angular/standalone";
import { ToastHostComponent } from "./components/toast-host/toast-host.component";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [IonApp, IonRouterOutlet, ToastHostComponent],
  template: `
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
      <app-toast-host></app-toast-host>
    </ion-app>
  `,
})
export class AppComponent {}
