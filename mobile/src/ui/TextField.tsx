import React from 'react'
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { useAppTheme } from '../theme/ThemeProvider'

interface TextFieldProps extends TextInputProps {
  label?: string
  helperText?: string
  errorText?: string | null
}

export const TextField = ({ label, helperText, errorText, style, ...props }: TextFieldProps) => {
  const theme = useAppTheme()

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={theme.colors.textMuted}
        style={[
          styles.input,
          {
            backgroundColor: theme.colors.surface,
            borderColor: errorText ? theme.colors.danger : theme.colors.border,
            color: theme.colors.text,
            borderRadius: theme.radius.md,
          },
          style,
        ]}
        {...props}
      />
      {errorText ? (
        <Text accessibilityLiveRegion="polite" style={[styles.message, { color: theme.colors.danger }]}>
          {errorText}
        </Text>
      ) : helperText ? (
        <Text style={[styles.message, { color: theme.colors.textMuted }]}>{helperText}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  message: {
    fontSize: 12,
  },
})
