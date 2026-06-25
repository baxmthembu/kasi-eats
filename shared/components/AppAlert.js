import React from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Pressable,
} from 'react-native';
import theme from '../theme';

export default function AppAlert({ visible, title, message, buttons, onDismiss }) {
  if (!visible) return null;

  const btns = buttons?.length ? buttons : [{ text: 'OK', style: 'default' }];
  const stacked = btns.length > 2;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={btns.length === 1 ? onDismiss : undefined}>
        <Pressable style={styles.card}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={[styles.btnsRow, stacked && styles.btnsCol]}>
            {btns.map((btn, i) => {
              const isCancel = btn.style === 'cancel';
              const isDestructive = btn.style === 'destructive';
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.btn,
                    stacked && styles.btnStacked,
                    !stacked && btns.length === 2 && styles.btnHalf,
                    isCancel && styles.btnCancel,
                    isDestructive && styles.btnDestructive,
                    !isCancel && !isDestructive && styles.btnPrimary,
                  ]}
                  onPress={() => { btn.onPress?.(); onDismiss?.(); }}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.btnText,
                      isCancel && styles.btnTextCancel,
                      isDestructive && styles.btnTextWhite,
                      !isCancel && !isDestructive && styles.btnTextWhite,
                    ]}
                  >
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  btnsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btnsCol: {
    flexDirection: 'column',
    gap: 10,
  },
  btn: {
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnHalf: { flex: 1 },
  btnStacked: { width: '100%' },
  btnPrimary: {
    backgroundColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnCancel: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  btnDestructive: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  btnTextWhite: { color: '#fff' },
  btnTextCancel: { color: theme.colors.textPrimary },
});
