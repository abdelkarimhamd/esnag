import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '../theme/ThemeProvider'
import { Button } from './Button'

interface EmptyStateProps {
  title: string
  message: string
  actionLabel?: string
  onAction?: () => void
}

export const EmptyState = ({ title, message, actionLabel, onAction }: EmptyStateProps) => {
  const theme = useAppTheme()

  return (
    <View style={[styles.wrap, { borderColor: theme.colors.border, borderRadius: theme.radius.lg }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[styles.message, { color: theme.colors.textMuted }]}>{message}</Text>
      {actionLabel && onAction ? <Button label={actionLabel} variant="secondary" onPress={onAction} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    fontSize: 13,
    textAlign: 'center',
  },
})
