import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native'
import { useAppTheme } from '../theme/ThemeProvider'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
}

export const Button = ({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  fullWidth = false,
  accessibilityLabel,
  ...props
}: ButtonProps) => {
  const theme = useAppTheme()
  const isDisabled = Boolean(disabled || loading)

  const palette =
    variant === 'secondary'
      ? {
          bg: theme.colors.secondarySoft,
          border: theme.colors.secondary,
          text: theme.colors.secondary,
        }
      : variant === 'ghost'
        ? {
            bg: 'transparent',
            border: theme.colors.border,
            text: theme.colors.text,
          }
        : variant === 'danger'
          ? {
              bg: theme.colors.danger,
              border: theme.colors.danger,
              text: '#FFFFFF',
            }
          : {
              bg: theme.colors.primary,
              border: theme.colors.primary,
              text: theme.colors.primaryContrast,
            }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: isDisabled ? 0.55 : pressed && !theme.reduceMotion ? 0.88 : 1,
          paddingVertical: size === 'sm' ? 8 : 12,
          paddingHorizontal: size === 'sm' ? 10 : 14,
          width: fullWidth ? '100%' : undefined,
          borderRadius: theme.radius.md,
        },
      ]}
      {...props}
    >
      {loading ? <ActivityIndicator color={palette.text} /> : <Text style={[styles.text, { color: palette.text }]}>{label}</Text>}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  text: {
    fontSize: 14,
    fontWeight: '700',
  },
})
