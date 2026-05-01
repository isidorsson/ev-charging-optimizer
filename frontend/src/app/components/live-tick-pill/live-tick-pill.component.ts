import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { TranslatePipe } from "@ngx-translate/core";
import {
  LucideTrendingDown,
  LucideTrendingUp,
  LucideMinus,
  LucideZap,
  LucideLeaf,
  LucideCircleAlert,
} from "@lucide/angular";

import { LiveTickService } from "../../services/live-tick.service";

@Component({
  selector: "app-live-tick-pill",
  standalone: true,
  imports: [
    CommonModule,
    TranslatePipe,
    LucideTrendingDown,
    LucideTrendingUp,
    LucideMinus,
    LucideZap,
    LucideLeaf,
    LucideCircleAlert,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./live-tick-pill.component.html",
  styleUrl: "./live-tick-pill.component.scss",
})
export class LiveTickPillComponent {
  readonly region = input.required<string>();

  private readonly live = inject(LiveTickService);

  readonly tick = this.live.tick;
  readonly status = this.live.status;
  readonly stale = this.live.isStale;
  readonly trend = this.live.priceTrend;

  readonly carbonClass = computed(() => {
    const t = this.tick();
    if (!t) return "carbon-unknown";
    return `carbon-${t.carbonIndex.replace(/\s+/g, "-")}`;
  });

  readonly statusLabel = computed(() => {
    const s = this.status();
    if (s === "open" && this.stale()) return "live.status.stale";
    return `live.status.${s}`;
  });

  readonly priceText = computed(() => {
    const t = this.tick();
    if (!t) return "—";
    return `${t.pricePerKwh.toFixed(2)} ${t.currency}`;
  });

  readonly carbonText = computed(() => {
    const t = this.tick();
    if (!t) return "—";
    return `${Math.round(t.intensityGCo2PerKwh)} g`;
  });

  constructor() {
    effect(() => {
      const r = this.region();
      this.live.connect(r);
    });
  }
}
