import { Ionicons } from '@expo/vector-icons'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import React, { useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { RootTabParamList } from './types'
import { BottomMoreSheet } from './BottomMoreSheet'
import {
  getFullMenuByRole,
  normalizeMenuTree,
  resolvePrimaryRole,
  type AppRole,
  type BadgesMap,
  type NormalizedMenuItem,
} from './navConfig'
import { EquipmentScreen } from '../screens/EquipmentScreen'
import { HomeScreen } from '../screens/HomeScreen'
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

// The five fixed bottom-bar slots from frame-2b (Work · Board · Capture · Inspect ·
// More). Capture is the centre FAB and More opens the destinations sheet — neither is
// a plain tab, so both are handled specially in the custom bar below.
type BarSlot = {
  key: 'Home' | 'Board' | 'Capture' | 'Inspect' | 'More'
  label: string
  icon: keyof typeof Ionicons.glyphMap
  iconActive: keyof typeof Ionicons.glyphMap
}

const BAR_SLOTS: BarSlot[] = [
  { key: 'Home', label: 'Work', icon: 'home-outline', iconActive: 'home' },
  { key: 'Board', label: 'Board', icon: 'stats-chart-outline', iconActive: 'stats-chart' },
  { key: 'Capture', label: 'Capture', icon: 'add', iconActive: 'add' },
  { key: 'Inspect', label: 'Inspect', icon: 'clipboard-outline', iconActive: 'clipboard' },
  { key: 'More', label: 'More', icon: 'ellipsis-horizontal', iconActive: 'ellipsis-horizontal' },
]

// Maps a bar slot to the underlying registered tab route it activates. Capture,
// Inspect and More are actions (create flow / inspection stack / sheet) rather than
// their own tabs, so they never highlight a tab.
const slotToRoute: Record<BarSlot['key'], keyof RootTabParamList | null> = {
  Home: 'Home',
  Board: 'Snags',
  Capture: null,
  Inspect: null,
  More: null,
}

interface MorgantiTabBarProps extends BottomTabBarProps {
  onCapture: () => void
  onInspect: () => void
  onMore: () => void
}

const MorgantiTabBar = ({ state, navigation, onCapture, onInspect, onMore }: MorgantiTabBarProps) => {
  const theme = useAppTheme()
  const insets = useSafeAreaInsets()
  const activeRoute = state.routes[state.index]?.name as keyof RootTabParamList

  const handlePress = (slot: BarSlot) => {
    if (slot.key === 'Capture') {
      onCapture()
      return
    }
    if (slot.key === 'Inspect') {
      onInspect()
      return
    }
    if (slot.key === 'More') {
      onMore()
      return
    }
    const target = slotToRoute[slot.key]
    if (target) {
      navigation.navigate(target as never)
    }
  }

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.colors.tabBar,
          borderTopColor: theme.colors.divider,
          paddingBottom: Math.max(insets.bottom, 10) + 4,
        },
      ]}
    >
      {BAR_SLOTS.map((slot) => {
        if (slot.key === 'Capture') {
          return (
            <Pressable
              key={slot.key}
              accessibilityRole="button"
              accessibilityLabel="Capture a snag"
              onPress={() => handlePress(slot)}
              style={styles.slot}
            >
              <View
                style={[
                  styles.fab,
                  {
                    backgroundColor: theme.colors.primary,
                    borderColor: theme.colors.surface,
                    shadowOpacity: theme.reduceMotion ? 0 : 0.45,
                    elevation: theme.reduceMotion ? 0 : 6,
                  },
                ]}
              >
                <Ionicons name="add" size={24} color="#FFFFFF" />
              </View>
              <Text
                style={[styles.fabLabel, { color: theme.colors.primary, fontFamily: theme.fonts.sansSemiBold }]}
              >
                {slot.label}
              </Text>
            </Pressable>
          )
        }

        const target = slotToRoute[slot.key]
        const active = target != null && activeRoute === target
        const tint = active ? theme.colors.primary : theme.colors.textMuted

        return (
          <Pressable
            key={slot.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={slot.label}
            onPress={() => handlePress(slot)}
            style={styles.slot}
          >
            <Ionicons name={active ? slot.iconActive : slot.icon} size={23} color={tint} />
            <Text style={[styles.label, { color: tint, fontFamily: theme.fonts.sansSemiBold }]}>{slot.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export const TabNavigator = ({ roles, badgesMap, userName, organizationLabel, onLogout }: TabNavigatorProps) => {
  const [moreOpen, setMoreOpen] = useState(false)
  const tabNavigationRef = useRef<any>(null)
  const role = useMemo<AppRole>(() => resolvePrimaryRole(roles), [roles])

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
        params: undefined,
      })
      return
    }

    navigation.navigate(item.tab)
  }

  const openMore = (navigation: any) => {
    if (navigation?.getParent()?.openDrawer) {
      navigation.getParent().openDrawer()
      return
    }
    setMoreOpen(true)
  }

  // Capture pushes the offline snag-create flow onto the Snags stack. Routing it
  // through the Snags tab keeps a single create surface and preserves deep-linking.
  const openCapture = (navigation: any) => {
    navigation?.navigate('Snags', { screen: 'SnagCreate', params: undefined })
  }

  // Inspect opens the inspections list (frame-2e's runner is reached by tapping a
  // row). The list + detail both live in the Snags stack so deep-linking is intact.
  const openInspect = (navigation: any) => {
    navigation?.navigate('Snags', { screen: 'InspectionsList', params: undefined })
  }

  return (
    <>
      <Tab.Navigator
        initialRouteName="Home"
        screenOptions={{ headerShown: false }}
        tabBar={(props) => {
          tabNavigationRef.current = props.navigation
          return (
            <MorgantiTabBar
              {...props}
              onCapture={() => openCapture(props.navigation)}
              onInspect={() => openInspect(props.navigation)}
              onMore={() => openMore(props.navigation)}
            />
          )
        }}
      >
        <Tab.Screen name="Home">
          {({ navigation }) => (
            <HomeScreen
              onOpenBoard={() => navigation.navigate('Snags')}
              onOpenNotifications={() => navigation.navigate('Notifications')}
              onOpenSearch={() =>
                navigation.navigate('Snags', {
                  screen: 'Search',
                })
              }
              onOpenSnag={(snag) =>
                navigation.navigate('Snags', {
                  screen: 'SnagDetail',
                  params: { localId: snag.local_id, serverId: snag.server_id ?? undefined },
                })
              }
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Snags">
          {() => (
            <SnagsStackNavigator
              onOpenMore={() => openMore(tabNavigationRef.current)}
              notificationsBadge={badgesMap.notifications}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Equipment" component={EquipmentScreen} />
        <Tab.Screen name="Conflicts" component={SyncConflictsScreen} />
        <Tab.Screen name="Notifications" component={NotificationsScreen} />
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

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    paddingTop: 8,
    paddingHorizontal: 10,
  },
  slot: {
    width: 60,
    alignItems: 'center',
    gap: 3,
  },
  label: {
    fontSize: 10,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginTop: -22,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#24488F',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 14,
  },
  fabLabel: {
    fontSize: 10,
    marginTop: -3,
  },
})
