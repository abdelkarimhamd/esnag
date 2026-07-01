import { Ionicons } from '@expo/vector-icons'
import BottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet'
import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { NormalizedMenuItem, NormalizedMenuSection } from './navConfig'
import { useAppTheme } from '../theme/ThemeProvider'
import { Badge, Button } from '../ui'

interface BottomMoreSheetProps {
  open: boolean
  onClose: () => void
  sections: NormalizedMenuSection[]
  onSelectRoute: (item: NormalizedMenuItem) => void
  onLogout: () => void
  userName?: string
  orgLabel?: string
}

export const BottomMoreSheet = ({
  open,
  onClose,
  sections,
  onSelectRoute,
  onLogout,
  userName,
  orgLabel,
}: BottomMoreSheetProps) => {
  const theme = useAppTheme()
  const sheetRef = useRef<BottomSheet>(null)
  const [query, setQuery] = useState('')
  const snapPoints = useMemo(() => ['65%', '92%'], [])

  const filteredSections = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) {
      return sections
    }

    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          return (
            item.label.toLowerCase().includes(term) ||
            item.subtitle?.toLowerCase().includes(term) ||
            item.id.toLowerCase().includes(term)
          )
        }),
      }))
      .filter((section) => section.items.length > 0)
  }, [sections, query])

  React.useEffect(() => {
    if (open) {
      sheetRef.current?.snapToIndex(0)
    } else {
      sheetRef.current?.close()
    }
  }, [open])

  const onSheetChanges = useCallback(
    (index: number) => {
      if (index < 0) {
        onClose()
      }
    },
    [onClose],
  )

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      onChange={onSheetChanges}
      backdropComponent={(props) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.35} />
      )}
      backgroundStyle={{ backgroundColor: theme.colors.surface }}
      handleIndicatorStyle={{ backgroundColor: theme.colors.border }}
    >
      <View style={[styles.content, { backgroundColor: theme.colors.surface }]}>
        <View style={styles.profileRow}>
          <View style={styles.profileText}>
            <Text style={[styles.profileName, { color: theme.colors.text }]} numberOfLines={1}>
              {userName || 'Account'}
            </Text>
            <Text style={[styles.profileOrg, { color: theme.colors.textMuted }]} numberOfLines={1}>
              {orgLabel || 'Organization'}
            </Text>
          </View>
          <Button label="Logout" size="sm" variant="ghost" onPress={onLogout} />
        </View>

        <View
          style={[
            styles.searchWrap,
            { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated, borderRadius: theme.radius.md },
          ]}
        >
          <Ionicons name="search-outline" size={16} color={theme.colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search destinations"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.searchInput, { color: theme.colors.text }]}
            accessibilityLabel="Search menu items"
          />
        </View>

        {filteredSections.map((section) => (
          <View key={section.id} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>{section.title}</Text>
            <View style={styles.itemsWrap}>
              {section.items.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  onPress={() => {
                    if (item.type === 'action' && item.action === 'logout') {
                      onLogout()
                      return
                    }

                    onSelectRoute(item)
                    onClose()
                  }}
                  style={({ pressed }) => [
                    styles.item,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surfaceElevated,
                      opacity: pressed && !theme.reduceMotion ? 0.92 : 1,
                      borderRadius: theme.radius.md,
                    },
                  ]}
                >
                  <View style={styles.itemLeading}>
                    <Ionicons name={item.icon as any} size={17} color={theme.colors.text} />
                    <View style={styles.itemText}>
                      <Text style={[styles.itemTitle, { color: theme.colors.text }]}>{item.label}</Text>
                      {item.subtitle ? <Text style={[styles.itemSubtitle, { color: theme.colors.textMuted }]}>{item.subtitle}</Text> : null}
                    </View>
                  </View>
                  <View style={styles.itemTrailing}>
                    <Badge value={item.badge} tone="info" />
                    <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 12,
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  profileText: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    fontSize: 17,
    fontWeight: '800',
  },
  profileOrg: {
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
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  itemsWrap: {
    gap: 8,
  },
  item: {
    borderWidth: 1,
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  itemText: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  itemSubtitle: {
    fontSize: 12,
  },
  itemTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
})
