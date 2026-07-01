import React from 'react'
import { ScrollView, StyleSheet, View, type ScrollViewProps, type ViewProps } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAppTheme } from '../theme/ThemeProvider'

interface ScreenContainerProps {
  children: React.ReactNode
  scroll?: boolean
  contentContainerStyle?: ScrollViewProps['contentContainerStyle']
  testID?: string
}

export const ScreenContainer = ({ children, scroll = false, contentContainerStyle, testID }: ScreenContainerProps) => {
  const theme = useAppTheme()

  if (scroll) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
        <ScrollView
          testID={testID}
          contentContainerStyle={[
            styles.scrollContent,
            { padding: theme.spacing.lg, gap: theme.spacing.md },
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <View testID={testID} style={[styles.fill, { padding: theme.spacing.lg }]}>
        {children}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
})
