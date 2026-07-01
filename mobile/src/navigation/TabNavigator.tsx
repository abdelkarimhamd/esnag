import { Ionicons } from '@expo/vector-icons'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import React, { useMemo, useRef, useState } from 'react'
import { Pressable } from 'react-native'
import type { RootTabParamList } from './types'
import { AppHeader } from './AppHeader'
import { BottomMoreSheet } from './BottomMoreSheet'
import {
  getFullMenuByRole,
  getPrimaryTabsByRole,
  normalizeMenuTree,
  resolvePrimaryRole,
  type AppRole,
  type BadgesMap,
  type NormalizedMenuItem,
} from './navConfig'
import { EquipmentScreen } from '../screens/EquipmentScreen'
import { NotificationsScreen } from '../screens/NotificationsScreen'
import { SettingsScreen } from '../screens/SettingsScreen'
import { SyncConflictsScreen } from '../screens/SyncConflictsScreen'
import { SnagsStackNavigator } from './SnagsStackNavigator'
import { useAppTheme } from '../theme/ThemeProvider'

const Tab = createBottomTabNavigator<RootTabParamList>()

interface TabNavigatorProps {
  roles: string[]
  badgesMap: BadgesMap
  userName?: string
  organizationLabel?: string
  onLogout: () => void
}

const tabIcons: Record<keyof RootTabParamList, keyof typeof Ionicons.glyphMap> = {
  Snags: 'construct-outline',
  Equipment: 'build-outline',
  Conflicts: 'git-compare-outline',
  Notifications: 'notifications-outline',
  MoreHub: 'grid-outline',
  Settings: 'settings-outline',
}

const tabTitles: Record<keyof RootTabParamList, string> = {
  Snags: 'Snags',
  Equipment: 'Equipment',
  Conflicts: 'Conflicts',
  Notifications: 'Alerts',
  MoreHub: 'More',
  Settings: 'Settings',
}

export const TabNavigator = ({ roles, badgesMap, userName, organizationLabel, onLogout }: TabNavigatorProps) => {
  const theme = useAppTheme()
  const [moreOpen, setMoreOpen] = useState(false)
  const tabNavigationRef = useRef<any>(null)
  const role = useMemo<AppRole>(() => resolvePrimaryRole(roles), [roles])

  const primaryTabs = useMemo(() => getPrimaryTabsByRole(role), [role])
  const orderedTabs = useMemo<Array<keyof RootTabParamList>>(() => {
    const left = primaryTabs.slice(0, 2)
    const right = primaryTabs.slice(2)
    return [...left, 'MoreHub', ...right]
  }, [primaryTabs])

  const fullMenu = useMemo(
    () => normalizeMenuTree(getFullMenuByRole(role), badgesMap),
    [role, badgesMap],
  )

  const navigateFromMenu = (navigation: any, item: NormalizedMenuItem) => {
    if (!navigation || item.type !== 'route') {
      return
    }

    if (item.tab === 'Snags' && item.stackScreen) {
      navigation.navigate('Snags', {
        screen: item.stackScreen,
        params: item.stackScreen === 'InspectionDetail' ? { inspectionId: undefined } : undefined,
      })
      return
    }

    navigation.navigate(item.tab)
  }

  const openPrimaryMenu = (navigation: any) => {
    if (navigation.getParent()?.openDrawer) {
      navigation.getParent().openDrawer()
      return
    }
    setMoreOpen(true)
  }

  const renderCommonHeader = (navigation: any, routeName: keyof RootTabParamList) => (
    <AppHeader
      title={tabTitles[routeName]}
      canGoBack={false}
      onBack={() => undefined}
      onOpenMenu={() => openPrimaryMenu(navigation)}
      onOpenNotifications={() => navigation.navigate('Notifications')}
      onOpenProfile={() => navigation.navigate('Settings')}
      notificationsBadge={badgesMap.notifications}
    />
  )

  return (
    <>
      <Tab.Navigator
        screenOptions={({ route, navigation }) => {
          tabNavigationRef.current = navigation
          const routeName = route.name as keyof RootTabParamList
          const visible = orderedTabs.includes(routeName) && routeName !== 'MoreHub'
          const isCenterMore = routeName === 'MoreHub'
          const badgeValue =
            routeName === 'Snags'
              ? badgesMap.queue
              : routeName === 'Conflicts'
                ? badgesMap.conflicts
                : routeName === 'Notifications'
                  ? badgesMap.notifications
                  : undefined

          return {
            header: () => renderCommonHeader(navigation, routeName),
            tabBarActiveTintColor: theme.colors.primary,
            tabBarInactiveTintColor: theme.colors.textMuted,
            tabBarStyle: {
              backgroundColor: theme.colors.tabBar,
              borderTopColor: theme.colors.divider,
              height: 68,
              paddingBottom: 8,
              paddingTop: 6,
            },
            tabBarLabelStyle: {
              fontSize: 11,
              fontWeight: '700',
            },
            tabBarIcon: ({ color, size }) => (
              <Ionicons
                name={tabIcons[routeName]}
                size={isCenterMore ? size + 2 : size}
                color={isCenterMore ? theme.colors.primary : color}
              />
            ),
            tabBarBadge: badgeValue && badgeValue > 0 ? (badgeValue > 99 ? '99+' : badgeValue) : undefined,
            tabBarButton: isCenterMore
              ? (props) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Open more menu"
                    onPress={() => setMoreOpen(true)}
                    style={[
                      props.style,
                      {
                        marginTop: -10,
                        borderRadius: 999,
                        width: 58,
                        height: 58,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: theme.colors.primarySoft,
                        borderWidth: 1,
                        borderColor: theme.colors.primary,
                      },
                    ]}
                  >
                    <Ionicons name="grid-outline" size={22} color={theme.colors.primary} />
                  </Pressable>
                )
              : visible
                ? undefined
                : () => null,
            tabBarItemStyle: !isCenterMore && !visible ? { display: 'none' } : undefined,
          }
        }}
      >
        <Tab.Screen
          name="Snags"
          options={{ headerShown: false }}
        >
          {() => (
            <SnagsStackNavigator
              onOpenMore={() => openPrimaryMenu(tabNavigationRef.current)}
              notificationsBadge={badgesMap.notifications}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Equipment" component={EquipmentScreen} />
        <Tab.Screen name="Conflicts" component={SyncConflictsScreen} />
        <Tab.Screen name="Notifications" component={NotificationsScreen} />
        <Tab.Screen name="MoreHub" component={NotificationsScreen} listeners={{ tabPress: (event) => event.preventDefault() }} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>

      <BottomMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        sections={fullMenu}
        onSelectRoute={(item) => {
          navigateFromMenu(tabNavigationRef.current, item)
        }}
        onLogout={onLogout}
        userName={userName}
        orgLabel={organizationLabel}
      />
    </>
  )
}
