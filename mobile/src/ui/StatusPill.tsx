import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '../theme/ThemeProvider'

interface StatusPillProps {
  label: string
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
}

export const StatusPill = ({ label, tone = 'neutral' }: StatusPillProps) => {
  const theme = useAppTheme()
  const palette =
    tone === 'success'
      ? { bg: theme.colors.success, text: '#FFFFFF' }
      : tone === 'warning'
        ? { bg: theme.colors.warning, text: '#FFFFFF' }
        : tone === 'danger'
          ? { bg: theme.colors.danger, text: '#FFFFFF' }
          : tone === 'info'
            ? { bg: theme.colors.info, text: '#FFFFFF' }
            : { bg: theme.colors.surfaceElevated, text: theme.colors.textMuted }

  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <Text style={[styles.text, { color: palette.text }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
})
