import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, TouchableOpacity } from 'react-native';
import theme from '../theme';

/**
 * Styled text input — white bg, gray border, orange focus ring.
 */
export default function InputField({
  label,
  error,
  secureTextEntry,
  style,
  containerStyle,
  ...props
}) {
  const [focused, setFocused] = useState(false);
  const [hidden,  setHidden]  = useState(secureTextEntry ?? false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.inputWrapper,
          focused && styles.inputFocused,
          error  && styles.inputError,
        ]}
      >
        <TextInput
          {...props}
          secureTextEntry={hidden}
          style={[styles.input, style]}
          placeholderTextColor={theme.colors.textMuted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {secureTextEntry && (
          <TouchableOpacity onPress={() => setHidden((h) => !h)} style={styles.toggle}>
            <Text style={styles.toggleText}>{hidden ? '👁' : '🙈'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { marginBottom: theme.spacing.m },
  label:        { fontSize: 13, fontWeight: '600', color: theme.colors.textPrimary, marginBottom: 6 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.s,
    paddingHorizontal: theme.spacing.m,
    minHeight: 50,
  },
  inputFocused: { borderColor: theme.colors.primary },
  inputError:   { borderColor: theme.colors.error },
  input: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.textPrimary,
    paddingVertical: theme.spacing.s,
  },
  toggle:     { paddingLeft: 8 },
  toggleText: { fontSize: 16 },
  errorText:  { fontSize: 12, color: theme.colors.error, marginTop: 4 },
});
