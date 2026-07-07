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
 */
import { GeometryError, Vec2, mulberry32, samplePolygon } from '@quadrator/core';
import { select } from 'd3-selection';
import { type D3ZoomEvent, type ZoomBehavior, zoom as d3zoom, zoomIdentity } from 'd3-zoom';
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  IDENTITY,
  fitContain,
  imageSizerKey,
  naturalImageSize,
  nearFirstNode,
  overlayScale,
  sampleColor,
  toNormalized,
} from '../canvas.ts';
import { usePlatform } from '../platform.ts';
import { useSessionStore } from '../stores/session.ts';
import { useTaggingStore } from '../stores/tagging.ts';

// Legacy overlay sizes in display px at zoom 1 (ImageViewer svgSizes).
const NODE_RADIUS = 8;
const SAMPLE_RADIUS = 8;
const LINE_WIDTH = 2;
const CIRCLE_STROKE_WIDTH = 1;
const CROSSHAIR_LENGTH = 16;
const CROSSHAIR_STROKE_WIDTH = 1;

const platform = usePlatform();
const session = useSessionStore();
const tagging = useTaggingStore();
const sizeImage = inject(imageSizerKey, naturalImageSize);

const container = ref<HTMLDivElement | null>(null);
const svgEl = ref<SVGSVGElement | null>(null);

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
const transform = ref(IDENTITY);

const quadrat = computed(() => session.currentQuadrat);
const geoDefined = computed(() => quadrat.value?.geoDefined === true);
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
 * Equal-area cut lines (legacy yellow overlay). Not persisted in v1, but the
 * sampling is seeded so they are reproducible from boundary + rngSeed; if
 * the recomputed points no longer match the stored samples (e.g. settings
 * changed after the boundary was defined), draw nothing rather than a
 * misleading partition.
 */
const cutLines = computed<readonly [Vec2, Vec2][]>(() => {
  const q = quadrat.value;
  const settings = session.session?.settings;
  if (q === null || settings === undefined || !q.geoDefined || q.rngSeed === null) return [];
  if (settings.restrictToQuad || q.boundary.length === 4) return [];
  try {
    const n = settings.numOfSampleRows * settings.numOfSampleCols;
    const result = samplePolygon(q.boundary, n, mulberry32(q.rngSeed));
    const matches =
      result.points.length === q.samples.length &&
      result.points.every((p, i) => p.x === q.samples[i]?.x && p.y === q.samples[i]?.y);
    return matches ? result.cutLines : [];
  } catch {
    return [];
  }
});

function toPoints(ring: readonly Vec2[]): string {
  return ring.map((p) => `${p.x * fitted.value.width},${p.y * fitted.value.height}`).join(' ');
}

