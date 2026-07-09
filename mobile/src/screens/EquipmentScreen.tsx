import { CameraView, useCameraPermissions } from 'expo-camera'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useMemo, useState } from 'react'
import { Alert, Modal, StyleSheet, Text, View } from 'react-native'
import { apiClient } from '../api/client'
import { listEquipment, listEquipmentLogs, upsertServerEquipment, upsertServerEquipmentLogs } from '../db/store'
import { useAuth } from '../providers/AuthProvider'
import { useSync } from '../sync/SyncProvider'
import { useAppTheme } from '../theme/ThemeProvider'
import type { EquipmentLogRecord, EquipmentRecord } from '../types'
import { Button, Card, EmptyState, ListItem, ScreenContainer, SectionHeader, Select, StatusPill, TextField } from '../ui'

const statusTone = (status: string): 'success' | 'warning' | 'danger' | 'info' => {
  if (status === 'critical') {
    return 'danger'
  }
  if (status === 'warn') {
    return 'warning'
  }
  if (status === 'ok') {
    return 'success'
  }
  return 'info'
}

export const EquipmentScreen = () => {
  const { token, activeOrganization } = useAuth()
  const { runSync } = useSync()
  const [permission, requestPermission] = useCameraPermissions()
  const [scannerOpen, setScannerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [equipmentRows, setEquipmentRows] = useState<EquipmentRecord[]>([])
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentRecord | null>(null)
  const [logs, setLogs] = useState<EquipmentLogRecord[]>([])
  const [logStatus, setLogStatus] = useState<'ok' | 'warn' | 'critical'>('ok')
  const [logDescription, setLogDescription] = useState('')
  const [logAction, setLogAction] = useState('')

  const loadLocal = useCallback(() => {
    const rows = listEquipment()
    setEquipmentRows(rows)

    if (selectedEquipment) {
      setLogs(listEquipmentLogs(selectedEquipment.id))
    }
  }, [selectedEquipment?.id])

  const refreshFromServer = useCallback(async () => {
    if (!token || !activeOrganization) {
      return
    }

    await runSync()
    const equipmentResponse = await apiClient.listEquipment(token, activeOrganization.id, search || undefined)
    upsertServerEquipment(equipmentResponse.data as Array<Record<string, unknown>>)

    if (selectedEquipment) {
      const logsResponse = await apiClient.listEquipmentLogs(token, activeOrganization.id, selectedEquipment.id)
      upsertServerEquipmentLogs(logsResponse.data as Array<Record<string, unknown>>)
    }

    loadLocal()
  }, [token, activeOrganization?.id, selectedEquipment?.id, search, runSync, loadLocal])

  useFocusEffect(
    useCallback(() => {
      loadLocal()
      void refreshFromServer()
    }, [loadLocal, refreshFromServer]),
  )

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) {
      return equipmentRows
    }

    return equipmentRows.filter((row) => {
      return row.code.toLowerCase().includes(term) || row.name.toLowerCase().includes(term) || String(row.barcode ?? '').toLowerCase().includes(term)
    })
  }, [equipmentRows, search])

  const submitMaintenanceLog = async () => {
    if (!token || !activeOrganization || !selectedEquipment) {
      return
    }

    await apiClient.createEquipmentLog(token, activeOrganization.id, selectedEquipment.id, {
      status: logStatus,
      description: logDescription.trim() || null,
      action_taken: logAction.trim() || null,
    })

    setLogDescription('')
    setLogAction('')
    await refreshFromServer()
  }

  const openScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission()
      if (!result.granted) {
        Alert.alert('Camera permission required', 'Enable camera permission to scan barcodes.')
        return
      }
    }

    setScannerOpen(true)
  }

  return (
    <ScreenContainer scroll>
      <SectionHeader title="Equipment" subtitle="Asset status, barcode lookup, and maintenance logs." />
      <Card elevated>
        <TextField
          value={search}
          onChangeText={setSearch}
          placeholder="Search by code, name, or barcode"
          label="Search"
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button label="Refresh" onPress={() => void refreshFromServer()} />
          <Button label="Scan barcode" variant="secondary" onPress={() => void openScanner()} />
        </View>
      </Card>

      <Card elevated>
        <SectionHeader title={`Equipment (${filteredRows.length})`} />
        {filteredRows.length === 0 ? (
          <EmptyState title="No equipment found" message="Try another search term or refresh from server." />
        ) : (
          <View style={{ gap: 8 }}>
            {filteredRows.map((row) => (
              <ListItem
                key={row.id}
                selected={selectedEquipment?.id === row.id}
                onPress={() => {
                  setSelectedEquipment(row)
                  setLogs(listEquipmentLogs(row.id))
                }}
                title={`${row.code} - ${row.name}`}
                subtitle={row.barcode ? `Barcode ${row.barcode}` : 'No barcode'}
                right={<StatusPill label={row.status} tone={statusTone(row.status)} />}
              />
            ))}
          </View>
        )}
      </Card>

      {selectedEquipment ? (
        <Card elevated>
          <SectionHeader
            title="Maintenance Logs"
            subtitle={`${selectedEquipment.code} • ${selectedEquipment.name}`}
          />
          {logs.length === 0 ? (
            <EmptyState title="No logs yet" message="Add the first maintenance log below." />
          ) : (
            <View style={{ gap: 8 }}>
              {logs.map((log) => (
                <ListItem
                  key={log.id}
                  title={log.description ?? 'No description'}
                  subtitle={`${new Date(log.occurred_at).toLocaleString()}${log.action_taken ? ` • Action: ${log.action_taken}` : ''}`}
                  right={<StatusPill label={log.status} tone={statusTone(log.status)} />}
                />
              ))}
            </View>
          )}

          <SectionHeader title="Add Log" />
          <Select
            label="Status"
            value={logStatus}
            onChange={(value) => setLogStatus(value as typeof logStatus)}
            options={(['ok', 'warn', 'critical'] as const).map((status) => ({ value: status, label: status }))}
          />
          <TextField
            label="Description"
            placeholder="Description"
            multiline
            value={logDescription}
            onChangeText={setLogDescription}
            style={styles.multiline}
          />
          <TextField
            label="Action taken"
            placeholder="Action taken"
            multiline
            value={logAction}
            onChangeText={setLogAction}
            style={styles.multiline}
          />
          <Button label="Submit Log" onPress={() => void submitMaintenanceLog()} />
        </Card>
      ) : null}

      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <View style={styles.scannerContainer}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            onBarcodeScanned={({ data }) => {
              setSearch(String(data ?? ''))
              setScannerOpen(false)
            }}
          />
          <View style={[styles.scannerOverlay, { backgroundColor: 'rgba(8, 23, 52, 0.68)' }]}>
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Point camera at equipment barcode</Text>
            <Button label="Close" variant="ghost" onPress={() => setScannerOpen(false)} />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  multiline: {
    minHeight: 78,
    textAlignVertical: 'top',
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scannerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    gap: 10,
    alignItems: 'center',
  },
})
