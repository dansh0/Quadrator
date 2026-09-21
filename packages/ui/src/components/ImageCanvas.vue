<script setup lang="ts">
/**
 * Survey-image canvas: displays the current quadrat's image, lets the user
 * draw its boundary (quad or polygon mode), and renders the generated sample
 * points. Port of the legacy d3 ImageViewer with the drawing state held in
 * Vue refs and the SVG rendered declaratively — d3 is reduced to d3-zoom for
 * pan/zoom (DESIGN.md §3).
 *
 * Coordinates: session data is image-normalized (0–1); the SVG is sized to
 * the image fitted inside the panel, and zoom/pan is a translate/scale
 * transform on the inner group (see canvas.ts).
 *
 * Drawing depends on the session's `shape` setting:
 * - `quad` completes on the fourth click,
 * - `square` completes on the SECOND — that click fixes one side and the
 *   square is built at a right angle to it,
 * - `n-poly` completes when the user clicks back on the first node.
 *
 * Holding Ctrl snaps the segment being drawn to 15° steps and, from the
 * third vertex of a quad or polygon, forces it to the previous segment's
 * length. Both are measured in display pixels, never in normalized
 * coordinates — see the note in canvas.ts.
 */
import { GeometryError, Vec2 } from '@quadrator/core';
import { select } from 'd3-selection';
import { type D3ZoomEvent, type ZoomBehavior, zoom as d3zoom, zoomIdentity } from 'd3-zoom';
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref, useId, watch } from 'vue';
import {
  type CanvasTransform,
  IDENTITY,
  OVERLAY,
  constrainPoint,
  crosshairArms,
  easeInOutCubic,
  panDuration,
  fitContain,
  imageSizerKey,
  naturalImageSize,
  nearFirstNode,
  overlayScale,
  prefersReducedMotion,
  quadratGridLines,
  recentreTarget,
  sampleColor,
  squareRing,
  toNormalized,
} from '../canvas.ts';
import { Picker } from '../selection.ts';
import { usePlatform } from '../platform.ts';
import { useSessionStore } from '../stores/session.ts';
import { useTaggingStore } from '../stores/tagging.ts';

// Overlay palette and sizes (display px at zoom 1) live in canvas.ts so the
// look is defined in one place; see the OVERLAY comment for why the marks
// are cased rather than simply brighter.

const platform = usePlatform();
const session = useSessionStore();
const tagging = useTaggingStore();
const sizeImage = inject(imageSizerKey, naturalImageSize);

const container = ref<HTMLDivElement | null>(null);
const svgEl = ref<SVGSVGElement | null>(null);
// Filter ids are document-global, so two mounted canvases would collide.
const casingId = `quadrat-casing-${useId()}`;
// Sample points are small targets; picking resolves overlapping hit areas by
// distance so the nearest point wins, not whichever SVG painted last.
const samplePicker = new Picker<number>(OVERLAY.SAMPLE_PICK_RADIUS);

// happy-dom reports zero-sized elements; the default keeps math finite there
// and is immediately replaced by the ResizeObserver in real browsers.
const containerSize = reactive({ width: 800, height: 600 });
const imageUrl = ref<string | null>(null);
const natural = reactive({ width: 0, height: 0 });
const loadError = ref<string | null>(null);
const drawError = ref<string | null>(null);
/** In-progress boundary (image-normalized). Never touches the store until complete. */
const drawnNodes = ref<Vec2[]>([]);
/** Pointer is close enough to the first node for the next click to close the polygon. */
const nearStart = ref(false);
/** Last pointer position (image-normalized, unconstrained); null when off-canvas. */
const pointer = ref<Vec2 | null>(null);
/** Ctrl is down, so the segment being drawn is angle- and length-locked. */
const ctrlHeld = ref(false);
const transform = ref(IDENTITY);

