/**
 * Pure math + small injectables for the image canvas. Kept out of the
 * component so coordinate transforms and drawing rules are unit-testable
 * without a DOM. Coordinate conventions (unchanged from legacy):
 *
 * - session data (boundary nodes, samples) is image-NORMALIZED: 0–1
 *   fractions of image width/height;
 * - the SVG is sized to the image fitted inside the panel ("display px"),
 *   with a translate/scale zoom transform applied to one inner group.
 */
import { SampleV1, Vec2 } from '@quadrator/core';
import { InjectionKey } from 'vue';

export interface FittedSize {
  width: number;
  height: number;
}

export interface CanvasTransform {
  k: number;
  x: number;
  y: number;
}

/** Identity zoom/pan. */
export const IDENTITY: CanvasTransform = { k: 1, x: 0, y: 0 };

/** Largest width×height of the given aspect that fits inside the container. */
export function fitContain(
  containerWidth: number,
  containerHeight: number,
  aspect: number
): FittedSize {
  if (containerWidth <= 0 || containerHeight <= 0 || !(aspect > 0)) {
    return { width: 0, height: 0 };
  }
  if (aspect > containerWidth / containerHeight) {
    return { width: containerWidth, height: containerWidth / aspect };
  }
  return { width: containerHeight * aspect, height: containerHeight };
}

/**
 * Convert a pointer position (px relative to the SVG's top-left) to
 * image-normalized coordinates, undoing the zoom/pan transform.
 */
export function toNormalized(
  px: number,
  py: number,
  t: CanvasTransform,
  fitted: FittedSize
): Vec2 {
  return {
    x: (px - t.x) / t.k / fitted.width,
    y: (py - t.y) / t.k / fitted.height,
  };
}

/**
 * Polygon-close tolerance: a click lands "on" the first node when both
 * normalized deltas are under 0.025 (legacy rule — per-axis, not radial).
 */
export const CLOSE_TOLERANCE = 0.025;

export function nearFirstNode(nodes: readonly Vec2[], p: Vec2): boolean {
  const first = nodes[0];
  if (first === undefined) return false;
  return Math.abs(p.x - first.x) < CLOSE_TOLERANCE && Math.abs(p.y - first.y) < CLOSE_TOLERANCE;
}

/**
 * Overlay elements (circles, strokes, crosshair) shrink as the user zooms in
 * so they stay visually similar — legacy's half-compensation curve: fully
 * constant would be 1/k, this deliberately lets elements grow/shrink a bit.
 */
export function overlayScale(k: number): number {
  return 1 / (0.5 + 0.5 * k);
}

export interface SampleColor {
  fill: string;
  stroke: string;
}

/**
 * Legacy sample-point palette: the current sample renders as crosshair only
 * (invisible circle keeps its click target), tagged samples are blue,
 * untagged orange.
 */
export function sampleColor(sample: SampleV1, isCurrent: boolean): SampleColor {
  if (isCurrent) return { fill: 'none', stroke: 'none' };
  if (sample.codes.length > 0) return { fill: 'lightblue', stroke: 'blue' };
  return { fill: 'orange', stroke: 'darkorange' };
}

/**
 * Resolve an image URL's natural size. Injectable so component tests (no
 * real image loading in happy-dom) can stub it.
 */
export type ImageSizer = (url: string) => Promise<{ width: number; height: number }>;

export const imageSizerKey: InjectionKey<ImageSizer> = Symbol('imageSizer');

export const naturalImageSize: ImageSizer = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = url;
  });
