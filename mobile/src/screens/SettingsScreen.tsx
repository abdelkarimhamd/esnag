import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { apiClient } from '../api/client'
import { registerForPushNotifications } from '../notifications/push'
import { useAuth } from '../providers/AuthProvider'
import { useSync } from '../sync/SyncProvider'
import type { MobileAuthDeviceRecord, NotificationPreferenceRecord, SyncPolicyRecord } from '../types'

export const SettingsScreen = () => {
  const { user, token, organizations, activeOrganization, selectOrganization, logout } = useAuth()
  const { queueSize, syncing, lastSyncAt, runSync, lastError, lastSkipReason, policy, updatePolicy } = useSync()
  const [preference, setPreference] = useState<NotificationPreferenceRecord | null>(null)
  const [loadingPreference, setLoadingPreference] = useState(false)
  const [savingPreference, setSavingPreference] = useState(false)
  const [savingSyncPolicy, setSavingSyncPolicy] = useState(false)
  const [timezone, setTimezone] = useState('UTC')
  const [syncPolicyDraft, setSyncPolicyDraft] = useState<SyncPolicyRecord>(policy)
  const [devices, setDevices] = useState<MobileAuthDeviceRecord[]>([])
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [revokingDeviceId, setRevokingDeviceId] = useState<number | null>(null)

  useEffect(() => {
    setSyncPolicyDraft(policy)
  }, [policy])

  const loadPreference = async () => {
    if (!token || !activeOrganization) {
      return
    }

    setLoadingPreference(true)
    try {
      const response = await apiClient.fetchNotificationPreference(token, activeOrganization.id)
      setPreference(response.data)
      setTimezone(response.data.timezone)
    } finally {
      setLoadingPreference(false)
    }
  }

  useEffect(() => {
    void loadPreference()
  }, [token, activeOrganization?.id])

  const loadDevices = async () => {
    if (!token || !activeOrganization) {
      return
    }

    setLoadingDevices(true)
    try {
      const response = await apiClient.listMobileDevices(token, activeOrganization.id)
      setDevices(response.data)
    } catch (error) {
      Alert.alert('Device list unavailable', error instanceof Error ? error.message : 'Unable to load authorized devices.')
    } finally {
      setLoadingDevices(false)
    }
  }

  useEffect(() => {
    void loadDevices()
  }, [token, activeOrganization?.id])

  const savePreference = async () => {
    if (!token || !activeOrganization || !preference) {
      return
    }

    setSavingPreference(true)
    try {
      const response = await apiClient.updateNotificationPreference(token, activeOrganization.id, {
        digest_frequency: preference.digest_frequency,
        in_app_enabled: preference.in_app_enabled,
        email_enabled: preference.email_enabled,
        push_enabled: preference.push_enabled,
        immediate_assignment: preference.immediate_assignment,
        immediate_status_change: preference.immediate_status_change,
        immediate_comment: preference.immediate_comment,
        approval_needed: preference.approval_needed,
        signature_requested: preference.signature_requested,
        quiet_hours_start: preference.quiet_hours_start ?? null,
        quiet_hours_end: preference.quiet_hours_end ?? null,
        timezone,
      })

      setPreference(response.data)
      Alert.alert('Saved', 'Notification preferences were updated.')
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Unable to save preferences.')
    } finally {
      setSavingPreference(false)
    }
  }

  const saveSyncPolicy = async () => {
    setSavingSyncPolicy(true)
    try {
      const normalized: SyncPolicyRecord = {
        background_enabled: syncPolicyDraft.background_enabled,
        interval_seconds: Math.min(600, Math.max(15, Math.round(syncPolicyDraft.interval_seconds))),
        max_runs_per_minute: Math.min(60, Math.max(1, Math.round(syncPolicyDraft.max_runs_per_minute))),
        window_start: syncPolicyDraft.window_start?.trim() ? syncPolicyDraft.window_start.trim() : null,
        window_end: syncPolicyDraft.window_end?.trim() ? syncPolicyDraft.window_end.trim() : null,
      }
      updatePolicy(normalized)
      Alert.alert('Saved', 'Sync policy updated.')
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Unable to update sync policy.')
    } finally {
      setSavingSyncPolicy(false)
    }
  }

  const registerPush = async () => {
    if (!token || !activeOrganization) {
      return
    }

    try {
      const tokenValue = await registerForPushNotifications(token, activeOrganization.id)
      Alert.alert('Push token registered', tokenValue)
    } catch (error) {
      Alert.alert('Push registration failed', error instanceof Error ? error.message : 'Unable to register push token.')
    }
  }

  const revokeDevice = async (deviceId: number) => {
    if (!token || !activeOrganization) {
      return
    }

    setRevokingDeviceId(deviceId)
    try {
      await apiClient.revokeMobileDevice(token, activeOrganization.id, deviceId)
      await loadDevices()
      Alert.alert('Device revoked', 'The selected mobile device can no longer use existing session tokens.')
    } catch (error) {
      Alert.alert('Revoke failed', error instanceof Error ? error.message : 'Unable to revoke the selected device.')
    } finally {
      setRevokingDeviceId(null)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Settings</Text>
      <Text style={styles.subtitle}>{user?.name}</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Organization</Text>
        {organizations.map((organization) => (
          <Pressable
            key={organization.id}
            style={[styles.orgOption, activeOrganization?.id === organization.id && styles.orgOptionActive]}
            onPress={() => void selectOrganization(organization.id)}
          >
            <Text style={[styles.orgName, activeOrganization?.id === organization.id && styles.orgNameActive]}>
              {organization.code} - {organization.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Sync Engine</Text>
        <Text style={styles.info}>Queue size: {queueSize}</Text>
        <Text style={styles.info}>Sync state: {syncing ? 'running' : 'idle'}</Text>
        <Text style={styles.info}>Last sync: {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : 'not yet'}</Text>
        {lastSkipReason ? <Text style={styles.hint}>{lastSkipReason}</Text> : null}
        {lastError ? <Text style={styles.error}>{lastError}</Text> : null}

        <Pressable style={styles.primaryButton} onPress={() => void runSync({ force: true, reason: 'manual' })}>
          <Text style={styles.primaryButtonText}>Run Sync Now</Text>
        </Pressable>

        <Text style={styles.label}>Background sync</Text>
        <View style={styles.row}>
          <Toggle
            label="Enabled"
            value={syncPolicyDraft.background_enabled}
            onPress={() =>
              setSyncPolicyDraft((current) => ({
                ...current,
                background_enabled: !current.background_enabled,
              }))
            }
          />
        </View>

        <Text style={styles.label}>Sync interval (seconds)</Text>
        <View style={styles.choiceRow}>
          {[15, 30, 60, 120, 300].map((seconds) => (
            <Pressable
              key={seconds}
              style={[styles.choiceChip, syncPolicyDraft.interval_seconds === seconds && styles.choiceChipActive]}
              onPress={() =>
                setSyncPolicyDraft((current) => ({
                  ...current,
                  interval_seconds: seconds,
                }))
              }
            >
              <Text style={[styles.choiceText, syncPolicyDraft.interval_seconds === seconds && styles.choiceTextActive]}>
                {seconds}s
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Max runs per minute</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={String(syncPolicyDraft.max_runs_per_minute)}
          onChangeText={(value) =>
            setSyncPolicyDraft((current) => ({
              ...current,
              max_runs_per_minute: Number.isFinite(Number(value)) && value.trim() !== '' ? Number(value) : current.max_runs_per_minute,
            }))
          }
        />

        <Text style={styles.label}>Sync window (HH:mm, optional)</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flexInput]}
            placeholder="Start (e.g. 06:00)"
            value={syncPolicyDraft.window_start ?? ''}
            onChangeText={(value) =>
              setSyncPolicyDraft((current) => ({
                ...current,
                window_start: value,
              }))
            }
          />
          <TextInput
            style={[styles.input, styles.flexInput]}
            placeholder="End (e.g. 22:00)"
            value={syncPolicyDraft.window_end ?? ''}
            onChangeText={(value) =>
              setSyncPolicyDraft((current) => ({
                ...current,
                window_end: value,
              }))
            }
          />
        </View>

        <Pressable
          style={[styles.secondaryButton, savingSyncPolicy && styles.buttonDisabled]}
          disabled={savingSyncPolicy}
          onPress={() => void saveSyncPolicy()}
        >
          <Text style={styles.secondaryButtonText}>{savingSyncPolicy ? 'Saving...' : 'Save Sync Policy'}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Push Notifications</Text>
        <Pressable style={styles.secondaryButton} onPress={() => void registerPush()}>
          <Text style={styles.secondaryButtonText}>Register Push Token</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Authorized Devices</Text>
        {loadingDevices ? <ActivityIndicator /> : null}

        {!loadingDevices && devices.length === 0 ? <Text style={styles.hint}>No mobile devices have signed in yet.</Text> : null}

        {devices.map((device) => (
          <View key={device.id} style={styles.deviceRow}>
            <View style={styles.deviceMeta}>
              <Text style={styles.deviceName}>{device.device_name || device.device_id}</Text>
              <Text style={styles.deviceDetail}>Platform: {device.platform}</Text>
              <Text style={styles.deviceDetail}>
                Last seen: {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : 'n/a'}
              </Text>
              <Text style={styles.deviceDetail}>
                Trusted until: {device.trusted_until ? new Date(device.trusted_until).toLocaleString() : 'not trusted'}
              </Text>
              <Text style={[styles.deviceDetail, !device.is_active && styles.error]}>
                Status: {device.is_active ? 'active' : 'revoked'}
              </Text>
            </View>

            <Pressable
              style={[styles.dangerButton, (!device.is_active || revokingDeviceId === device.id) && styles.buttonDisabled]}
              disabled={!device.is_active || revokingDeviceId === device.id}
              onPress={() => void revokeDevice(device.id)}
            >
              <Text style={styles.dangerButtonText}>{revokingDeviceId === device.id ? 'Revoking...' : 'Revoke'}</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Digest Preferences</Text>
        {loadingPreference && <ActivityIndicator />}

        {preference ? (
          <View style={styles.preferenceStack}>
            <Text style={styles.label}>Digest frequency</Text>
            <View style={styles.choiceRow}>
              {(['off', 'daily', 'weekly', 'monthly'] as const).map((value) => (
                <Pressable
                  key={value}
                  style={[styles.choiceChip, preference.digest_frequency === value && styles.choiceChipActive]}
                  onPress={() =>
                    setPreference((current) => (current ? { ...current, digest_frequency: value } : current))
                  }
                >
                  <Text style={[styles.choiceText, preference.digest_frequency === value && styles.choiceTextActive]}>
                    {value}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Timezone</Text>
            <TextInput value={timezone} onChangeText={setTimezone} style={styles.input} placeholder="UTC" />

            <View style={styles.row}>
              <Toggle
                label="In-app"
                value={preference.in_app_enabled}
                onPress={() =>
                  setPreference((current) => (current ? { ...current, in_app_enabled: !current.in_app_enabled } : current))
                }
              />
              <Toggle
                label="Email"
                value={preference.email_enabled}
                onPress={() =>
                  setPreference((current) => (current ? { ...current, email_enabled: !current.email_enabled } : current))
                }
              />
              <Toggle
                label="Push"
                value={preference.push_enabled}
                onPress={() =>
                  setPreference((current) => (current ? { ...current, push_enabled: !current.push_enabled } : current))
                }
              />
            </View>

            <View style={styles.row}>
              <Toggle
                label="Assign"
                value={preference.immediate_assignment}
                onPress={() =>
                  setPreference((current) =>
                    current ? { ...current, immediate_assignment: !current.immediate_assignment } : current,
                  )
                }
              />
              <Toggle
                label="Status"
                value={preference.immediate_status_change}
                onPress={() =>
                  setPreference((current) =>
                    current ? { ...current, immediate_status_change: !current.immediate_status_change } : current,
                  )
                }
              />
              <Toggle
                label="Comment"
                value={preference.immediate_comment}
                onPress={() =>
                  setPreference((current) =>
                    current ? { ...current, immediate_comment: !current.immediate_comment } : current,
                  )
                }
              />
            </View>

            <Pressable
              style={[styles.primaryButton, savingPreference && styles.buttonDisabled]}
              disabled={savingPreference}
              onPress={() => void savePreference()}
            >
              <Text style={styles.primaryButtonText}>{savingPreference ? 'Saving...' : 'Save Preferences'}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <Pressable style={styles.logoutButton} onPress={() => void logout()}>
        <Text style={styles.logoutText}>Logout</Text>
      </Pressable>
    </ScrollView>
  )
}

const Toggle = ({ label, value, onPress }: { label: string; value: boolean; onPress: () => void }) => (
  <Pressable style={[styles.toggle, value && styles.toggleActive]} onPress={onPress}>
    <Text style={[styles.toggleText, value && styles.toggleTextActive]}>{label}</Text>
  </Pressable>
)

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 10,
    backgroundColor: '#F8FAFC',
    paddingBottom: 28,
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    color: '#475569',
    marginBottom: 4,
  },
  card: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  orgOption: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 10,
  },
  orgOptionActive: {
    borderColor: '#0284C7',
    backgroundColor: '#E0F2FE',
  },
  orgName: {
    color: '#334155',
  },
  orgNameActive: {
    color: '#0369A1',
    fontWeight: '700',
  },
  info: {
    color: '#334155',
  },
  error: {
    color: '#B91C1C',
  },
  hint: {
    color: '#0F766E',
    fontSize: 12,
  },
  primaryButton: {
    marginTop: 2,
    backgroundColor: '#0369A1',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 11,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#0EA5E9',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#F0F9FF',
  },
  secondaryButtonText: {
    color: '#0369A1',
    fontWeight: '700',
  },
  preferenceStack: {
    gap: 8,
  },
  label: {
    color: '#334155',
    fontWeight: '700',
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceChip: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  choiceChipActive: {
    borderColor: '#0E7490',
    backgroundColor: '#CCFBF1',
  },
  choiceText: {
    textTransform: 'capitalize',
    color: '#475569',
  },
  choiceTextActive: {
    color: '#115E59',
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  flexInput: {
    flex: 1,
  },
  toggle: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  toggleActive: {
    borderColor: '#0284C7',
    backgroundColor: '#E0F2FE',
  },
  toggleText: {
    color: '#475569',
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#0369A1',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  logoutButton: {
    backgroundColor: '#111827',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  logoutText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  deviceRow: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  deviceMeta: {
    gap: 2,
  },
  deviceName: {
    color: '#0F172A',
    fontWeight: '700',
  },
  deviceDetail: {
    color: '#475569',
    fontSize: 12,
  },
  dangerButton: {
    borderWidth: 1,
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 8,
  },
  dangerButtonText: {
    color: '#B91C1C',
    fontWeight: '700',
  },
})
