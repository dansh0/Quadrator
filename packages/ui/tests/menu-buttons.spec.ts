// @vitest-environment happy-dom
import { InMemoryPlatformAdapter, serializeSession } from '@quadrator/core';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import MenuButtons from '../src/components/MenuButtons.vue';
import { emptySession, useSessionStore } from '../src/stores/session.ts';
import { useTaggingStore } from '../src/stores/tagging.ts';
import { mountWithShell, seedSession, taggedQuadrat } from './helpers.ts';

const flush = () => new Promise((r) => setTimeout(r, 0));

// v-dialog teleports its content to the body, outside the wrapper
function overlay(selector: string): Element | null {
  return document.body.querySelector(selector);
}

async function clickOverlay(selector: string): Promise<void> {
  const el = overlay(selector);
  expect(el, `expected overlay element ${selector}`).not.toBeNull();
  el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flush();
}

function otherSessionJson(): string {
  const s = emptySession(new Date('2026-07-07T12:00:00.000Z'));
  s.quadrats.push(taggedQuadrat('other', 1));
  s.currentQuadratId = 'other';
  return serializeSession(s);
}

describe('MenuButtons destructive-action guards', () => {
  beforeAll(() => {
    // v-dialog's location strategy reads visualViewport; happy-dom has none
    (window as unknown as Record<string, unknown>)['visualViewport'] = {
      width: 1280,
      height: 800,
      offsetLeft: 0,
      offsetTop: 0,
      scale: 1,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('Load Session with no progress opens straight away (no dialog)', async () => {
    const platform = new InMemoryPlatformAdapter();
    platform.queueSessionOpen(otherSessionJson());
    const { wrapper } = mountWithShell(MenuButtons, platform);

    await wrapper.find('[data-test="menu-load-session"]').trigger('click');
    await flush();

    expect(overlay('[data-test="confirm-dialog"]')).toBeNull();
    expect(useSessionStore().currentQuadrat?.id).toBe('other');
  });

  it('Load Session over existing progress asks first; No keeps everything', async () => {
    const platform = new InMemoryPlatformAdapter();
    platform.queueSessionOpen(otherSessionJson());
    const { wrapper } = mountWithShell(MenuButtons, platform);
    seedSession([taggedQuadrat('q1', 2)]);

    await wrapper.find('[data-test="menu-load-session"]').trigger('click');
    await flush();
    expect(overlay('[data-test="confirm-dialog"]')?.textContent).toContain(
      'overwrite your current progress'
    );

    await clickOverlay('[data-test="confirm-no"]');
    expect(useSessionStore().currentQuadrat?.id).toBe('q1');

    // Yes actually loads
    await wrapper.find('[data-test="menu-load-session"]').trigger('click');
    await flush();
    await clickOverlay('[data-test="confirm-yes"]');
    expect(useSessionStore().currentQuadrat?.id).toBe('other');
  });

  it('Start Over resets session + tagging and drops the autosave snapshot', async () => {
    const platform = new InMemoryPlatformAdapter();
    const { wrapper } = mountWithShell(MenuButtons, platform);
    seedSession([taggedQuadrat('q1', 3)]);
    const session = useSessionStore();
    await session.autosave(platform);
    expect(await session.hasAutosaved(platform)).toBe(true);

    const tagging = useTaggingStore();
    tagging.setCursor(2);
    tagging.activeTab = 'species';

    await wrapper.find('[data-test="menu-start-over"]').trigger('click');
    await flush();
    await clickOverlay('[data-test="confirm-yes"]');
    await flush();

    expect(session.hasSession).toBe(false);
    expect(tagging.cursor).toBe(0);
    expect(tagging.activeTab).toBe('prep');
    expect(await session.hasAutosaved(platform)).toBe(false);
  });
});
