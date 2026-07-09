import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '../theme/ThemeProvider'

interface BadgeProps {
  value: number
  tone?: 'default' | 'danger' | 'info'
}

export const Badge = ({ value, tone = 'default' }: BadgeProps) => {
  const theme = useAppTheme()
  if (value <= 0) {
    return null
  }

  const backgroundColor =
    tone === 'danger' ? theme.colors.danger : tone === 'info' ? theme.colors.info : theme.colors.badge

  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={styles.text} accessibilityLabel={`${value} new items`}>
        {value > 99 ? '99+' : value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
})
