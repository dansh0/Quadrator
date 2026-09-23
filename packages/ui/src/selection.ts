/**
 * Click-target selection on the image canvas.
 *
 * Overlay marks are small — a sample point is a 7px dot — so hitting one
 * exactly is fiddly, especially on a laptop trackpad in the field. The fix is
 * a pick radius much larger than the mark, which immediately raises the
 * question the naive approach gets wrong: when two enlarged hit areas
 * overlap, SVG picks whichever element is painted last, not the one the user
 * aimed at. `Picker` resolves overlaps by DISTANCE instead, so the nearest
 * target always wins regardless of render order.
 *
 * It is generic over the target type so every selectable overlay goes through
 * the same rule — sample points today, boundary vertices or annotations later
 * — rather than each growing its own hit-testing.
 *
 * Distances are measured in DISPLAY PIXELS, never in normalized coordinates:
 * normalized 0–1 coords are anisotropic whenever the image is not square, so
 * a radius measured there would be an ellipse on screen (see the note in
 * canvas.ts).
 */
import { Vec2 } from '@quadrator/core';
import { FittedSize, toDisplay } from './canvas.ts';

/** Something selectable, positioned in image-normalized coordinates. */
export interface PickCandidate<T> {
  value: T;
  at: Vec2;
}

export interface Pick<T> {
  value: T;
  /** Distance from the click, in display px — useful for tie-breaking. */
  distance: number;
}

export class Picker<T> {
  /**
   * @param baseRadius how far a click may land from a target and still
   * select it, in display px at zoom 1. Scaled by the caller's overlay
   * factor so the hit area tracks the mark's rendered size.
   */
  constructor(readonly baseRadius: number) {
    if (!(baseRadius > 0)) {
      throw new RangeError(`pick radius must be positive, got ${baseRadius}`);
    }
  }

  /**
   * The candidate nearest `point` and within the pick radius, or null when
   * the click landed on empty canvas.
   *
   * `overlay` is the overlay scale in force (see `overlayScale`), so the hit
   * area grows and shrinks with the marks it covers. Exact ties go to the
   * earlier candidate, which keeps selection deterministic.
   */
  nearest(
    candidates: Iterable<PickCandidate<T>>,
    point: Vec2,
    fitted: FittedSize,
    overlay = 1
  ): Pick<T> | null {
    if (fitted.width === 0 || fitted.height === 0) return null;

    const reach = this.baseRadius * overlay;
    const target = toDisplay(point, fitted);

    let best: Pick<T> | null = null;
    for (const candidate of candidates) {
      const at = toDisplay(candidate.at, fitted);
      const distance = Math.hypot(at.x - target.x, at.y - target.y);
      if (distance > reach) continue;
      if (best === null || distance < best.distance) {
        best = { value: candidate.value, distance };
      }
    }
    return best;
  }

  /** Whether a click here would select anything — for cursor feedback. */
  hits(
    candidates: Iterable<PickCandidate<T>>,
    point: Vec2,
    fitted: FittedSize,
    overlay = 1
  ): boolean {
    return this.nearest(candidates, point, fitted, overlay) !== null;
  }
}
