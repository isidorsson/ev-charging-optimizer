import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ToastService } from "../../services/toast.service";

@Component({
  selector: "app-toast-host",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./toast-host.component.html",
  styleUrl: "./toast-host.component.scss",
})
export class ToastHostComponent {
  private readonly toasts = inject(ToastService);
  readonly items = this.toasts.items;

  dismiss(id: number) {
    this.toasts.dismiss(id);
  }
}
