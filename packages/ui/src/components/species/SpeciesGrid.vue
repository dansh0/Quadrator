<script setup lang="ts">
/**
 * Spreadsheet-style species grid: always-editable cells, Tab/Enter/arrow
 * movement, multi-cell paste from a spreadsheet, colour swatches, a
 * press-a-key Hotkey column and draggable rows. The rules live in
 * species-grid.ts; this component wires them to inputs and focus.
 *
 * Esc restores a cell edited since it was focused; otherwise it bubbles to
 * the dialog, which closes.
 *
 * Keystrokes here bubble to window, where the Species tab's tagging
 * listener ignores anything inside an overlay (SpeciesTab.isTypingTarget) —
 * typing a species name must never tag the current sample.
 */
import type { SpeciesField } from '@quadrator/core';
import { nextTick, ref } from 'vue';
import { classifyCaptureKey } from '../../hotkey-capture.ts';
import {
  type DraftRow,
  GRID_COLUMNS,
  type Move,
  applyPaste,
  autoSelectedColor,
  blankRow,
  isMultiCellPaste,
  moveCell,
  moveRow,
  parseClipboardGrid,
} from '../../species-grid.ts';

const props = defineProps<{
  modelValue: DraftRow[];
  /** `${rowId}:${field}` → message (species-grid.validateDraft). */
  errors: Map<string, string>;
  /** code → key from the automatic layout, for rows without an explicit key. */
  resolvedKeys: Map<string, string>;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', rows: DraftRow[]): void;
}>();

const table = ref<HTMLTableElement | null>(null);
/** Last refused hotkey and why — shown under the grid until the next key. */
const keyMessage = ref<string | null>(null);
/** Cell value when it gained focus, for Escape to restore. */
let focusValue = '';
let dragFrom: number | null = null;

function update(rows: DraftRow[]): void {
  emit('update:modelValue', rows);
}

function setCell(row: number, field: SpeciesField, value: string): void {
  const rows = props.modelValue.map((r, i) => (i === row ? { ...r, [field]: value } : r));
  update(rows);
}

function errorFor(row: DraftRow, field: string): string | undefined {
  return props.errors.get(`${row.id}:${field}`);
}

function keyLabel(row: DraftRow): string {
  if (row.hotkey !== '') return row.hotkey;
  const auto = row.code === '' ? undefined : props.resolvedKeys.get(row.code);
  return auto === undefined ? 'none' : `auto · ${auto}`;
}

function swatch(row: DraftRow, field: 'color' | 'colorSelected'): string {
  if (row[field] !== '') return row[field];
  return field === 'colorSelected' ? autoSelectedColor(row.color) : '';
}

// ---- focus + movement --------------------------------------------------------

