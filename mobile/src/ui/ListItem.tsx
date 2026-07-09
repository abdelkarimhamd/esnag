import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '../theme/ThemeProvider'

interface ListItemProps {
  title: string
  subtitle?: string
  right?: React.ReactNode
  onPress?: () => void
  selected?: boolean
}

export const ListItem = ({ title, subtitle, right, onPress, selected = false }: ListItemProps) => {
  const theme = useAppTheme()
  const Container = onPress ? Pressable : View

  return (
    <Container
      onPress={onPress}
      style={({ pressed }: { pressed?: boolean }) => [
        styles.container,
        {
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface,
          borderRadius: theme.radius.md,
          opacity: pressed && !theme.reduceMotion ? 0.9 : 1,
        },
      ]}
    >
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </Container>
  )
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    padding: 12,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
  },
})
