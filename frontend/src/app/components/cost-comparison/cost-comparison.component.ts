import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { TranslatePipe } from "@ngx-translate/core";
import type { ScheduleSlot } from "../../services/api.service";

interface PathPoint {
  x: number;
  y: number;
  cum: number;
}

const W = 600;
const H = 180;
const PAD_L = 40;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 28;

@Component({
  selector: "app-cost-comparison",
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./cost-comparison.component.html",
  styleUrl: "./cost-comparison.component.scss",
})
export class CostComparisonComponent {
  readonly slots = input.required<ScheduleSlot[]>();
  readonly maxChargeKw = input.required<number>();
  readonly energyKwh = input.required<number>();
  readonly currency = input<string>("SEK");

  readonly viewBox = `0 0 ${W} ${H}`;

  /** Cumulative cost charging continuously starting now until energy filled. */
  readonly naivePoints = computed<PathPoint[]>(() => {
    const slots = this.slots();
    const max = this.maxChargeKw();
    let remaining = this.energyKwh();
    const points: { cum: number; idx: number }[] = [];
    let cum = 0;
    points.push({ cum, idx: 0 });
    slots.forEach((s, i) => {
      const take = Math.min(max, Math.max(0, remaining));
      cum += s.pricePerKwh * take;
      remaining -= take;
      points.push({ cum, idx: i + 1 });
    });
    return this.toPath(points);
  });

  /** Cumulative cost following the optimized schedule. */
  readonly optimizedPoints = computed<PathPoint[]>(() => {
    const slots = this.slots();
    let cum = 0;
    const points: { cum: number; idx: number }[] = [{ cum, idx: 0 }];
    slots.forEach((s, i) => {
      cum += s.pricePerKwh * s.energyKwh;
      points.push({ cum, idx: i + 1 });
    });
    return this.toPath(points);
  });

  readonly maxY = computed(() => {
    const a = this.naivePoints();
    const b = this.optimizedPoints();
    return Math.max(1, ...a.map((p) => p.cum), ...b.map((p) => p.cum));
  });

  readonly naivePath = computed(() => this.buildPath(this.naivePoints()));
  readonly optimizedPath = computed(() => this.buildPath(this.optimizedPoints()));

  readonly naiveTotal = computed(() => {
    const pts = this.naivePoints();
    return pts.length ? pts[pts.length - 1].cum : 0;
  });
  readonly optTotal = computed(() => {
    const pts = this.optimizedPoints();
    return pts.length ? pts[pts.length - 1].cum : 0;
  });
  readonly savings = computed(() => {
    const n = this.naiveTotal();
    return n > 0 ? Math.max(0, (n - this.optTotal()) / n) : 0;
  });

  readonly yTicks = computed(() => {
    const max = this.maxY();
    return [0, max / 2, max].map((v) => ({
      v,
      y: this.scaleY(v, max),
    }));
  });

  readonly xTicks = computed(() => {
    const slots = this.slots();
    if (slots.length === 0) return [];
    const stride = Math.max(1, Math.floor(slots.length / 6));
    const ticks: { x: number; label: string }[] = [];
    for (let i = 0; i < slots.length; i += stride) {
      ticks.push({
        x: this.scaleX(i, slots.length),
        label: new Date(slots[i].startsAt).getHours().toString().padStart(2, "0"),
      });
    }
    return ticks;
  });

  private toPath(points: { cum: number; idx: number }[]): PathPoint[] {
    const slots = this.slots();
    const len = slots.length;
    if (len === 0) return [];
    const max = Math.max(1, ...points.map((p) => p.cum));
    return points.map((p) => ({
      x: this.scaleX(p.idx, len),
      y: this.scaleY(p.cum, max),
      cum: p.cum,
    }));
  }

  private buildPath(points: PathPoint[]): string {
    if (points.length === 0) return "";
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");
  }

  private scaleX(idx: number, len: number): number {
    if (len <= 0) return PAD_L;
    return PAD_L + (idx / len) * (W - PAD_L - PAD_R);
  }

  private scaleY(value: number, max: number): number {
    const innerH = H - PAD_T - PAD_B;
    if (max <= 0) return H - PAD_B;
    return H - PAD_B - (value / max) * innerH;
  }
}
