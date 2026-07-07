import type { PlatformAdapter } from '@quadrator/core';
import { inject, InjectionKey } from 'vue';

/** Injection key under which the shell provides its PlatformAdapter. */
export const platformKey: InjectionKey<PlatformAdapter> = Symbol('PlatformAdapter');

/** Resolve the shell's PlatformAdapter; throws when no shell provided one. */
export function usePlatform(): PlatformAdapter {
  const adapter = inject(platformKey);
  if (!adapter) {
    throw new Error('no PlatformAdapter provided — the shell must provide(platformKey, adapter)');
  }
  return adapter;
}