function cellAt(row: number, col: number): HTMLElement | null {
  return table.value?.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`) ?? null;
}

async function focusCell(row: number, col: number): Promise<void> {
  await nextTick();
  const el = cellAt(row, col);
  el?.focus();
  if (el instanceof HTMLInputElement) el.select();
}

function posOf(target: EventTarget | null): { row: number; col: number } | null {
  const el = target as HTMLElement | null;
  if (el?.dataset?.['row'] === undefined || el.dataset['col'] === undefined) return null;
  return { row: Number(el.dataset['row']), col: Number(el.dataset['col']) };
}

/** Move focus; Enter/down off the last row adds a blank row first. */
function go(at: { row: number; col: number }, move: Move, grow = false): void {
  const next = moveCell(at, move, props.modelValue.length);
  if (next !== null) {
    void focusCell(next.row, next.col);
  } else if (grow && move === 'down') {
    update([...props.modelValue, blankRow()]);
    void focusCell(at.row + 1, at.col);
  }
}

const ARROWS: Record<string, Move> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

function onKeydown(event: KeyboardEvent): void {
  const at = posOf(event.target);
  if (at === null) return;
  const field = GRID_COLUMNS[at.col]!.field;

  if (event.key === 'Enter') {
    event.preventDefault();
    go(at, 'down', true);
    return;
  }

  if (field === 'hotkey') {
    const move = ARROWS[event.key];
    if (move !== undefined) {
      event.preventDefault();
      go(at, move);
      return;
    }
    const result = classifyCaptureKey(event);
    // Esc has nothing to undo here: it goes on to close the dialog.
    if (result.kind === 'ignore' || result.kind === 'cancel') return;
    event.preventDefault();
    keyMessage.value = result.kind === 'invalid' ? result.message : null;
    if (result.kind === 'bind') setCell(at.row, 'hotkey', result.key);
    if (result.kind === 'clear') setCell(at.row, 'hotkey', '');
    return;
  }

  const input = event.target as HTMLInputElement;
  // Esc first restores a cell edited since it was focused, as in a sheet;
  // with nothing to restore it goes on to close the dialog.
  if (event.key === 'Escape' && input.value !== focusValue) {
    event.stopPropagation();
    setCell(at.row, field, focusValue);
    return;
  }
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    go(at, ARROWS[event.key]!);
    return;
  }
  // Left/right edit text until the caret reaches the edge, as in a sheet.
  const collapsed = input.selectionStart === input.selectionEnd;
  if (event.key === 'ArrowLeft' && collapsed && input.selectionStart === 0) {
    event.preventDefault();
    go(at, 'left');
  } else if (event.key === 'ArrowRight' && collapsed && input.selectionEnd === input.value.length) {
    event.preventDefault();
    go(at, 'right');
  }
}

function onFocusIn(event: FocusEvent): void {
  const t = event.target as HTMLInputElement | null;
  focusValue = t?.value ?? '';
  keyMessage.value = null;
}

function onPaste(event: ClipboardEvent): void {
  const at = posOf(event.target);
  const text = event.clipboardData?.getData('text/plain') ?? '';
  if (at === null || text === '') return;
  const isKeyCell = GRID_COLUMNS[at.col]!.field === 'hotkey';
  if (!isMultiCellPaste(text) && !isKeyCell) return; // ordinary paste into one input
  event.preventDefault();
  update(applyPaste(props.modelValue, at, parseClipboardGrid(text)));
}

// ---- rows ----------------------------------------------------------------------

function insertAt(index: number): void {
  const rows = [...props.modelValue];
  rows.splice(index, 0, blankRow());
  update(rows);
  void focusCell(index, 0);
}

function duplicate(index: number): void {
  const source = props.modelValue[index]!;
  // Same code and key would both clash; the code error prompts the edit.
  const copy = { ...source, id: blankRow().id, originalCode: null, hotkey: '' };
  const rows = [...props.modelValue];
  rows.splice(index + 1, 0, copy);
  update(rows);
  void focusCell(index + 1, 0);
}

function remove(index: number): void {
  update(props.modelValue.filter((_, i) => i !== index));
}

function shift(index: number, to: number): void {
  update(moveRow(props.modelValue, index, to));
}

function startDrag(index: number | null): void {
  dragFrom = index;
}

function onDrop(index: number): void {
  if (dragFrom !== null && dragFrom !== index) shift(dragFrom, index);
  dragFrom = null;
}

function addRow(): void {
  insertAt(props.modelValue.length);
}
</script>

<template>
  <div class="species-grid-wrap">
    <table
      ref="table"
      class="species-grid"
      data-test="species-grid"
      @keydown="onKeydown"
      @paste="onPaste"
      @focusin="onFocusIn"
    >
      <thead>
        <tr>
          <th class="handle-col" aria-label="Reorder" />
          <th v-for="col in GRID_COLUMNS" :key="col.field" :class="`col-${col.field}`">
            {{ col.label }}
          </th>
          <th class="actions-col" aria-label="Row actions" />
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, r) in modelValue"
          :key="row.id"
          :data-test="`grid-row-${r}`"
          @dragover.prevent
          @drop.prevent="onDrop(r)"
        >
          <td class="handle-col">
            <span
              class="drag-handle"
              draggable="true"
              title="Drag to reorder"
              @dragstart="startDrag(r)"
              @dragend="startDrag(null)"
            >
              <v-icon size="small">mdi-drag</v-icon>
            </span>
          </td>

          <td
            v-for="(col, c) in GRID_COLUMNS"
            :key="col.field"
            :class="{ 'cell--error': errorFor(row, col.field) !== undefined }"
            :title="errorFor(row, col.field) ?? ''"
          >
            <button
              v-if="col.field === 'hotkey'"
              type="button"
              class="cell cell-key"
              :class="{ 'cell-key--auto': row.hotkey === '' }"
              :data-row="r"
              :data-col="c"
              :data-test="`cell-${r}-hotkey`"
              :aria-label="`Hotkey for ${row.code || 'new species'}: ${keyLabel(row)}. Press a key to set, Delete to clear.`"
            >
              {{ keyLabel(row) }}
            </button>

            <div v-else-if="col.field === 'color' || col.field === 'colorSelected'" class="color-cell">
              <v-menu :close-on-content-click="false" location="bottom start">
                <template #activator="{ props: menu }">
                  <button
                    v-bind="menu"
                    type="button"
                    tabindex="-1"
                    class="swatch"
                    :style="{ background: swatch(row, col.field) || 'transparent' }"
                    :data-test="`swatch-${r}-${col.field}`"
                    aria-label="Pick colour"
                  />
                </template>
                <v-color-picker
                  :model-value="swatch(row, col.field) || '#888888'"
                  mode="hex"
                  :modes="['hex']"
                  @update:model-value="(v: unknown) => setCell(r, col.field, String(v).toLowerCase())"
                />
              </v-menu>
              <input
                class="cell"
                :value="row[col.field]"
                :placeholder="col.field === 'colorSelected' && autoSelectedColor(row.color) ? 'auto' : ''"
                :data-row="r"
                :data-col="c"
                :data-test="`cell-${r}-${col.field}`"
                :aria-label="`${col.label}, row ${r + 1}`"
                spellcheck="false"
                @input="setCell(r, col.field, ($event.target as HTMLInputElement).value)"
              />
            </div>

            <input
              v-else
              class="cell"
              :value="row[col.field]"
              :data-row="r"
              :data-col="c"
              :data-test="`cell-${r}-${col.field}`"
              :aria-label="`${col.label}, row ${r + 1}`"
              :spellcheck="col.field === 'species'"
              @input="setCell(r, col.field, ($event.target as HTMLInputElement).value)"
            />
          </td>

          <td class="actions-col">
            <v-menu location="bottom end">
              <template #activator="{ props: menu }">
                <v-btn
                  v-bind="menu"
                  icon="mdi-dots-vertical"
                  size="x-small"
                  variant="text"
                  tabindex="-1"
                  :data-test="`row-menu-${r}`"
                  aria-label="Row actions"
                />
              </template>
              <v-list density="compact">
                <v-list-item title="Insert above" data-test="row-insert-above" @click="insertAt(r)" />
                <v-list-item title="Insert below" data-test="row-insert-below" @click="insertAt(r + 1)" />
                <v-list-item title="Duplicate" data-test="row-duplicate" @click="duplicate(r)" />
                <v-list-item title="Move up" :disabled="r === 0" data-test="row-move-up" @click="shift(r, r - 1)" />
                <v-list-item
                  title="Move down"
                  :disabled="r === modelValue.length - 1"
                  data-test="row-move-down"
                  @click="shift(r, r + 1)"
                />
                <v-list-item title="Delete" base-color="error" data-test="row-delete" @click="remove(r)" />
              </v-list>
            </v-menu>
          </td>
        </tr>
      </tbody>
    </table>

    <div class="d-flex align-center mt-2">
      <v-btn size="small" variant="tonal" prepend-icon="mdi-plus" data-test="add-row" @click="addRow">
        Add species
      </v-btn>
      <span v-if="keyMessage" class="text-caption text-error ml-3" data-test="key-message">
        {{ keyMessage }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.species-grid-wrap {
  overflow-x: auto;
}

.species-grid {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.875rem;
}

.species-grid th {
  text-align: left;
  font-weight: 600;
  padding: 4px 6px;
  white-space: nowrap;
  border-bottom: 2px solid rgba(var(--v-theme-on-surface), 0.3);
}

.species-grid td {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.18);
  padding: 0;
  height: 32px;
}

/* Cells look like a sheet: flat, full-bleed, a clear focus ring. */
.cell {
  width: 100%;
  height: 32px;
  padding: 0 6px;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
}

.cell:focus {
  box-shadow: inset 0 0 0 2px rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
}

.cell--error {
  box-shadow: inset 0 0 0 2px rgb(var(--v-theme-error));
}

.col-code {
  min-width: 80px;
}
.col-species {
  min-width: 180px;
}
.col-group1,
.col-group2 {
  min-width: 110px;
}
.col-color,
.col-colorSelected {
  min-width: 120px;
}
.col-hotkey {
  min-width: 96px;
}

.cell-key {
  cursor: pointer;
  font-family: monospace;
  white-space: nowrap;
}

.cell-key--auto {
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.color-cell {
  display: flex;
  align-items: center;
}

.swatch {
  flex: none;
  width: 18px;
  height: 18px;
  margin-left: 6px;
  border-radius: 3px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.4);
  cursor: pointer;
}

.handle-col,
.actions-col {
  width: 32px;
  text-align: center;
}

.drag-handle {
  cursor: grab;
  display: inline-flex;
  padding: 4px;
}

.species-grid td.handle-col,
.species-grid td.actions-col {
  border-left: none;
  border-right: none;
}
</style>