const quadrat = computed(() => session.currentQuadrat);
const geoDefined = computed(() => quadrat.value?.geoDefined === true);
const shape = computed(() => session.session?.settings.shape ?? 'n-poly');
const fitted = computed(() =>
  natural.width > 0
    ? fitContain(containerSize.width, containerSize.height, natural.width / natural.height)
    : { width: 0, height: 0 }
);
const scale = computed(() => overlayScale(transform.value.k));
/** Nodes to render: committed boundary once defined, else the drawing in progress. */
const nodes = computed<readonly Vec2[]>(() =>
  geoDefined.value ? (quadrat.value?.boundary ?? []) : drawnNodes.value
);
const samples = computed(() => (geoDefined.value ? (quadrat.value?.samples ?? []) : []));
const currentSample = computed(() => {
  const s = samples.value[tagging.cursor];
  return s !== undefined && s.x !== null && s.y !== null ? s : null;
});

/**
 * The partition the samples sit on (grid cells or equal-area cuts), drawn
 * only when it provably matches the stored points — see quadratGridLines.
 */
const gridLines = computed<readonly [Vec2, Vec2][]>(() =>
  quadratGridLines(quadrat.value, session.session?.settings)
);

/**
 * Ctrl locks the segment's angle to 15° steps, and from the third vertex on
 * also its length to the previous segment's. A square is fixed by two
 * clicks, so it never has a previous segment to match.
 */
const constraints = computed(() => ({
  snapAngle: ctrlHeld.value,
  equalLength: ctrlHeld.value && shape.value !== 'square' && drawnNodes.value.length >= 2,
}));

/** Where the next vertex would land, with the active constraints applied. */
const previewPoint = computed<Vec2 | null>(() => {
  if (geoDefined.value || pointer.value === null || drawnNodes.value.length === 0) return null;
  return constrainPoint(drawnNodes.value, pointer.value, fitted.value, constraints.value);
});

/**
 * Rubber band from the last placed vertex to where the next one would go.
 * In square mode it shows the finished square instead, since the second
 * click commits the whole shape — the user should see it before clicking.
 */
const previewRing = computed<readonly Vec2[]>(() => {
  const p = previewPoint.value;
  const first = drawnNodes.value[0];
  if (p === null || first === undefined) return [];
  if (shape.value === 'square') return squareRing(first, p, fitted.value);
  return [drawnNodes.value[drawnNodes.value.length - 1]!, p];
});

/** The square preview is a finished shape; the rubber band is an open line. */
const previewClosed = computed(() => shape.value === 'square' && previewRing.value.length === 4);

/**
 * The current sample's crosshair: four tapered arms converging on the point
 * (see crosshairArms). Each is a polygon, since stroke width cannot vary.
 */
const crosshair = computed(() => {
  const s = currentSample.value;
  if (s === null) return [];
  const centre = { x: s.x! * fitted.value.width, y: s.y! * fitted.value.height };
  return crosshairArms(centre, scale.value).map((arm) =>
    arm.map((p) => `${p.x},${p.y}`).join(' ')
  );
});

function toPoints(ring: readonly Vec2[]): string {
  return ring.map((p) => `${p.x * fitted.value.width},${p.y * fitted.value.height}`).join(' ');
}

/** Sample points as pick candidates; unplaced samples cannot be selected. */
const sampleCandidates = computed(() =>
  samples.value
    .filter((s) => s.x !== null && s.y !== null)
    .map((s) => ({ value: s.index, at: { x: s.x!, y: s.y! } }))
);

/** Pointer is within reach of a sample, so a click would select it. */
const overSample = computed(() => {
  if (!geoDefined.value || pointer.value === null) return false;
  return samplePicker.hits(sampleCandidates.value, pointer.value, fitted.value, scale.value);
});

const cursorStyle = computed(() => {
  if (geoDefined.value) return overSample.value ? 'pointer' : 'grab';
  return nearStart.value ? 'crosshair' : 'default';
});

// ---- image loading ----------------------------------------------------------