const cursorStyle = computed(() => {
  if (geoDefined.value) return 'grab';
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

function complete(): void {
  const ring = drawnNodes.value.map((p) => ({ x: p.x, y: p.y }));
  drawnNodes.value = [];
  nearStart.value = false;
  try {
    session.defineBoundary(ring);
  } catch (error) {
    if (!(error instanceof GeometryError)) throw error;
    drawError.value = error.message;
  }
}

function onSvgClick(event: MouseEvent): void {
  const settings = session.session?.settings;
  if (quadrat.value === null || settings === undefined) return;
  if (geoDefined.value || imageUrl.value === null || fitted.value.width === 0) return;

  const p = eventToNormalized(event);
  // Polygon mode closes on a click near the first node (legacy 0.025 rule);
  // ≥3 nodes required so a stray double-click can't commit a degenerate ring.
  if (!settings.restrictToQuad && drawnNodes.value.length >= 3 && nearFirstNode(drawnNodes.value, p)) {
    complete();
    return;
  }
  drawError.value = null;
  drawnNodes.value.push(p);
  if (settings.restrictToQuad && drawnNodes.value.length === 4) complete();
}

function onSvgMouseMove(event: MouseEvent): void {
  if (geoDefined.value || session.session?.settings.restrictToQuad !== false) {
    nearStart.value = false;
    return;
  }
  nearStart.value =
    drawnNodes.value.length >= 3 && nearFirstNode(drawnNodes.value, eventToNormalized(event));
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
      transform.value = { k: event.transform.k, x: event.transform.x, y: event.transform.y };
    });
  select(svg).call(zoomBehavior).on('dblclick.zoom', null);

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

onBeforeUnmount(() => resizeObserver?.disconnect());

function resetView(): void {
  transform.value = IDENTITY;
  if (svgEl.value !== null && zoomBehavior !== null) {
    select(svgEl.value).call(zoomBehavior.transform, zoomIdentity);
  }
}

// Reset Nodes / quadrat switch: drop any in-progress drawing and re-center.
watch(
  () => [quadrat.value?.id, geoDefined.value],
  () => {
    drawnNodes.value = [];
    nearStart.value = false;
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
    >
      <g :transform="`translate(${transform.x},${transform.y}) scale(${transform.k})`">
        <image
          v-if="imageUrl !== null"
          :href="imageUrl"
          :width="fitted.width"
          :height="fitted.height"
          preserveAspectRatio="none"
        />

        <line
          v-for="(cut, i) in cutLines"
          :key="`cut-${i}`"
          :x1="cut[0].x * fitted.width"
          :y1="cut[0].y * fitted.height"
          :x2="cut[1].x * fitted.width"
          :y2="cut[1].y * fitted.height"
          stroke="yellow"
          :stroke-width="LINE_WIDTH * scale"
          data-test="cut-line"
        />

        <!-- boundary: closed polygon once defined, open polyline while drawing -->
        <polygon
          v-if="geoDefined && nodes.length > 0"
          :points="toPoints(nodes)"
          fill="none"
          stroke="red"
          :stroke-width="LINE_WIDTH * scale"
          data-test="boundary-polygon"
        />
        <polyline
          v-else-if="nodes.length > 1"
          :points="toPoints(nodes)"
          fill="none"
          stroke="red"
          :stroke-width="LINE_WIDTH * scale"
          data-test="boundary-polyline"
        />
        <circle
          v-for="(node, i) in nodes"
          :key="`node-${i}`"
          :cx="node.x * fitted.width"
          :cy="node.y * fitted.height"
          :r="NODE_RADIUS * scale"
          fill="red"
          :stroke-width="CIRCLE_STROKE_WIDTH * scale"
          data-test="node-circle"
        />

        <template v-for="sample in samples" :key="sample.index">
          <circle
            v-if="sample.x !== null && sample.y !== null"
            :cx="sample.x * fitted.width"
            :cy="sample.y * fitted.height"
            :r="SAMPLE_RADIUS * scale"
            v-bind="sampleColor(sample, sample.index === tagging.cursor)"
            :stroke-width="CIRCLE_STROKE_WIDTH * scale"
            pointer-events="all"
            class="sample-circle"
            :data-test="`sample-${sample.index}`"
            @click.stop="tagging.selectSampleOnCanvas(sample.index)"
          />
        </template>

        <!-- the current sample renders as a yellow crosshair instead of a circle -->
        <g v-if="currentSample !== null" data-test="crosshair">
          <line
            :x1="currentSample.x! * fitted.width - CROSSHAIR_LENGTH * scale"
            :y1="currentSample.y! * fitted.height"
            :x2="currentSample.x! * fitted.width + CROSSHAIR_LENGTH * scale"
            :y2="currentSample.y! * fitted.height"
            stroke="yellow"
            :stroke-width="CROSSHAIR_STROKE_WIDTH * scale"
          />
          <line
            :x1="currentSample.x! * fitted.width"
            :y1="currentSample.y! * fitted.height - CROSSHAIR_LENGTH * scale"
            :x2="currentSample.x! * fitted.width"
            :y2="currentSample.y! * fitted.height + CROSSHAIR_LENGTH * scale"
            stroke="yellow"
            :stroke-width="CROSSHAIR_STROKE_WIDTH * scale"
          />
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

.sample-circle {
  cursor: pointer;
}

.draw-error {
  position: absolute;
  top: 8px;
  left: 8px;
  right: 8px;
  z-index: 1;
}
</style>
