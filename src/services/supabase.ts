import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;
let cachedSignature: string | null = null;

const memoryAuthStorage = new Map<string, string>();

function getSupabaseEnv(): { url: string; anonKey: string } {
  const url =
    typeof process !== 'undefined' && typeof process.env?.EXPO_PUBLIC_SUPABASE_URL === 'string'
      ? process.env.EXPO_PUBLIC_SUPABASE_URL.trim()
      : '';
  const anonKey =
    typeof process !== 'undefined' &&
    typeof process.env?.EXPO_PUBLIC_SUPABASE_ANON_KEY === 'string'
      ? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY.trim()
      : '';
  return { url, anonKey };
}

function isReactNativeRuntime(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    (navigator as { product?: string }).product === 'ReactNative'
  );
}

function isWebBrowserRuntime(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined' && !isReactNativeRuntime();
}

function canUseRuntimeStorage(): boolean {
  return typeof window !== 'undefined' || isReactNativeRuntime();
}

const safeAuthStorage: SupportedStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (!canUseRuntimeStorage()) {
      return memoryAuthStorage.get(key) ?? null;
    }
    if (isWebBrowserRuntime() && typeof window.localStorage !== 'undefined') {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return memoryAuthStorage.get(key) ?? null;
      }
    }
    try {
      const mod = await import('@react-native-async-storage/async-storage');
      return await mod.default.getItem(key);
    } catch {
      return memoryAuthStorage.get(key) ?? null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    memoryAuthStorage.set(key, value);
    if (!canUseRuntimeStorage()) {
      return;
    }
    if (isWebBrowserRuntime() && typeof window.localStorage !== 'undefined') {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch {
        return;
      }
    }
    try {
      const mod = await import('@react-native-async-storage/async-storage');
      await mod.default.setItem(key, value);
    } catch {
      // Fallback already persisted in memoryAuthStorage
    }
  },
  removeItem: async (key: string): Promise<void> => {
    memoryAuthStorage.delete(key);
    if (!canUseRuntimeStorage()) {
      return;
    }
    if (isWebBrowserRuntime() && typeof window.localStorage !== 'undefined') {
      try {
        window.localStorage.removeItem(key);
        return;
      } catch {
        return;
      }
    }
    try {
      const mod = await import('@react-native-async-storage/async-storage');
      await mod.default.removeItem(key);
    } catch {
      // Fallback already cleared in memoryAuthStorage
    }
  },
};

/**
 * Returns `true` when both `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
 * are configured with non-empty values. Never throws.
 */
export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseEnv();
  return url.length > 0 && anonKey.length > 0;
}

/**
 * Returns the singleton Supabase client, or `null` when Supabase env vars are unset.
 * Safe to call at module startup in Local/Demo mode, Web, Native, and Node tests.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { url, anonKey } = getSupabaseEnv();
  const signature = `${url}|${anonKey}`;

  if (cachedClient && cachedSignature === signature) {
    return cachedClient;
  }

  const persist = canUseRuntimeStorage();
  const isWeb = isWebBrowserRuntime();

  cachedClient = createClient(url, anonKey, {
    auth: {
      storage: safeAuthStorage,
      autoRefreshToken: persist,
      persistSession: persist,
      detectSessionInUrl: isWeb,
    },
  });
  cachedSignature = signature;

  return cachedClient;
}

/**
 * Resolves the public web base URL used for OAuth redirects and `/shared/[token]` links.
 */
export function getWebBaseUrl(): string {
  const configured =
    typeof process !== 'undefined' && typeof process.env?.EXPO_PUBLIC_WEB_BASE_URL === 'string'
      ? process.env.EXPO_PUBLIC_WEB_BASE_URL.trim()
      : '';
  if (configured.length > 0) {
    return configured;
  }
  if (typeof window !== 'undefined' && typeof window.location?.origin === 'string') {
    const origin = window.location.origin.trim();
    if (origin.length > 0 && origin !== 'null') {
      return origin;
    }
  }
  return 'https://butce-pro.vercel.app';
}

/** Clears the cached Supabase client instance (for unit tests). */
export function resetSupabaseClientForTests(): void {
  cachedClient = null;
  cachedSignature = null;
  memoryAuthStorage.clear();
}
