import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { TranslatePipe } from "@ngx-translate/core";
import type { ForecastSlot } from "../../services/api.service";

interface Bar {
  x: number;
  y: number;
  w: number;
  h: number;
  hour: number;
  price: number;
  intensity: number;
  highlighted: boolean;
}

const VIEW_W = 600;
const VIEW_H = 140;
const PAD_X = 4;
const PAD_TOP = 8;
const PAD_BOTTOM = 22;

@Component({
  selector: "app-price-sparkline",
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./price-sparkline.component.html",
  styleUrl: "./price-sparkline.component.scss",
})
export class PriceSparklineComponent {
  readonly slots = input.required<ForecastSlot[]>();
  readonly highlightCount = input<number>(0);
  readonly carbonWeight = input<number>(0.3);

  readonly viewBox = `0 0 ${VIEW_W} ${VIEW_H}`;

  /** Index set of slots that score best (price + carbon weighted). */
  private readonly highlightedIdx = computed<Set<number>>(() => {
    const s = this.slots();
    const n = this.highlightCount();
    if (n <= 0 || s.length === 0) return new Set();

    const prices = s.map((x) => x.pricePerKwh);
    const carbons = s.map((x) => x.intensityGCo2PerKwh);
    const norm = (v: number, lo: number, hi: number) =>
      hi === lo ? 0 : (v - lo) / (hi - lo);
    const pMin = Math.min(...prices);
    const pMax = Math.max(...prices);
    const cMin = Math.min(...carbons);
    const cMax = Math.max(...carbons);
    const w = this.carbonWeight();

    const scored = s.map((slot, i) => ({
      i,
      score:
        (1 - w) * norm(slot.pricePerKwh, pMin, pMax) +
        w * norm(slot.intensityGCo2PerKwh, cMin, cMax),
    }));
    scored.sort((a, b) => a.score - b.score);
    return new Set(scored.slice(0, Math.min(n, s.length)).map((x) => x.i));
  });

  readonly bars = computed<Bar[]>(() => {
    const s = this.slots();
    if (s.length === 0) return [];
    const prices = s.map((x) => x.pricePerKwh);
    const pMin = Math.min(...prices);
    const pMax = Math.max(...prices);
    const range = pMax - pMin || 1;

    const innerW = VIEW_W - PAD_X * 2;
    const innerH = VIEW_H - PAD_TOP - PAD_BOTTOM;
    const slotW = innerW / s.length;
    const barW = Math.max(2, slotW - 2);
    const hl = this.highlightedIdx();

    return s.map((slot, i) => {
      const norm = (slot.pricePerKwh - pMin) / range;
      const h = Math.max(2, norm * innerH);
      const x = PAD_X + i * slotW + (slotW - barW) / 2;
      const y = VIEW_H - PAD_BOTTOM - h;
      return {
        x,
        y,
        w: barW,
        h,
        hour: new Date(slot.startsAt).getHours(),
        price: slot.pricePerKwh,
        intensity: slot.intensityGCo2PerKwh,
        highlighted: hl.has(i),
      };
    });
  });

  readonly axisLabels = computed<{ x: number; label: string }[]>(() => {
    const s = this.slots();
    if (s.length === 0) return [];
    const innerW = VIEW_W - PAD_X * 2;
    const slotW = innerW / s.length;
    const stride = Math.max(1, Math.floor(s.length / 6));
    const labels: { x: number; label: string }[] = [];
    for (let i = 0; i < s.length; i += stride) {
      const hour = new Date(s[i].startsAt).getHours();
      labels.push({
        x: PAD_X + i * slotW + slotW / 2,
        label: hour.toString().padStart(2, "0"),
      });
    }
    return labels;
  });

  readonly currency = computed(() => this.slots()[0]?.currency ?? "SEK");
  readonly priceMin = computed(() =>
    this.slots().length ? Math.min(...this.slots().map((s) => s.pricePerKwh)) : 0,
  );
  readonly priceMax = computed(() =>
    this.slots().length ? Math.max(...this.slots().map((s) => s.pricePerKwh)) : 0,
  );

  trackBar = (i: number, _b: Bar) => i;
  trackLabel = (i: number) => i;
}
