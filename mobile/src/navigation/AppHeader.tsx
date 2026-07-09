import { Ionicons } from '@expo/vector-icons'
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '../theme/ThemeProvider'
import { Badge, IconButton } from '../ui'

interface AppHeaderProps {
  title: string
  canGoBack: boolean
  onBack: () => void
  onOpenMenu: () => void
  onOpenNotifications: () => void
  onOpenProfile: () => void
  notificationsBadge?: number
}

export const AppHeader = ({
  title,
  canGoBack,
  onBack,
  onOpenMenu,
  onOpenNotifications,
  onOpenProfile,
  notificationsBadge = 0,
}: AppHeaderProps) => {
  const theme = useAppTheme()

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderBottomColor: theme.colors.divider,
          shadowOpacity: theme.reduceMotion ? 0 : 0.12,
          elevation: theme.elevation.level1,
        },
      ]}
    >
      <View style={styles.side}>
        <IconButton
          icon={
            <Ionicons
              name={canGoBack ? 'arrow-back-outline' : 'menu-outline'}
              size={18}
              color={theme.colors.text}
            />
          }
          onPress={canGoBack ? onBack : onOpenMenu}
          accessibilityLabel={canGoBack ? 'Go back' : 'Open menu'}
        />
      </View>
      <View style={styles.center}>
        <Text numberOfLines={1} style={[styles.title, { color: theme.colors.text }]}>
          {title}
        </Text>
      </View>
      <View style={styles.actions}>
        <IconButton
          icon={<Ionicons name="notifications-outline" size={18} color={theme.colors.text} />}
          onPress={onOpenNotifications}
          accessibilityLabel="Open notifications"
          badge={<Badge value={notificationsBadge} tone="info" />}
        />
        <IconButton
          icon={<Ionicons name="person-circle-outline" size={18} color={theme.colors.text} />}
          onPress={onOpenProfile}
          accessibilityLabel="Open profile"
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    minHeight: 60,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#0A1630',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 6,
  },
  side: {
    width: 44,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  actions: {
    width: 88,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
})
