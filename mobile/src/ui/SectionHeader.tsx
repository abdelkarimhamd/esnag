import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '../theme/ThemeProvider'

interface SectionHeaderProps {
  title: string
  subtitle?: string
  right?: React.ReactNode
}

export const SectionHeader = ({ title, subtitle, right }: SectionHeaderProps) => {
  const theme = useAppTheme()

  return (
    <View style={styles.row}>
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: theme.colors.text, fontSize: theme.typography.title }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 13,
  },
})
