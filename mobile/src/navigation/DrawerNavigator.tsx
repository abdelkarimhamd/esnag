import { Ionicons } from '@expo/vector-icons'
import { createDrawerNavigator, DrawerContentScrollView } from '@react-navigation/drawer'
import React, { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useAppTheme } from '../theme/ThemeProvider'
import { FONTS } from '../theme/tokens'
import { Badge, Button } from '../ui'
import {
  getFullMenuByRole,
  normalizeMenuTree,
  resolvePrimaryRole,
  type BadgesMap,
  type NormalizedMenuItem,
} from './navConfig'
import type { RootDrawerParamList } from './types'
import { TabNavigator } from './TabNavigator'

const Drawer = createDrawerNavigator<RootDrawerParamList>()

interface DrawerNavigatorProps {
  roles: string[]
  badgesMap: BadgesMap
  userName?: string
  organizationLabel?: string
  onLogout: () => void
  /** Render the drawer permanently (wide layouts) vs. as an overlay (phones). */
  permanent?: boolean
}

export const DrawerNavigator = ({ roles, badgesMap, userName, organizationLabel, onLogout, permanent = false }: DrawerNavigatorProps) => {
  const role = useMemo(() => resolvePrimaryRole(roles), [roles])
  const sections = useMemo(() => normalizeMenuTree(getFullMenuByRole(role), badgesMap), [role, badgesMap])

  return (
    <Drawer.Navigator
      screenOptions={{
        headerShown: false,
        drawerType: permanent ? 'permanent' : 'front',
        swipeEdgeWidth: 48,
      }}
      drawerContent={(props) => (
        <AppDrawerContent
          {...props}
          sections={sections}
          userName={userName}
          organizationLabel={organizationLabel}
          onLogout={onLogout}
        />
      )}
    >
      <Drawer.Screen name="MainTabs">
        {() => (
          <TabNavigator
            roles={roles}
            badgesMap={badgesMap}
            userName={userName}
            organizationLabel={organizationLabel}
            onLogout={onLogout}
          />
        )}
      </Drawer.Screen>
    </Drawer.Navigator>
  )
}

interface AppDrawerContentProps {
  sections: ReturnType<typeof normalizeMenuTree>
  userName?: string
  organizationLabel?: string
  onLogout: () => void
  navigation: any
}

const AppDrawerContent = ({ sections, userName, organizationLabel, onLogout, navigation }: AppDrawerContentProps) => {
  const theme = useAppTheme()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) {
      return sections
    }
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => item.label.toLowerCase().includes(term) || item.id.toLowerCase().includes(term)),
      }))
      .filter((section) => section.items.length > 0)
  }, [sections, query])

  const navigateItem = (item: NormalizedMenuItem) => {
    if (item.type === 'action') {
      onLogout()
      return
    }

    if (item.tab === 'Snags' && item.stackScreen) {
      navigation.navigate('MainTabs', {
        screen: 'Snags',
        params: { screen: item.stackScreen, params: undefined },
      })
      navigation.closeDrawer()
      return
    }

    navigation.navigate('MainTabs', { screen: item.tab })
    navigation.closeDrawer()
  }

  return (
    <DrawerContentScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.drawerScroll}
    >
      <View style={styles.profileWrap}>
        <Text style={[styles.name, { color: theme.colors.text }]}>{userName || 'Account'}</Text>
        <Text style={[styles.org, { color: theme.colors.textMuted }]}>{organizationLabel || 'Organization'}</Text>
      </View>

      <View
        style={[
          styles.searchWrap,
          {
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        <Ionicons name="search-outline" size={16} color={theme.colors.textMuted} />
        <TextInput
          placeholder="Search menu"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.searchInput, { color: theme.colors.text }]}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {filtered.map((section) => (
        <View key={section.id} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>{section.title}</Text>
          <View style={styles.itemsWrap}>
            {section.items.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => navigateItem(item)}
                style={({ pressed }) => [
                  styles.item,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                    borderRadius: theme.radius.md,
                    opacity: pressed && !theme.reduceMotion ? 0.9 : 1,
                  },
                ]}
              >
                <View style={styles.itemLeading}>
                  <Ionicons name={item.icon as any} size={17} color={theme.colors.text} />
                  <Text style={[styles.itemTitle, { color: theme.colors.text }]}>{item.label}</Text>
                </View>
                <Badge value={item.badge} tone="info" />
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      <Button label="Logout" variant="ghost" onPress={onLogout} />
    </DrawerContentScrollView>
  )
}

const styles = StyleSheet.create({
  drawerScroll: {
    padding: 12,
    gap: 12,
  },
  profileWrap: {
    gap: 2,
  },
  name: {
    fontSize: 17,
    fontFamily: FONTS.sansBold,
  },
  org: {
    fontSize: 12,
  },
  searchWrap: {
    borderWidth: 1,
    minHeight: 42,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: FONTS.sansSemiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  itemsWrap: {
    gap: 8,
  },
  item: {
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontFamily: FONTS.sansSemiBold,
  },
})
