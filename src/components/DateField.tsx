import React from 'react';
import { StyleProp, StyleSheet, Text, TextInput, TextStyle, View } from 'react-native';
import { AppTheme } from '../context/ThemeContext';
import { formatDateInput, isValidDateString, todayDateString } from '../lib/dateInput';

interface DateFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  theme: AppTheme;
  style?: StyleProp<TextStyle>;
  placeholder?: string;
  placeholderTextColor?: string;
  /** Notified whenever the (non-empty) validity changes. */
  onValidityChange?: (valid: boolean) => void;
}

// Masked YYYY-MM-DD input: digits only, auto dashes, inline error when invalid.
export default function DateField({
  value,
  onChangeText,
  theme,
  style,
  placeholder,
  placeholderTextColor,
  onValidityChange,
}: DateFieldProps) {
  const handleChange = (raw: string) => {
    const formatted = formatDateInput(raw);
    onChangeText(formatted);
    onValidityChange?.(formatted === '' || isValidDateString(formatted));
  };

  const invalid = value.length > 0 && !isValidDateString(value);

  return (
    <View>
      <TextInput
        style={[style, invalid ? { borderColor: theme.error, borderWidth: 1 } : null]}
        value={value}
        onChangeText={handleChange}
        placeholder={placeholder ?? todayDateString()}
        placeholderTextColor={placeholderTextColor ?? theme.textMuted}
        keyboardType="number-pad"
        maxLength={10}
      />
      {invalid && (
        <Text style={[styles.error, { color: theme.error }]}>Date invalide (format AAAA-MM-JJ)</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  error: { fontSize: 12, marginTop: 4 },
});
