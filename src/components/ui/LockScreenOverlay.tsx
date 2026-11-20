import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Delete, Fingerprint, Lock } from 'lucide-react-native';
import {
  authenticateWithBiometrics,
  hasPin,
  isBiometricAvailable,
  verifyPin,
} from '@/services/securityService';
import { TABULAR_NUMS_STYLE, useTheme } from '@/theme/theme';

export interface LockScreenOverlayProps {
  visible: boolean;
  onUnlocked: () => void;
}

const KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
] as const;

export function LockScreenOverlay({ visible, onUnlocked }: LockScreenOverlayProps) {
  const theme = useTheme();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [biometricReady, setBiometricReady] = useState(false);
  const [pinConfigured, setPinConfigured] = useState(true);
  const [checking, setChecking] = useState(false);

  const handleBiometricUnlock = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const ok = await authenticateWithBiometrics();
      if (ok) {
        setPin('');
        onUnlocked();
      }
    } finally {
      setChecking(false);
    }
  }, [onUnlocked]);

  useEffect(() => {
    if (!visible) {
      setPin('');
      setError(null);
      return;
    }

    let cancelled = false;
    async function prepare() {
      const [configured, bioAvailable] = await Promise.all([
        hasPin(),
        isBiometricAvailable(),
      ]);
      if (cancelled) return;
      setPinConfigured(configured);
      setBiometricReady(bioAvailable);
      if (bioAvailable && configured) {
        const ok = await authenticateWithBiometrics();
        if (!cancelled && ok) {
          setPin('');
          onUnlocked();
        }
      }
    }
    void prepare();

    return () => {
      cancelled = true;
    };
  }, [visible, onUnlocked]);

  const handleDigit = (digit: string) => {
    if (checking || pin.length >= 6) return;
    setError(null);
    setPin((prev) => `${prev}${digit}`);
  };

  const handleBackspace = () => {
    if (checking || pin.length === 0) return;
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  };

  const handleVerifyPin = async () => {
    if (!pinConfigured) {
      onUnlocked();
      return;
    }
    if (pin.length < 4 || checking) {
      setError('Lütfen en az 4 haneli PIN kodunuzu girin.');
      return;
    }

    setChecking(true);
    setError(null);
    try {
      const valid = await verifyPin(pin);
      if (valid) {
        setPin('');
        onUnlocked();
      } else {
        setError('Hatalı PIN kodu. Lütfen tekrar deneyin.');
        setPin('');
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.inner}>
          <View
            style={[
              styles.lockIconCircle,
              {
                backgroundColor: theme.colors.accentSoft,
                borderColor: theme.colors.accent,
              },
            ]}
          >
            <Lock size={28} color={theme.colors.accent} />
          </View>

          <Text style={[styles.title, { color: theme.colors.text }]}>Bütçe Pro Kilitli</Text>
          <Text style={[styles.subtitle, { color: theme.colors.muted }]}>
            {pinConfigured
              ? 'Devam etmek için 4–6 haneli PIN kodunuzu girin.'
              : 'Kayıtlı PIN bulunamadı. Kilidi açarak devam edebilirsiniz.'}
          </Text>

          {pinConfigured ? (
            <>
              <View style={styles.dotsRow}>
                {[0, 1, 2, 3, 4, 5].map((index) => {
                  const filled = index < pin.length;
                  return (
                    <View
                      key={index}
                      style={[
                        styles.dot,
                        {
                          backgroundColor: filled
                            ? theme.colors.accent
                            : theme.colors.elevated,
                          borderColor: filled ? theme.colors.accent : theme.colors.border,
                        },
                      ]}
                    />
                  );
                })}
              </View>

              {error ? (
                <Text style={[styles.errorText, { color: theme.colors.expense }]}>{error}</Text>
              ) : (
                <View style={styles.errorPlaceholder} />
              )}

              <View style={styles.keypad}>
                {KEYPAD_ROWS.map((row, rIdx) => (
                  <View key={rIdx} style={styles.keypadRow}>
                    {row.map((digit) => (
                      <Pressable
                        key={digit}
                        accessibilityRole="button"
                        onPress={() => handleDigit(digit)}
                        style={({ pressed }) => [
                          styles.keyButton,
                          {
                            backgroundColor: theme.colors.card,
                            borderColor: theme.colors.border,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.keyText,
                            TABULAR_NUMS_STYLE,
                            { color: theme.colors.text },
                          ]}
                        >
                          {digit}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ))}

                <View style={styles.keypadRow}>
                  {biometricReady ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Biyometrik ile kilidi aç"
                      onPress={() => void handleBiometricUnlock()}
                      style={({ pressed }) => [
                        styles.keyButton,
                        {
                          backgroundColor: theme.colors.elevated,
                          borderColor: theme.colors.border,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <Fingerprint size={24} color={theme.colors.accent} />
                    </Pressable>
                  ) : (
                    <View style={styles.keySpacer} />
                  )}

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => handleDigit('0')}
                    style={({ pressed }) => [
                      styles.keyButton,
                      {
                        backgroundColor: theme.colors.card,
                        borderColor: theme.colors.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.keyText,
                        TABULAR_NUMS_STYLE,
                        { color: theme.colors.text },
                      ]}
                    >
                      0
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Sil"
                    onPress={handleBackspace}
                    style={({ pressed }) => [
                      styles.keyButton,
                      {
                        backgroundColor: theme.colors.elevated,
                        borderColor: theme.colors.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Delete size={22} color={theme.colors.text} />
                  </Pressable>
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={pin.length < 4 || checking}
                onPress={() => void handleVerifyPin()}
                style={({ pressed }) => [
                  styles.unlockButton,
                  {
                    backgroundColor:
                      pin.length >= 4 ? theme.colors.accent : theme.colors.elevated,
                    borderRadius: theme.radius.md,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.unlockButtonText,
                    { color: pin.length >= 4 ? '#FFFFFF' : theme.colors.muted },
                  ]}
                >
                  {checking ? 'Doğrulanıyor...' : 'Kilidi Aç'}
                </Text>
              </Pressable>

              {biometricReady ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void handleBiometricUnlock()}
                  style={styles.biometricLink}
                >
                  <Fingerprint size={16} color={theme.colors.accent} />
                  <Text style={[styles.biometricLinkText, { color: theme.colors.accent }]}>
                    Biyometrik Doğrulama Kullan
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={onUnlocked}
              style={[
                styles.unlockButton,
                {
                  backgroundColor: theme.colors.accent,
                  borderRadius: theme.radius.md,
                },
              ]}
            >
              <Text style={[styles.unlockButtonText, { color: '#FFFFFF' }]}>Devam Et</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  inner: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    gap: 12,
  },
  lockIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 2,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    minHeight: 18,
    textAlign: 'center',
  },
  errorPlaceholder: {
    minHeight: 18,
  },
  keypad: {
    width: '100%',
    gap: 10,
    marginTop: 4,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  keyButton: {
    flex: 1,
    height: 58,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keySpacer: {
    flex: 1,
    height: 58,
  },
  keyText: {
    fontSize: 22,
    fontWeight: '600',
  },
  unlockButton: {
    width: '100%',
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  unlockButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  biometricLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  biometricLinkText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