async function loadCurrentImage(): Promise<void> {
  const q = quadrat.value;
  imageUrl.value = null;
  loadError.value = null;
  if (q === null) return;
  const ref = { id: q.imagePath, name: q.name };
  try {
    const url = await platform.loadImage(ref);
    const size = await sizeImage(url);
    // the quadrat may have changed while we awaited
    if (session.currentQuadrat?.id !== q.id) return;
    natural.width = size.width;
    natural.height = size.height;
    imageUrl.value = url;
  } catch {
    if (session.currentQuadrat?.id !== q.id) return;
    loadError.value = q.imagePath;
  }
}

/** Session re-link flow: ask the user to locate the moved/missing image. */
async function onRelink(): Promise<void> {
  const q = quadrat.value;
  if (q === null) return;
  const found = await platform.relinkImage({ id: q.imagePath, name: q.name });
  if (found === null) return;
  q.imagePath = found.id; // the imagePath watcher retries the load
  session.dirty = true;
}

watch(
  () => [quadrat.value?.id, quadrat.value?.imagePath],
  () => void loadCurrentImage(),
  { immediate: true }
);

// ---- boundary drawing ---------------------------------------------------------

function eventToNormalized(event: MouseEvent): Vec2 {
  const rect = svgEl.value?.getBoundingClientRect() ?? { left: 0, top: 0 };
  return toNormalized(
    event.clientX - rect.left,
    event.clientY - rect.top,
    transform.value,
    fitted.value
  );
}

function complete(nodes: readonly Vec2[]): void {
  const ring = nodes.map((p) => ({ x: p.x, y: p.y }));
  drawnNodes.value = [];
  nearStart.value = false;
  pointer.value = null;
  try {
    session.defineBoundary(ring);
  } catch (error) {
    if (!(error instanceof GeometryError)) throw error;
    drawError.value = error.message;
  }
}

function onSvgClick(event: MouseEvent): void {
  if (quadrat.value === null || session.session === null) return;
  if (imageUrl.value === null || fitted.value.width === 0) return;

  // Once the boundary exists, a click selects the nearest sample point
  // rather than drawing. d3-zoom suppresses the click that ends a pan, so
  // panning never selects.
  if (geoDefined.value) {
    const hit = samplePicker.nearest(
      sampleCandidates.value,
      eventToNormalized(event),
      fitted.value,
      scale.value
    );
    if (hit !== null) tagging.selectSampleOnCanvas(hit.value);
    return;
  }

  ctrlHeld.value = event.ctrlKey;
  pointer.value = eventToNormalized(event);
  const p = previewPoint.value ?? pointer.value;

  // Polygon mode closes on a click near the first node (legacy 0.025 rule);
  // ≥3 nodes required so a stray double-click can't commit a degenerate ring.
  // The test runs on the CONSTRAINED point, so with Ctrl held the lock can
  // put the close out of reach — release Ctrl to finish the ring.
  if (shape.value === 'n-poly' && drawnNodes.value.length >= 3 && nearFirstNode(drawnNodes.value, p)) {
    complete(drawnNodes.value);
    return;
  }

  drawError.value = null;

  // A square is fully determined by its first side: the second click both
  // places the vertex and commits the shape.
  if (shape.value === 'square' && drawnNodes.value.length === 1) {
    complete(squareRing(drawnNodes.value[0]!, p, fitted.value));
    return;
  }

  drawnNodes.value.push(p);
  if (shape.value === 'quad' && drawnNodes.value.length === 4) complete(drawnNodes.value);
}

function onSvgMouseMove(event: MouseEvent): void {
  pointer.value = eventToNormalized(event);
  // Tracked past geoDefined too, so the cursor can report a pickable sample.
  if (geoDefined.value) {
    nearStart.value = false;
    return;
  }
  ctrlHeld.value = event.ctrlKey;
  nearStart.value =
    shape.value === 'n-poly' &&
    drawnNodes.value.length >= 3 &&
    nearFirstNode(drawnNodes.value, previewPoint.value ?? pointer.value);
}

