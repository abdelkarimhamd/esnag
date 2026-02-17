import { CameraView, useCameraPermissions } from 'expo-camera'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useMemo, useState } from 'react'
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { apiClient } from '../api/client'
import { listEquipment, listEquipmentLogs, upsertServerEquipment, upsertServerEquipmentLogs } from '../db/store'
import { useAuth } from '../providers/AuthProvider'
import { useSync } from '../sync/SyncProvider'
import type { EquipmentLogRecord, EquipmentRecord } from '../types'

const statusColor = (status: string) => {
  if (status === 'critical') return '#B91C1C'
  if (status === 'warn') return '#B45309'
  if (status === 'ok') return '#047857'
  return '#334155'
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
      return (
        row.code.toLowerCase().includes(term) ||
        row.name.toLowerCase().includes(term) ||
        String(row.barcode ?? '')
          .toLowerCase()
          .includes(term)
      )
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
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Equipment</Text>
        <Pressable style={styles.refreshButton} onPress={() => void refreshFromServer()}>
          <Text style={styles.refreshButtonText}>Refresh</Text>
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search code/name/barcode"
          style={styles.searchInput}
        />
        <Pressable style={styles.scanButton} onPress={() => void openScanner()}>
          <Text style={styles.scanButtonText}>Scan</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {filteredRows.map((row) => (
          <Pressable
            key={row.id}
            style={[styles.card, selectedEquipment?.id === row.id && styles.cardActive]}
            onPress={() => {
              setSelectedEquipment(row)
              setLogs(listEquipmentLogs(row.id))
            }}
          >
            <Text style={styles.cardCode}>{row.code}</Text>
            <Text style={styles.cardTitle}>{row.name}</Text>
            <Text style={[styles.cardStatus, { color: statusColor(row.status) }]}>
              {row.status.toUpperCase()} {row.barcode ? `| ${row.barcode}` : ''}
            </Text>
          </Pressable>
        ))}

        {filteredRows.length === 0 ? <Text style={styles.empty}>No equipment found.</Text> : null}

        {selectedEquipment ? (
          <View style={styles.logsContainer}>
            <Text style={styles.sectionTitle}>Maintenance Logs</Text>
            {logs.map((log) => (
              <View key={log.id} style={styles.logCard}>
                <Text style={[styles.logStatus, { color: statusColor(log.status) }]}>{log.status.toUpperCase()}</Text>
                <Text style={styles.logText}>{log.description ?? 'No description'}</Text>
                {log.action_taken ? <Text style={styles.logMeta}>Action: {log.action_taken}</Text> : null}
                <Text style={styles.logMeta}>{new Date(log.occurred_at).toLocaleString()}</Text>
              </View>
            ))}

            {logs.length === 0 ? <Text style={styles.empty}>No logs for this equipment yet.</Text> : null}

            <Text style={styles.sectionTitle}>Add Log</Text>
            <View style={styles.statusRow}>
              {(['ok', 'warn', 'critical'] as const).map((status) => (
                <Pressable
                  key={status}
                  style={[styles.statusChip, logStatus === status && styles.statusChipActive]}
                  onPress={() => setLogStatus(status)}
                >
                  <Text style={[styles.statusChipText, logStatus === status && styles.statusChipTextActive]}>{status}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={[styles.searchInput, styles.multiline]}
              placeholder="Description"
              multiline
              value={logDescription}
              onChangeText={setLogDescription}
            />
            <TextInput
              style={[styles.searchInput, styles.multiline]}
              placeholder="Action taken"
              multiline
              value={logAction}
              onChangeText={setLogAction}
            />
            <Pressable style={styles.submitButton} onPress={() => void submitMaintenanceLog()}>
              <Text style={styles.submitButtonText}>Submit Log</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

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
          <View style={styles.scannerOverlay}>
            <Text style={styles.scannerText}>Point camera at equipment barcode</Text>
            <Pressable style={styles.closeScannerButton} onPress={() => setScannerOpen(false)}>
              <Text style={styles.closeScannerText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
  },
  refreshButton: {
    borderColor: '#0284C7',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#E0F2FE',
  },
  refreshButtonText: {
    color: '#0369A1',
    fontWeight: '700',
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  scanButton: {
    backgroundColor: '#0F766E',
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  scanButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  content: {
    padding: 16,
    gap: 10,
    paddingBottom: 28,
  },
  card: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 4,
  },
  cardActive: {
    borderColor: '#0284C7',
    backgroundColor: '#F0F9FF',
  },
  cardCode: {
    color: '#0369A1',
    fontWeight: '700',
  },
  cardTitle: {
    color: '#0F172A',
    fontWeight: '700',
  },
  cardStatus: {
    fontWeight: '700',
    fontSize: 12,
  },
  logsContainer: {
    marginTop: 10,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  logCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#FFFFFF',
    gap: 3,
  },
  logStatus: {
    fontWeight: '800',
  },
  logText: {
    color: '#0F172A',
  },
  logMeta: {
    color: '#64748B',
    fontSize: 12,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusChip: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusChipActive: {
    borderColor: '#0E7490',
    backgroundColor: '#CCFBF1',
  },
  statusChipText: {
    color: '#475569',
    textTransform: 'capitalize',
  },
  statusChipTextActive: {
    color: '#115E59',
    fontWeight: '700',
  },
  multiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#0284C7',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  empty: {
    color: '#64748B',
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
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    gap: 10,
    alignItems: 'center',
  },
  scannerText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  closeScannerButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closeScannerText: {
    color: '#0F172A',
    fontWeight: '700',
  },
})
