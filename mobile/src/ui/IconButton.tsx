import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useAppTheme } from '../theme/ThemeProvider'

interface IconButtonProps {
  icon: React.ReactNode
  onPress: () => void
  accessibilityLabel: string
  badge?: React.ReactNode
  disabled?: boolean
}

export const IconButton = ({ icon, onPress, accessibilityLabel, badge, disabled = false }: IconButtonProps) => {
  const theme = useAppTheme()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: theme.colors.surfaceElevated,
          borderColor: theme.colors.border,
          opacity: disabled ? 0.4 : pressed && !theme.reduceMotion ? 0.88 : 1,
          borderRadius: theme.radius.pill,
        },
      ]}
    >
      {icon}
      {badge ? <View style={styles.badge}>{badge}</View> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    width: 38,
    height: 38,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
  },
})