function onSvgMouseLeave(): void {
  pointer.value = null;
  nearStart.value = false;
}

/**
 * Ctrl is read off each mouse event, but the preview also has to react when
 * the key is pressed or released without the pointer moving. Window blur
 * clears it: a Ctrl+Tab away would otherwise leave the lock stuck on.
 */
function onKeyChange(event: KeyboardEvent): void {
  ctrlHeld.value = event.ctrlKey;
}

function onWindowBlur(): void {
  ctrlHeld.value = false;
}

// ---- zoom / pan ---------------------------------------------------------------

let zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> | null = null;
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  const svg = svgEl.value!;
  zoomBehavior = d3zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.01, 100])
    // legacy rule: the view is only zoomable once the boundary is defined
    .filter((event: MouseEvent | WheelEvent) => geoDefined.value && !('button' in event && event.button))
    .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
      // A user-driven gesture wins over a pan in flight; programmatic
      // transforms (our own animation) carry no sourceEvent.
      if (event.sourceEvent !== null && event.sourceEvent !== undefined) cancelPan();
      transform.value = { k: event.transform.k, x: event.transform.x, y: event.transform.y };
    });
  select(svg).call(zoomBehavior).on('dblclick.zoom', null);

  window.addEventListener('keydown', onKeyChange);
  window.addEventListener('keyup', onKeyChange);
  window.addEventListener('blur', onWindowBlur);

  if (typeof ResizeObserver !== 'undefined' && container.value !== null) {
    resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect !== undefined && rect.width > 0 && rect.height > 0) {
        containerSize.width = rect.width;
        containerSize.height = rect.height;
      }
    });
    resizeObserver.observe(container.value);
  }
});

onBeforeUnmount(() => {
  cancelPan();
  resizeObserver?.disconnect();
  window.removeEventListener('keydown', onKeyChange);
  window.removeEventListener('keyup', onKeyChange);
  window.removeEventListener('blur', onWindowBlur);
});

function resetView(): void {
  cancelPan();
  transform.value = IDENTITY;
  if (svgEl.value !== null && zoomBehavior !== null) {
    select(svgEl.value).call(zoomBehavior.transform, zoomIdentity);
  }
}

// ---- keeping the current sample in view ---------------------------------------

/** Handle of the running pan animation, or null when the view is still. */
let panFrame: number | null = null;

function cancelPan(): void {
  if (panFrame !== null) {
    cancelAnimationFrame(panFrame);
    panFrame = null;
  }
}

/** Push a transform through d3-zoom so its internal state stays in step. */
function applyTransform(t: CanvasTransform): void {
  const svg = svgEl.value;
  if (svg === null || zoomBehavior === null) return;
  select(svg).call(zoomBehavior.transform, zoomIdentity.translate(t.x, t.y).scale(t.k));
}

/**
 * Glide the view to `target`, easing in and out. Driving d3-zoom every frame
 * (rather than animating a separate transform) keeps a pan the user starts
 * mid-flight from jumping.
 */
function panTo(target: CanvasTransform): void {
  cancelPan();
  const start = { ...transform.value };
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  // Sub-pixel moves are not worth animating, or noticing.
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

  const duration = panDuration(Math.hypot(dx, dy));
  let began: number | null = null;
  const step = (now: number): void => {
    began ??= now;
    const progress = Math.min(1, (now - began) / duration);
    const eased = easeInOutCubic(progress);
    applyTransform({ k: target.k, x: start.x + dx * eased, y: start.y + dy * eased });
    panFrame = progress < 1 ? requestAnimationFrame(step) : null;
  };
  panFrame = requestAnimationFrame(step);
}

