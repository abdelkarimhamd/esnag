import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  findOfflineLocationByBarcode,
  listOfflineFloorLocations,
  listOfflineFloors,
  listOfflineFloorZones,
} from '../db/store'
import type {
  OfflineFloorLocationRow,
  OfflineFloorMapRow,
  OfflineFloorZoneRow,
} from '../types'
import type { SnagsStackParamList } from '../navigation/types'

type Props = NativeStackScreenProps<SnagsStackParamList, 'FloorMap'>

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export const FloorMapScreen = ({ navigation }: Props) => {
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

  const selectedFloor = useMemo(
    () => floors.find((floor) => floor.id === selectedFloorId) ?? null,
    [floors, selectedFloorId],
  )

  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === selectedLocationId) ?? null,
    [locations, selectedLocationId],
  )

  const selectedZone = useMemo(
    () => zones.find((zone) => zone.id === selectedZoneId) ?? null,
    [zones, selectedZoneId],
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
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Offline Floor Map</Text>
      <Text style={styles.subtitle}>Navigate floors and zones instantly from local cache, even when drawings are unavailable.</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Project Filter (optional project id)</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flexInput]}
            placeholder="Project ID"
            keyboardType="numeric"
            value={projectFilter}
            onChangeText={setProjectFilter}
          />
          <Pressable style={styles.secondaryButton} onPress={() => loadFloors()}>
            <Text style={styles.secondaryButtonText}>Apply</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Barcode Quick Open</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flexInput]}
            placeholder="Scan or enter barcode"
            value={barcode}
            onChangeText={setBarcode}
            autoCapitalize="characters"
          />
          <Pressable style={styles.secondaryButton} onPress={resolveBarcode}>
            <Text style={styles.secondaryButtonText}>Open</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Floors ({floors.length})</Text>
        <View style={styles.floorWrap}>
          {floors.map((floor) => (
            <Pressable
              key={floor.id}
              style={[styles.floorChip, selectedFloorId === floor.id && styles.floorChipActive]}
              onPress={() => selectFloor(floor.id)}
            >
              <Text style={[styles.floorChipText, selectedFloorId === floor.id && styles.floorChipTextActive]}>
                {floor.building_code}-{floor.code}
              </Text>
              <Text style={styles.floorMeta}>
                {floor.open_snags} open / {floor.total_snags} total
              </Text>
            </Pressable>
          ))}
          {floors.length === 0 ? <Text style={styles.empty}>No offline floor cache available yet. Run sync first.</Text> : null}
        </View>
      </View>

      {selectedFloor ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            {selectedFloor.building_name} - {selectedFloor.name}
          </Text>
          <Text style={styles.floorMeta}>
            {selectedFloor.location_count} locations | {selectedFloor.zone_count} zones | {selectedFloor.open_snags} open snags
          </Text>

          {zones.length > 0 ? (
            <View style={styles.mapCanvas}>
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
                    },
                    selectedZoneId === zone.id && styles.zoneActive,
                  ]}
                  onPress={() => {
                    setSelectedZoneId(zone.id)
                    setSelectedLocationId(zone.location_id)
                  }}
                >
                  <Text numberOfLines={1} style={styles.zoneLabel}>
                    {zone.location_code}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>No zone grid cached for this floor yet. Using location list fallback below.</Text>
          )}

          <View style={styles.locationList}>
            {locations.map((location) => (
              <Pressable
                key={location.id}
                style={[styles.locationRow, selectedLocationId === location.id && styles.locationRowActive]}
                onPress={() => {
                  setSelectedLocationId(location.id)
                  setSelectedZoneId(null)
                }}
              >
                <Text style={styles.locationName}>{location.code} - {location.name}</Text>
                <Text style={styles.locationMeta}>
                  {location.open_snags} open / {location.total_snags} total
                  {location.barcode ? ` | ${location.barcode}` : ''}
                </Text>
              </Pressable>
            ))}
            {locations.length === 0 ? <Text style={styles.empty}>No locations on this floor.</Text> : null}
          </View>

          <View style={styles.actions}>
            <Pressable
              style={[styles.primaryButton, !(selectedFloor && selectedLocation) && styles.disabledButton]}
              disabled={!(selectedFloor && selectedLocation)}
              onPress={openFilteredSnags}
            >
              <Text style={styles.primaryButtonText}>View Location Snags</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryButtonWide, !(selectedFloor && selectedLocation) && styles.disabledButton]}
              disabled={!(selectedFloor && selectedLocation)}
              onPress={openCreateSnag}
            >
              <Text style={styles.secondaryButtonText}>Create Snag At Location</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 10,
    backgroundColor: '#F8FAFC',
    paddingBottom: 30,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    color: '#475569',
  },
  card: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  label: {
    color: '#334155',
    fontWeight: '700',
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  flexInput: {
    flex: 1,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#0EA5E9',
    borderRadius: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F9FF',
  },
  secondaryButtonWide: {
    borderWidth: 1,
    borderColor: '#0EA5E9',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
  },
  secondaryButtonText: {
    color: '#0369A1',
    fontWeight: '700',
  },
  floorWrap: {
    gap: 8,
  },
  floorChip: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 10,
  },
  floorChipActive: {
    borderColor: '#0284C7',
    backgroundColor: '#E0F2FE',
  },
  floorChipText: {
    color: '#334155',
    fontWeight: '700',
  },
  floorChipTextActive: {
    color: '#0369A1',
  },
  floorMeta: {
    color: '#64748B',
    fontSize: 12,
  },
  mapCanvas: {
    marginTop: 4,
    height: 320,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    position: 'relative',
    overflow: 'hidden',
  },
  zone: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: '#06B6D4',
    backgroundColor: 'rgba(34, 211, 238, 0.22)',
    padding: 2,
  },
  zoneActive: {
    borderColor: '#0F766E',
    backgroundColor: 'rgba(45, 212, 191, 0.35)',
  },
  zoneLabel: {
    fontSize: 10,
    color: '#0F172A',
    fontWeight: '700',
  },
  locationList: {
    gap: 6,
    marginTop: 4,
  },
  locationRow: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 8,
  },
  locationRowActive: {
    borderColor: '#0284C7',
    backgroundColor: '#E0F2FE',
  },
  locationName: {
    color: '#0F172A',
    fontWeight: '700',
  },
  locationMeta: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    gap: 8,
    marginTop: 6,
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    paddingVertical: 11,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.55,
  },
  empty: {
    color: '#64748B',
  },
})
