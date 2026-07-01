import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native'
import * as Linking from 'expo-linking'
import * as Notifications from 'expo-notifications'
import React, { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native'
import { DrawerNavigator } from './DrawerNavigator'
import { useNavigationBadges } from './useNavigationBadges'
import { useAuth } from '../providers/AuthProvider'
import { LoginScreen } from '../screens/LoginScreen'
import { useSync, SyncProvider } from '../sync/SyncProvider'
import { useAppTheme } from '../theme/ThemeProvider'

const linking: any = {
  prefixes: [Linking.createURL('/'), 'esnagging://'],
  config: {
    screens: {
      MainTabs: {
        screens: {
          Snags: {
            screens: {
              SnagsHome: 'snags',
              SnagCreate: 'snags/create',
              SnagDetail: 'snags/:serverId',
              FloorMap: 'snags/floors',
              AnnotateAttachment: 'snags/annotate',
              InspectionDetail: 'inspections/submissions/:inspectionId',
            },
          },
          Equipment: 'equipment',
          Conflicts: 'conflicts',
          Notifications: 'notifications',
          Settings: 'settings',
        },
      },
      Snags: {
        screens: {
          SnagsHome: 'snags',
          SnagCreate: 'snags/create',
          SnagDetail: 'snags/:serverId',
          FloorMap: 'snags/floors',
          AnnotateAttachment: 'snags/annotate',
          InspectionDetail: 'inspections/submissions/:inspectionId',
        },
      },
      Equipment: 'equipment',
      Conflicts: 'conflicts',
      Notifications: 'notifications',
      Settings: 'settings',
    },
  },
}

const LoadingScreen = () => {
  const theme = useAppTheme()
  return (
    <View style={[styles.loadingShell, { backgroundColor: theme.colors.background }]}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  )
}

const AuthedShell = () => {
  const { user, activeOrganization, logout } = useAuth()
  const { queueSize, lastError } = useSync()
  const badges = useNavigationBadges({ queueSizeHint: queueSize, lastError })
  const { width } = useWindowDimensions()
  const isWide = width >= 960

  useEffect(() => {
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      const deepLink = response?.notification.request.content.data?.deep_link
      if (typeof deepLink === 'string' && deepLink.startsWith('esnagging://')) {
        void Linking.openURL(deepLink)
      }
    })

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const deepLink = response.notification.request.content.data?.deep_link
      if (typeof deepLink === 'string' && deepLink.startsWith('esnagging://')) {
        void Linking.openURL(deepLink)
      }
    })

    return () => {
      subscription.remove()
    }
  }, [])

  const roles = activeOrganization?.roles ?? []
  const organizationLabel = activeOrganization ? `${activeOrganization.code} - ${activeOrganization.name}` : undefined

  // Always render the same DrawerNavigator tree (it nests the TabNavigator under
  // MainTabs) and only switch the drawer presentation by width. Swapping between two
  // different navigator trees at the 960px breakpoint would unmount/remount and discard
  // the in-memory navigation stack (e.g. a SnagDetail view or a half-filled form) on
  // tablet rotation / split-screen / external display.
  return (
    <DrawerNavigator
      roles={roles}
      badgesMap={badges.badgesMap}
      userName={user?.name}
      organizationLabel={organizationLabel}
      onLogout={() => void logout()}
      permanent={isWide}
    />
  )
}

const AuthedNavigator = () => {
  return (
    <SyncProvider>
      <AuthedShell />
    </SyncProvider>
  )
}

export const AppNavigator = () => {
  const { loading, token } = useAuth()
  const theme = useAppTheme()

  if (loading) {
    return <LoadingScreen />
  }

  return (
    <NavigationContainer
      linking={linking}
      theme={
        theme.isDark
          ? {
              ...DarkTheme,
              colors: { ...DarkTheme.colors, background: theme.colors.background, card: theme.colors.surface, text: theme.colors.text, border: theme.colors.border, primary: theme.colors.primary },
            }
          : {
              ...DefaultTheme,
              colors: { ...DefaultTheme.colors, background: theme.colors.background, card: theme.colors.surface, text: theme.colors.text, border: theme.colors.border, primary: theme.colors.primary },
            }
      }
    >
      {token ? <AuthedNavigator /> : <LoginScreen />}
    </NavigationContainer>
  )
}

const styles = StyleSheet.create({
  loadingShell: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