/**
 * Navigating to a sample brings it into view when it is not already there.
 * Every condition lives in recentreTarget; the OS "reduce motion" setting is
 * folded in here because it is an environment query, not a pure input.
 */
watch(
  () => tagging.cursor,
  () => {
    if (!geoDefined.value) return;
    const s = currentSample.value;
    const preference = tagging.recentreMotion;
    const motion =
      preference !== 'off' && prefersReducedMotion() ? 'instant' : preference;

    const move = recentreTarget({
      at: s === null ? null : { x: s.x!, y: s.y! },
      fromCanvasClick: tagging.cursorSource === 'canvas',
      fitted: fitted.value,
      current: transform.value,
      motion,
    });
    if (move === null) return;
    if (move.animate) panTo(move.transform);
    else applyTransform(move.transform);
  }
);

// Reset Nodes / quadrat switch: drop any in-progress drawing and re-center.
watch(
  () => [quadrat.value?.id, geoDefined.value, shape.value],
  () => {
    // Switching shape mid-draw would mix rules (e.g. two square clicks left
    // over in quad mode), so the in-progress ring is dropped.
    drawnNodes.value = [];
    nearStart.value = false;
    pointer.value = null;
    drawError.value = null;
    resetView();
  }
);
</script>

<template>
  <div ref="container" class="canvas-container" data-test="image-canvas">
    <!-- missing image: keep the quadrat's data, offer the re-link flow -->
    <div v-if="loadError !== null" class="fill-height d-flex align-center justify-center">
      <v-alert type="warning" variant="tonal" max-width="440" data-test="image-load-error">
        <div class="mb-2">
          Image not found: <code>{{ loadError }}</code>
        </div>
        <v-btn color="primary" size="small" data-test="relink-image" @click="onRelink">
          Locate image…
        </v-btn>
      </v-alert>
    </div>

    <v-alert
      v-if="drawError !== null"
      type="error"
      density="compact"
      closable
      class="draw-error"
      data-test="draw-error"
      @click:close="drawError = null"
    >
      {{ drawError }}
    </v-alert>

    <svg
      ref="svgEl"
      :width="fitted.width"
      :height="fitted.height"
      :style="{ cursor: cursorStyle }"
      data-test="canvas-svg"
      @click="onSvgClick"
      @mousemove="onSvgMouseMove"
      @mouseleave="onSvgMouseLeave"
      @contextmenu.prevent
    >
      <defs>
        <!-- Zero-offset dark shadow = a casing around every overlay mark, so
             thin lines and small dots separate from whatever is under them.
             The blur is scaled with the overlay so it stays a hairline rather
             than a smudge as the user zooms in. -->
        <filter :id="casingId" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow
            dx="0"
            dy="0"
            :stdDeviation="OVERLAY.CASING_BLUR * scale"
            :flood-color="OVERLAY.CASING"
            flood-opacity="1"
          />
        </filter>
      </defs>

      <g :transform="`translate(${transform.x},${transform.y}) scale(${transform.k})`">
        <image
          v-if="imageUrl !== null"
          :href="imageUrl"
          :width="fitted.width"
          :height="fitted.height"
          preserveAspectRatio="none"
        />

        <!-- everything below is cased; the image above must stay untouched -->
        <g :filter="`url(#${casingId})`">
          <line
            v-for="(cut, i) in gridLines"
            :key="`cut-${i}`"
            :x1="cut[0].x * fitted.width"
            :y1="cut[0].y * fitted.height"
            :x2="cut[1].x * fitted.width"
            :y2="cut[1].y * fitted.height"
            :stroke="OVERLAY.GRID"
            :stroke-opacity="OVERLAY.GRID_OPACITY"
            :stroke-width="OVERLAY.GRID_WIDTH * scale"
            data-test="cut-line"
          />

          <!-- boundary: closed polygon once defined, open polyline while drawing -->
          <polygon
            v-if="geoDefined && nodes.length > 0"
            :points="toPoints(nodes)"
            fill="none"
            :stroke="OVERLAY.BOUNDARY"
            :stroke-width="OVERLAY.BOUNDARY_WIDTH * scale"
            stroke-linejoin="round"
            data-test="boundary-polygon"
          />
          <polyline
            v-else-if="nodes.length > 1"
            :points="toPoints(nodes)"
            fill="none"
            :stroke="OVERLAY.BOUNDARY"
            :stroke-width="OVERLAY.BOUNDARY_WIDTH * scale"
            stroke-linejoin="round"
            stroke-linecap="round"
            data-test="boundary-polyline"
          />
          <!-- where the next vertex would land: the rubber band, or in square
               mode the whole square the next click commits -->
          <polygon
            v-if="previewClosed"
            :points="toPoints(previewRing)"
            fill="none"
            :stroke="OVERLAY.BOUNDARY"
            :stroke-dasharray="`${6 * scale} ${4 * scale}`"
            :stroke-width="OVERLAY.BOUNDARY_WIDTH * scale"
            :stroke-opacity="0.85"
            data-test="preview-ring"
          />
          <polyline
            v-else-if="previewRing.length > 1"
            :points="toPoints(previewRing)"
            fill="none"
            :stroke="OVERLAY.BOUNDARY"
            :stroke-dasharray="`${6 * scale} ${4 * scale}`"
            :stroke-width="OVERLAY.BOUNDARY_WIDTH * scale"
            :stroke-opacity="0.85"
            data-test="preview-ring"
          />
          <circle
            v-if="previewPoint !== null"
            :cx="previewPoint.x * fitted.width"
            :cy="previewPoint.y * fitted.height"
            :r="OVERLAY.NODE_RADIUS * scale"
            fill="none"
            :stroke="OVERLAY.BOUNDARY"
            :stroke-width="OVERLAY.NODE_STROKE_WIDTH * scale"
            :stroke-opacity="0.85"
            data-test="preview-node"
          />

          <!-- Vertex handles while drawing only: once the boundary is set
               they sit on top of the corner samples and obscure the very
               substrate being scored. The polygon still shows the shape. -->
          <circle
            v-for="(node, i) in geoDefined ? [] : nodes"
            :key="`node-${i}`"
            :cx="node.x * fitted.width"
            :cy="node.y * fitted.height"
            :r="OVERLAY.NODE_RADIUS * scale"
            :fill="OVERLAY.BOUNDARY"
            :stroke="OVERLAY.NODE_RIM"
            :stroke-width="OVERLAY.NODE_STROKE_WIDTH * scale"
            paint-order="stroke"
            data-test="node-circle"
          />

          <template v-for="sample in samples" :key="sample.index">
            <circle
              v-if="sample.x !== null && sample.y !== null"
              :cx="sample.x * fitted.width"
              :cy="sample.y * fitted.height"
              :r="OVERLAY.SAMPLE_RADIUS * scale"
              v-bind="sampleColor(sample, sample.index === tagging.cursor)"
              :stroke-width="OVERLAY.SAMPLE_STROKE_WIDTH * scale"
              paint-order="stroke"
              pointer-events="none"
              :data-test="`sample-${sample.index}`"
            />
          </template>

          <!-- the current sample: four tapered arms and no circle, so the
               substrate being scored stays visible under the point -->
          <g v-if="currentSample !== null" data-test="crosshair">
            <polygon
              v-for="(arm, i) in crosshair"
              :key="`crosshair-${i}`"
              :points="arm"
              :fill="OVERLAY.CROSSHAIR"
              stroke="none"
              data-test="crosshair-arm"
            />
          </g>
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.canvas-container {
  position: relative;
  height: 100%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* zoomed content may extend past the fitted SVG box */
.canvas-container svg {
  overflow: visible;
  flex: none;
}

.draw-error {
  position: absolute;
  top: 8px;
  left: 8px;
  right: 8px;
  z-index: 1;
}
</style>
