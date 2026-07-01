import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { findOfflineLocationByBarcode, listOfflineFloorLocations, listOfflineFloors, listOfflineFloorZones } from '../db/store'
import type { OfflineFloorLocationRow, OfflineFloorMapRow, OfflineFloorZoneRow } from '../types'
import type { SnagsStackParamList } from '../navigation/types'
import { useAppTheme } from '../theme/ThemeProvider'
import { Button, Card, EmptyState, ListItem, ScreenContainer, SectionHeader, StatusPill, TextField } from '../ui'

type Props = NativeStackScreenProps<SnagsStackParamList, 'FloorMap'>

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export const FloorMapScreen = ({ navigation }: Props) => {
  const theme = useAppTheme()
  const [projectFilter, setProjectFilter] = useState('')
  const [barcode, setBarcode] = useState('')
  const [floors, setFloors] = useState<OfflineFloorMapRow[]>([])
  const [selectedFloorId, setSelectedFloorId] = useState<number | null>(null)
  const [zones, setZones] = useState<OfflineFloorZoneRow[]>([])
  const [locations, setLocations] = useState<OfflineFloorLocationRow[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null)
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null)

  const loadFloors = useCallback(
    (nextProjectId?: number | null) => {
      const resolvedProjectId = nextProjectId ?? (projectFilter.trim() ? Number(projectFilter.trim()) : null)
      const projectId = Number.isFinite(resolvedProjectId) && (resolvedProjectId ?? 0) > 0 ? Number(resolvedProjectId) : null
      const rows = listOfflineFloors(projectId)
      setFloors(rows)

      if (rows.length === 0) {
        setSelectedFloorId(null)
        setZones([])
        setLocations([])
        setSelectedLocationId(null)
        setSelectedZoneId(null)
        return
      }

      const preferredFloor = rows.find((row) => row.id === selectedFloorId) ?? rows[0]
      setSelectedFloorId(preferredFloor.id)
      setZones(listOfflineFloorZones(preferredFloor.id))
      setLocations(listOfflineFloorLocations(preferredFloor.id))
    },
    [projectFilter, selectedFloorId],
  )

  useFocusEffect(
    useCallback(() => {
      loadFloors()
    }, [loadFloors]),
  )

  const selectedFloor = useMemo(() => floors.find((floor) => floor.id === selectedFloorId) ?? null, [floors, selectedFloorId])
  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === selectedLocationId) ?? null,
    [locations, selectedLocationId],
  )

  const selectFloor = (floorId: number) => {
    setSelectedFloorId(floorId)
    setZones(listOfflineFloorZones(floorId))
    setLocations(listOfflineFloorLocations(floorId))
    setSelectedLocationId(null)
    setSelectedZoneId(null)
  }

  const resolveBarcode = () => {
    if (!barcode.trim()) {
      return
    }

    const match = findOfflineLocationByBarcode(barcode.trim())
    if (!match) {
      Alert.alert('Not found', 'No offline location cache found for this barcode yet.')
      return
    }

    setProjectFilter(String(match.project_id))
    loadFloors(match.project_id)
    setSelectedFloorId(match.floor_id)
    setZones(listOfflineFloorZones(match.floor_id))
    setLocations(listOfflineFloorLocations(match.floor_id))
    setSelectedLocationId(match.location_id)
    setSelectedZoneId(null)
    Alert.alert('Location opened', `${match.location_name} (${match.location_code})`)
  }

  const openFilteredSnags = () => {
    if (!selectedFloor || !selectedLocation) {
      return
    }

    navigation.navigate('SnagsHome', {
      projectId: selectedFloor.project_id,
      floorId: selectedFloor.id,
      locationId: selectedLocation.id,
      locationName: selectedLocation.name,
    })
  }

  const openCreateSnag = () => {
    if (!selectedFloor || !selectedLocation) {
      return
    }

    const fallbackX = 0.5
    const fallbackY = 0.5
    const selectedZone = zones.find((zone) => zone.id === selectedZoneId) ?? null
    const pinX = selectedZone ? clamp01((selectedZone.x_min + selectedZone.x_max) / 2) : fallbackX
    const pinY = selectedZone ? clamp01((selectedZone.y_min + selectedZone.y_max) / 2) : fallbackY

    navigation.navigate('SnagCreate', {
      prefill: {
        projectId: selectedFloor.project_id,
        buildingId: selectedFloor.building_id,
        floorId: selectedFloor.id,
        locationId: selectedLocation.id,
        pinX,
        pinY,
      },
    })
  }

  return (
    <ScreenContainer scroll>
      <SectionHeader title="Offline Floor Map" subtitle="Navigate floors and zones instantly from local cache." />

      <Card elevated>
        <TextField
          label="Project filter (optional ID)"
          placeholder="Project ID"
          keyboardType="numeric"
          value={projectFilter}
          onChangeText={setProjectFilter}
        />
        <View style={styles.row}>
          <TextField
            label="Barcode quick open"
            placeholder="Scan or enter barcode"
            value={barcode}
            onChangeText={setBarcode}
            autoCapitalize="characters"
            style={styles.flex}
          />
          <View style={styles.barcodeAction}>
            <Button label="Open" variant="secondary" onPress={resolveBarcode} />
          </View>
        </View>
        <Button label="Apply filter" onPress={() => loadFloors()} />
      </Card>

      <Card elevated>
        <SectionHeader title={`Floors (${floors.length})`} />
        {floors.length === 0 ? (
          <EmptyState title="No floor cache" message="Run sync first to cache floors and zones." />
        ) : (
          <View style={{ gap: 8 }}>
            {floors.map((floor) => (
              <ListItem
                key={floor.id}
                selected={selectedFloorId === floor.id}
                onPress={() => selectFloor(floor.id)}
                title={`${floor.building_code}-${floor.code}`}
                subtitle={`${floor.open_snags} open / ${floor.total_snags} total`}
              />
            ))}
          </View>
        )}
      </Card>

      {selectedFloor ? (
        <Card elevated>
          <SectionHeader
            title={`${selectedFloor.building_name} - ${selectedFloor.name}`}
            subtitle={`${selectedFloor.location_count} locations • ${selectedFloor.zone_count} zones`}
            right={<StatusPill label={`${selectedFloor.open_snags} open`} tone="warning" />}
          />

          {zones.length > 0 ? (
            <View style={[styles.mapCanvas, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}>
              {zones.map((zone) => (
                <Pressable
                  key={zone.id}
                  style={[
                    styles.zone,
                    {
                      left: `${clamp01(zone.x_min) * 100}%`,
                      top: `${clamp01(zone.y_min) * 100}%`,
                      width: `${Math.max(2, clamp01(zone.x_max - zone.x_min) * 100)}%`,
                      height: `${Math.max(2, clamp01(zone.y_max - zone.y_min) * 100)}%`,
                      borderColor: selectedZoneId === zone.id ? theme.colors.success : theme.colors.info,
                      backgroundColor: selectedZoneId === zone.id ? 'rgba(51,181,122,0.28)' : 'rgba(122,170,241,0.26)',
                    },
                  ]}
                  onPress={() => {
                    setSelectedZoneId(zone.id)
                    setSelectedLocationId(zone.location_id)
                  }}
                >
                  <Text numberOfLines={1} style={[styles.zoneLabel, { color: theme.colors.text }]}>
                    {zone.location_code}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <EmptyState title="No zone grid" message="No cached zones for this floor yet. Use location list below." />
          )}

          <View style={{ gap: 8 }}>
            {locations.map((location) => (
              <ListItem
                key={location.id}
                selected={selectedLocationId === location.id}
                onPress={() => {
                  setSelectedLocationId(location.id)
                  setSelectedZoneId(null)
                }}
                title={`${location.code} - ${location.name}`}
                subtitle={`${location.open_snags} open / ${location.total_snags} total${location.barcode ? ` • ${location.barcode}` : ''}`}
              />
            ))}
            {locations.length === 0 ? <EmptyState title="No locations" message="No locations available on this floor." /> : null}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button label="View Location Snags" disabled={!(selectedFloor && selectedLocation)} onPress={openFilteredSnags} />
            <Button
              label="Create Snag At Location"
              variant="secondary"
              disabled={!(selectedFloor && selectedLocation)}
              onPress={openCreateSnag}
            />
          </View>
        </Card>
      ) : null}
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  flex: {
    flex: 1,
  },
  barcodeAction: {
    justifyContent: 'flex-end',
  },
  mapCanvas: {
    height: 320,
    borderRadius: 12,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  zone: {
    position: 'absolute',
    borderWidth: 1,
    padding: 2,
  },
  zoneLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
})
