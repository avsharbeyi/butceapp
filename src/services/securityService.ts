const PIN_STORAGE_KEY = 'butce-pro-pin-hash-v1';
const PIN_DOMAIN_SALT = 'butce-pro-pin-v1:';

let memoryPinHash: string | null = null;

function isReactNativeRuntime(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    (navigator as { product?: string }).product === 'ReactNative'
  );
}

function isWebBrowserRuntime(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined' && !isReactNativeRuntime();
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Computes a domain-salted SHA-256 hex digest of `pin` using Web Crypto,
 * Node `crypto`, or `expo-crypto` fallback.
 */
export async function hashPin(pin: string): Promise<string> {
  const input = `${PIN_DOMAIN_SALT}${pin}`;

  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const encoded = new TextEncoder().encode(input);
    const buffer = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    return bytesToHex(new Uint8Array(buffer));
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require('node:crypto') as typeof import('node:crypto');
    return nodeCrypto.createHash('sha256').update(input, 'utf8').digest('hex');
  } catch {
    // Fall through to expo-crypto on Native runtimes lacking SubtleCrypto
  }

  const ExpoCrypto = await import('expo-crypto');
  return ExpoCrypto.digestStringAsync(ExpoCrypto.CryptoDigestAlgorithm.SHA256, input);
}

async function readStoredPinHash(): Promise<string | null> {
  if (isReactNativeRuntime()) {
    try {
      const SecureStore = await import('expo-secure-store');
      const value = await SecureStore.getItemAsync(PIN_STORAGE_KEY);
      if (value) {
        memoryPinHash = value;
        return value;
      }
    } catch {
      // Fall back to memoryPinHash
    }
    return memoryPinHash;
  }

  if (isWebBrowserRuntime() && typeof window.localStorage !== 'undefined') {
    try {
      const value = window.localStorage.getItem(PIN_STORAGE_KEY);
      if (value) {
        memoryPinHash = value;
        return value;
      }
    } catch {
      // Fall back to memoryPinHash
    }
  }

  return memoryPinHash;
}

/** Hashes and persists the user's PIN without ever storing plaintext. */
export async function savePin(pin: string): Promise<void> {
  const digest = await hashPin(pin);
  memoryPinHash = digest;

  if (isReactNativeRuntime()) {
    try {
      const SecureStore = await import('expo-secure-store');
      await SecureStore.setItemAsync(PIN_STORAGE_KEY, digest);
      return;
    } catch {
      return;
    }
  }

  if (isWebBrowserRuntime() && typeof window.localStorage !== 'undefined') {
    try {
      window.localStorage.setItem(PIN_STORAGE_KEY, digest);
    } catch {
      // Already stored in memoryPinHash
    }
  }
}

/** Verifies whether `pin` matches the stored PIN hash. */
export async function verifyPin(pin: string): Promise<boolean> {
  const stored = await readStoredPinHash();
  if (!stored) {
    return false;
  }
  const candidate = await hashPin(pin);
  return constantTimeEqual(stored, candidate);
}

/** Removes the stored PIN hash from secure/local storage. */
export async function clearPin(): Promise<void> {
  memoryPinHash = null;

  if (isReactNativeRuntime()) {
    try {
      const SecureStore = await import('expo-secure-store');
      await SecureStore.deleteItemAsync(PIN_STORAGE_KEY);
      return;
    } catch {
      return;
    }
  }

  if (isWebBrowserRuntime() && typeof window.localStorage !== 'undefined') {
    try {
      window.localStorage.removeItem(PIN_STORAGE_KEY);
    } catch {
      // Already cleared in memoryPinHash
    }
  }
}

/** Returns `true` when a PIN hash has been configured. */
export async function hasPin(): Promise<boolean> {
  const stored = await readStoredPinHash();
  return stored !== null && stored.length > 0;
}

/** Checks whether biometric authentication hardware is available and enrolled (Native only). */
export async function isBiometricAvailable(): Promise<boolean> {
  if (!isReactNativeRuntime()) {
    return false;
  }
  try {
    const LocalAuth = await import('expo-local-authentication');
    const hasHardware = await LocalAuth.hasHardwareAsync();
    if (!hasHardware) {
      return false;
    }
    return await LocalAuth.isEnrolledAsync();
  } catch {
    return false;
  }
}

/** Prompts for biometric unlock on Native devices; safely returns `false` on Web/Node. */
export async function authenticateWithBiometrics(): Promise<boolean> {
  if (!isReactNativeRuntime()) {
    return false;
  }
  try {
    const available = await isBiometricAvailable();
    if (!available) {
      return false;
    }
    const LocalAuth = await import('expo-local-authentication');
    const result = await LocalAuth.authenticateAsync({
      promptMessage: 'Bütçe Pro kilidini açın',
      cancelLabel: 'İptal',
      fallbackLabel: 'PIN Kullan',
    });
    return Boolean(result.success);
  } catch {
    return false;
  }
}
