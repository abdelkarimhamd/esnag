import React from 'react'
import { StyleSheet, View, type ViewProps } from 'react-native'
import { useAppTheme } from '../theme/ThemeProvider'

interface CardProps extends ViewProps {
  elevated?: boolean
}

export const Card = ({ style, elevated = false, ...props }: CardProps) => {
  const theme = useAppTheme()

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          shadowOpacity: elevated && !theme.reduceMotion ? 0.12 : 0,
          elevation: elevated ? theme.elevation.level1 : theme.elevation.level0,
        },
        style,
      ]}
      {...props}
    />
  )
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    padding: 12,
    gap: 8,
    shadowColor: '#0B1A33',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
  },
})
