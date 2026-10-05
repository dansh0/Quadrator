<script setup lang="ts">
/**
 * Settings → Species: define the species list in the app. Edits a draft;
 * nothing reaches the store until Save, and Save is refused while any cell
 * is invalid (the same rules a CSV import must meet). CSV import/export stay
 * as the way teams share lists offline.
 *
 * Tags are stored as codes, so Save checks the open session first: renaming
 * a tagged code offers to rename the tags too, and deleting one warns that
 * those samples will export as UNKNOWN CODE.
 *
 * Esc closes like Cancel (a cell edited since it was focused is restored
 * first, see SpeciesGrid). Every change to the draft goes through `edit`,
 * which records it for undo/redo (draft-history.ts); the history lasts as
 * long as the dialog is open.
 */
import templateCsv from '../../assets/buttons_template.csv?raw';
import {
  type SpeciesEntry,
  formatIssue,
  parseSpeciesCsv,
  resolveHotkeys,
  serializeSpeciesCsv,
  validateSpecies,
} from '@quadrator/core';
import { computed, ref, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { DraftHistory, historyShortcut } from '../../draft-history.ts';
import { usePlatform } from '../../platform.ts';
import {
  type DraftRow,
  blankRow,
  diffCodes,
  fromDraft,
  mergeByCode,
  toDraft,
  validateDraft,
} from '../../species-grid.ts';
import { useSessionStore } from '../../stores/session.ts';
import { useSpeciesStore } from '../../stores/species.ts';
import SpeciesGrid from './SpeciesGrid.vue';

const open = defineModel<boolean>({ required: true });

const platform = usePlatform();
const species = useSpeciesStore();
const session = useSessionStore();
const { smAndDown } = useDisplay();

const rows = ref<DraftRow[]>([]);
const initial = ref('');
const error = ref<string | null>(null);
const notice = ref<string | null>(null);

type Prompt =
  | { kind: 'discard' }
  | { kind: 'import'; entries: SpeciesEntry[] }
  | {
      kind: 'codes';
      entries: SpeciesEntry[];
      renames: Array<{ from: string; to: string; count: number }>;
      deleted: Array<{ code: string; count: number }>;
    };
const prompt = ref<Prompt | null>(null);

const snapshot = (r: readonly DraftRow[]) => JSON.stringify(fromDraft(r));

// ---- undo / redo -----------------------------------------------------------------

/** Rows exactly, ids and blank rows included — adding an empty row is a step. */
const history = new DraftHistory<DraftRow[]>((a, b) => JSON.stringify(a) === JSON.stringify(b));
/** Bumped on every history change; DraftHistory itself is not reactive. */
const historyVersion = ref(0);
const canUndo = computed(() => historyVersion.value >= 0 && history.canUndo);
const canRedo = computed(() => historyVersion.value >= 0 && history.canRedo);

/** The one way the draft changes, so every change can be undone. */
function edit(next: DraftRow[], group?: string): void {
  history.record(rows.value, group ?? null);
  rows.value = next;
  historyVersion.value++;
}

function sealTyping(): void {
  history.seal();
}

function undo(): void {
  const previous = history.undo(rows.value);
  if (previous !== null) rows.value = previous;
  historyVersion.value++;
}

function redo(): void {
  const next = history.redo(rows.value);
  if (next !== null) rows.value = next;
  historyVersion.value++;
}

function onHistoryKey(event: KeyboardEvent): void {
  const action = historyShortcut(event);
  if (action === null || prompt.value !== null) return;
  // Also stops the browser's own input undo, which knows nothing of the grid.
  event.preventDefault();
  if (action === 'undo') undo();
  else redo();
}

watch(
  open,
  (isOpen) => {
    if (!isOpen) return;
    rows.value = species.entries.length > 0 ? toDraft(species.entries) : [blankRow()];
    initial.value = snapshot(rows.value);
    history.clear();
    historyVersion.value++;
    error.value = null;
    prompt.value = null;
  },
  { immediate: true }
);

const entries = computed(() => fromDraft(rows.value));
const dirty = computed(() => snapshot(rows.value) !== initial.value);
const errors = computed(() => validateDraft(rows.value));
const issues = computed(() => validateSpecies(entries.value));
const resolvedKeys = computed(() => {
  try {
    return resolveHotkeys(entries.value);
  } catch {
    return new Map<string, string>(); // a key clash is already flagged on its cell
  }
});
const preview = computed(() => entries.value.filter((e) => e.code !== ''));

async function guard(work: () => Promise<void>): Promise<void> {
  error.value = null;
  try {
    await work();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

// ---- import / export -----------------------------------------------------------

const onImport = () =>
  guard(async () => {
    const file = await platform.openSpeciesCsv();
    if (file === null) return;
    const incoming = parseSpeciesCsv(file.text); // problems show on the cells
    if (entries.value.length === 0) {
      edit(toDraft(incoming, false));
    } else {
      prompt.value = { kind: 'import', entries: incoming };
    }
  });

function importReplace(incoming: SpeciesEntry[]): void {
  edit(toDraft(incoming, false));
  prompt.value = null;
}

function importMerge(incoming: SpeciesEntry[]): void {
  edit(mergeByCode(rows.value, incoming));
  prompt.value = null;
}

const onExport = () =>
  guard(async () => {
    if (await platform.exportCsv(serializeSpeciesCsv(entries.value), 'species.csv')) {
      notice.value = 'Species list exported.';
    }
  });

const onTemplate = () => guard(async () => void (await platform.exportCsv(templateCsv, 'buttons.csv')));

// ---- save / cancel -------------------------------------------------------------

function onSave(): void {
  if (issues.value.length > 0) return;
  const usage = session.codeUsage;
  const { renames, deleted } = diffCodes(species.entries, rows.value);
  const taggedRenames = [...renames]
    .map(([from, to]) => ({ from, to, count: usage.get(from) ?? 0 }))
    .filter((r) => r.count > 0);
  const taggedDeletes = deleted
    .map((code) => ({ code, count: usage.get(code) ?? 0 }))
    .filter((d) => d.count > 0);

  if (taggedRenames.length > 0 || taggedDeletes.length > 0) {
    prompt.value = {
      kind: 'codes',
      entries: entries.value,
      renames: taggedRenames,
      deleted: taggedDeletes,
    };
    return;
  }
  void commit(entries.value, false);
}

async function commit(list: SpeciesEntry[], renameTags: boolean): Promise<void> {
  const p = prompt.value;
  prompt.value = null;
  await guard(async () => {
    await species.replaceEntries(platform, list);
    if (renameTags && p?.kind === 'codes') {
      session.renameCodes(new Map(p.renames.map((r) => [r.from, r.to])));
    }
    open.value = false;
  });
}

function onCancel(): void {
  if (dirty.value) prompt.value = { kind: 'discard' };
  else open.value = false;
}

/**
 * Esc closes the editor through Cancel (so unsaved changes still ask), and
 * dismisses a prompt as its safe choice. The dialogs are persistent so that
 * Vuetify never closes them behind our back; stopping the event here also
 * keeps it from reaching Vuetify's window listener, which would play the
 * persistent "can't close" shake.
 */
function onEscape(event: KeyboardEvent): void {
  event.stopPropagation();
  // Focus can stay in the grid while a prompt is up; Esc answers the prompt.
  if (prompt.value !== null) prompt.value = null;
  else onCancel();
}

function onPromptEscape(event: KeyboardEvent): void {
  event.stopPropagation();
  prompt.value = null;
}

function discard(): void {
  prompt.value = null;
  open.value = false;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
</script>

<template>
  <v-dialog v-model="open" persistent scrollable :fullscreen="smAndDown" max-width="1100">
    <v-card data-test="species-editor" @keydown.esc="onEscape" @keydown="onHistoryKey">
      <v-card-title class="d-flex align-center">
        <v-icon start>mdi-cog</v-icon>
        Settings
        <span class="text-medium-emphasis ml-2">· Species</span>
        <v-spacer />
        <v-tooltip text="Undo (Ctrl+Z)" location="bottom">
          <template #activator="{ props: tip }">
            <v-btn
              v-bind="tip"
              icon="mdi-undo"
              variant="text"
              size="small"
              :disabled="!canUndo"
              aria-label="Undo"
              data-test="editor-undo"
              @click="undo"
            />
          </template>
        </v-tooltip>
        <v-tooltip text="Redo (Ctrl+Shift+Z)" location="bottom">
          <template #activator="{ props: tip }">
            <v-btn
              v-bind="tip"
              icon="mdi-redo"
              variant="text"
              size="small"
              :disabled="!canRedo"
              aria-label="Redo"
              data-test="editor-redo"
              @click="redo"
            />
          </template>
        </v-tooltip>
      </v-card-title>

      <v-card-text>
        <p class="text-body-2 text-medium-emphasis mb-3">
          Type straight into the cells. Tab and Enter move between them, and you can paste a block
          copied from a spreadsheet. In the Hotkey column, press the key you want (Delete clears
          it); species without one get the next free key automatically. Ctrl+Z undoes, Esc
          closes.
        </p>

        <SpeciesGrid
          :model-value="rows"
          :errors="errors"
          :resolved-keys="resolvedKeys"
          @update:model-value="edit"
          @seal="sealTyping"
        />

        <v-alert
          v-if="issues.length > 0"
          type="warning"
          variant="tonal"
          density="compact"
          class="mt-3"
          data-test="editor-issues"
        >
          {{ plural(issues.length, 'problem') }} to fix before saving:
          <ul class="ml-4">
            <li v-for="issue in issues.slice(0, 4)" :key="formatIssue(issue)">{{ formatIssue(issue) }}</li>
            <li v-if="issues.length > 4">…and {{ issues.length - 4 }} more (marked in red)</li>
          </ul>
        </v-alert>

        <div v-if="preview.length > 0" class="mt-4">
          <div class="text-caption text-medium-emphasis mb-1">Preview</div>
          <div class="d-flex flex-wrap" data-test="editor-preview">
            <v-btn
              v-for="e in preview"
              :key="e.code"
              class="ma-1 preview-btn"
              size="small"
              :color="e.color"
              :elevation="0"
            >
              {{ resolvedKeys.get(e.code) ? `${e.code} [${resolvedKeys.get(e.code)}]` : e.code }}
            </v-btn>
          </div>
        </div>

        <v-alert v-if="error" type="error" density="compact" closable class="mt-3" data-test="editor-error" @click:close="error = null">
          {{ error }}
        </v-alert>
      </v-card-text>

      <v-divider />
      <v-card-actions class="flex-wrap">
        <v-btn prepend-icon="mdi-file-import" data-test="editor-import" @click="onImport">Import CSV</v-btn>
        <v-btn prepend-icon="mdi-file-export" data-test="editor-export" @click="onExport">Export CSV</v-btn>
        <v-btn prepend-icon="mdi-file-download" data-test="editor-template" @click="onTemplate">Template</v-btn>
        <v-spacer />
        <v-btn data-test="editor-cancel" @click="onCancel">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="issues.length > 0"
          data-test="editor-save"
          @click="onSave"
        >
          Save
        </v-btn>
      </v-card-actions>
    </v-card>

    <v-dialog :model-value="prompt !== null" max-width="480" persistent>
      <v-card v-if="prompt?.kind === 'discard'" data-test="prompt-discard" @keydown.esc="onPromptEscape">
        <v-card-text>Discard your changes to the species list?</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn data-test="prompt-keep-editing" @click="prompt = null">Keep editing</v-btn>
          <v-btn color="error" data-test="prompt-discard-yes" @click="discard">Discard</v-btn>
        </v-card-actions>
      </v-card>

      <v-card v-else-if="prompt?.kind === 'import'" data-test="prompt-import" @keydown.esc="onPromptEscape">
        <v-card-text>
          The imported file lists {{ prompt.entries.length }} species. Replace the current
          list, or merge by code (matching codes are updated, new ones added)?
        </v-card-text>
        <v-card-actions>
          <v-btn data-test="prompt-import-cancel" @click="prompt = null">Cancel</v-btn>
          <v-spacer />
          <v-btn data-test="prompt-import-merge" @click="importMerge(prompt.entries)">Merge</v-btn>
          <v-btn color="primary" data-test="prompt-import-replace" @click="importReplace(prompt.entries)">
            Replace
          </v-btn>
        </v-card-actions>
      </v-card>

      <v-card v-else-if="prompt?.kind === 'codes'" data-test="prompt-codes" @keydown.esc="onPromptEscape">
        <v-card-text>
          <template v-if="prompt.renames.length > 0">
            <p class="mb-2">These codes are already tagged in this session:</p>
            <ul class="ml-4 mb-3">
              <li v-for="r in prompt.renames" :key="r.from">
                <strong>{{ r.from }}</strong> → <strong>{{ r.to }}</strong>
                ({{ plural(r.count, 'sample') }})
              </li>
            </ul>
            <p class="mb-3">Rename those tags too? If you keep the old tags, they export as UNKNOWN CODE.</p>
          </template>
          <template v-if="prompt.deleted.length > 0">
            <p class="mb-2">You removed codes that are tagged in this session:</p>
            <ul class="ml-4 mb-2">
              <li v-for="d in prompt.deleted" :key="d.code">
                <strong>{{ d.code }}</strong> ({{ plural(d.count, 'sample') }})
              </li>
            </ul>
            <p>Those samples will export as UNKNOWN CODE.</p>
          </template>
        </v-card-text>
        <v-card-actions>
          <v-btn data-test="prompt-codes-cancel" @click="prompt = null">Cancel</v-btn>
          <v-spacer />
          <template v-if="prompt.renames.length > 0">
            <v-btn data-test="prompt-codes-keep" @click="commit(prompt.entries, false)">Keep old tags</v-btn>
            <v-btn color="primary" data-test="prompt-codes-rename" @click="commit(prompt.entries, true)">
              Rename tags
            </v-btn>
          </template>
          <v-btn v-else color="error" data-test="prompt-codes-save" @click="commit(prompt.entries, false)">
            Save anyway
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar :model-value="notice !== null" timeout="3000" @update:model-value="notice = null">
      {{ notice }}
    </v-snackbar>
  </v-dialog>
</template>

<style scoped>
.preview-btn {
  min-width: 70px;
  font-weight: bold;
}
</style>
