import React from 'react'
import { StyleSheet, View } from 'react-native'
import { useAppTheme } from '../theme/ThemeProvider'

interface SkeletonProps {
  lines?: number
}

export const Skeleton = ({ lines = 3 }: SkeletonProps) => {
  const theme = useAppTheme()
  return (
    <View style={styles.wrap}>
      {Array.from({ length: lines }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.line,
            {
              backgroundColor: theme.colors.surfaceElevated,
              borderColor: theme.colors.border,
              width: index === lines - 1 ? '64%' : '100%',
            },
          ]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  line: {
    height: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
})
