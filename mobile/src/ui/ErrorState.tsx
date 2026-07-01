import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '../theme/ThemeProvider'
import { Button } from './Button'

interface ErrorStateProps {
  message: string
  hint?: string | null
  actionLabel?: string
  onRetry?: () => void
}

export const ErrorState = ({ message, hint, actionLabel = 'Retry', onRetry }: ErrorStateProps) => {
  const theme = useAppTheme()

  return (
    <View style={[styles.wrap, { borderColor: theme.colors.danger, borderRadius: theme.radius.lg }]}>
      <Text style={[styles.title, { color: theme.colors.danger }]}>Something went wrong</Text>
      <Text style={[styles.message, { color: theme.colors.text }]}>{message}</Text>
      {hint ? <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{hint}</Text> : null}
      {onRetry ? <Button label={actionLabel} variant="danger" onPress={onRetry} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
  },
  message: {
    fontSize: 13,
  },
  hint: {
    fontSize: 12,
  },
})
