import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Text, View } from 'react-native'
import { apiClient } from '../api/client'
import { listQueuedOperations, pendingSyncConflictsCount } from '../db/store'
import { registerForPushNotifications } from '../notifications/push'
import { useAuth } from '../providers/AuthProvider'
import { useSync } from '../sync/SyncProvider'
import type { MobileAuthDeviceRecord, NotificationPreferenceRecord, SyncPolicyRecord } from '../types'
import { useAppTheme } from '../theme/ThemeProvider'
import { Badge, Button, Card, EmptyState, ListItem, ScreenContainer, SectionHeader, Select, StatusPill, TextField } from '../ui'

const yesNoOptions = [
  { value: 'yes', label: 'Enabled' },
  { value: 'no', label: 'Disabled' },
] as const

export const SettingsScreen = () => {
  const theme = useAppTheme()
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
  const [queueStats, setQueueStats] = useState({
    queued: 0,
    retrying: 0,
    rejected: 0,
    conflicts: 0,
  })

  useEffect(() => {
    setSyncPolicyDraft(policy)
  }, [policy])

  useEffect(() => {
    const operations = listQueuedOperations()
    const queued = operations.filter((operation) => operation.status === 'pending' && operation.retries === 0).length
    const retrying = operations.filter((operation) => operation.status === 'pending' && operation.retries > 0).length
    const rejected = operations.filter((operation) => operation.status === 'rejected').length
    const conflicts = pendingSyncConflictsCount()
    setQueueStats({ queued, retrying, rejected, conflicts })
  }, [queueSize, syncing, lastSyncAt, lastError])

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

  const organizationOptions = useMemo(
    () =>
      organizations.map((organization) => ({
        value: String(organization.id),
        label: organization.code,
        helper: organization.name,
      })),
    [organizations],
  )

  return (
    <ScreenContainer scroll>
      <SectionHeader title="Settings" subtitle={user?.name} />

      <Card elevated>
        <SectionHeader title="Organization" subtitle="Switch active organization context." />
        <Select
          value={activeOrganization ? String(activeOrganization.id) : null}
          onChange={(value) => void selectOrganization(Number(value))}
          options={organizationOptions}
        />
      </Card>

      <Card elevated>
        <SectionHeader title="Sync Engine" subtitle={`Last sync ${lastSyncAt ? new Date(lastSyncAt).toLocaleString() : 'not yet'}`} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <StatusPill label={`Queue ${queueSize}`} tone="info" />
          <StatusPill label={`Queued ${queueStats.queued}`} tone="neutral" />
          <StatusPill label={`Retrying ${queueStats.retrying}`} tone="warning" />
          <StatusPill label={`Conflicts ${queueStats.conflicts}`} tone="warning" />
          <StatusPill label={`Rejected ${queueStats.rejected}`} tone="danger" />
          <Badge value={queueStats.conflicts} tone="danger" />
        </View>
        {lastSkipReason ? <Text style={{ color: theme.colors.warning, fontSize: 12 }}>{lastSkipReason}</Text> : null}
        {lastError ? <Text style={{ color: theme.colors.danger, fontSize: 12 }}>{lastError}</Text> : null}
        <Button label={syncing ? 'Syncing...' : 'Run Sync Now'} loading={syncing} onPress={() => void runSync({ force: true, reason: 'manual' })} />

        <Select
          label="Background sync"
          horizontal={false}
          value={syncPolicyDraft.background_enabled ? 'yes' : 'no'}
          onChange={(value) =>
            setSyncPolicyDraft((current) => ({
              ...current,
              background_enabled: value === 'yes',
            }))
          }
          options={yesNoOptions.map((option) => ({ ...option }))}
        />
        <Select
          label="Sync interval"
          value={String(syncPolicyDraft.interval_seconds)}
          onChange={(value) =>
            setSyncPolicyDraft((current) => ({
              ...current,
              interval_seconds: Number(value),
            }))
          }
          options={[15, 30, 60, 120, 300].map((seconds) => ({
            value: String(seconds),
            label: `${seconds}s`,
          }))}
        />
        <TextField
          label="Max runs per minute"
          keyboardType="numeric"
          value={String(syncPolicyDraft.max_runs_per_minute)}
          onChangeText={(value) =>
            setSyncPolicyDraft((current) => ({
              ...current,
              max_runs_per_minute:
                Number.isFinite(Number(value)) && value.trim() !== '' ? Number(value) : current.max_runs_per_minute,
            }))
          }
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextField
            label="Window start (HH:mm)"
            value={syncPolicyDraft.window_start ?? ''}
            onChangeText={(value) => setSyncPolicyDraft((current) => ({ ...current, window_start: value }))}
            style={{ flex: 1 }}
          />
          <TextField
            label="Window end (HH:mm)"
            value={syncPolicyDraft.window_end ?? ''}
            onChangeText={(value) => setSyncPolicyDraft((current) => ({ ...current, window_end: value }))}
            style={{ flex: 1 }}
          />
        </View>
        <Button
          label={savingSyncPolicy ? 'Saving...' : 'Save Sync Policy'}
          loading={savingSyncPolicy}
          variant="secondary"
          onPress={() => void saveSyncPolicy()}
        />
      </Card>

      <Card elevated>
        <SectionHeader title="Push Notifications" subtitle="Register device push token for deep-link alerts." />
        <Button label="Register Push Token" variant="secondary" onPress={() => void registerPush()} />
      </Card>

      <Card elevated>
        <SectionHeader title="Authorized Devices" subtitle="Revoke old devices if needed." />
        {loadingDevices ? <ActivityIndicator /> : null}
        {!loadingDevices && devices.length === 0 ? (
          <EmptyState title="No devices" message="No mobile devices have signed in yet." />
        ) : (
          <View style={{ gap: 8 }}>
            {devices.map((device) => (
              <ListItem
                key={device.id}
                title={device.device_name || device.device_id}
                subtitle={`Platform ${device.platform} • Last seen ${device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : 'n/a'}`}
                right={
                  <Button
                    label={revokingDeviceId === device.id ? 'Revoking...' : device.is_active ? 'Revoke' : 'Revoked'}
                    size="sm"
                    variant="danger"
                    disabled={!device.is_active || revokingDeviceId === device.id}
                    onPress={() => void revokeDevice(device.id)}
                  />
                }
              />
            ))}
          </View>
        )}
      </Card>

      <Card elevated>
        <SectionHeader title="Digest Preferences" subtitle="Set channels and digest frequency." />
        {loadingPreference ? <ActivityIndicator /> : null}
        {preference ? (
          <View style={{ gap: 10 }}>
            <Select
              label="Digest frequency"
              value={preference.digest_frequency}
              onChange={(value) =>
                setPreference((current) => (current ? { ...current, digest_frequency: value as NotificationPreferenceRecord['digest_frequency'] } : current))
              }
              options={(['off', 'daily', 'weekly', 'monthly'] as const).map((value) => ({ value, label: value }))}
            />
            <TextField value={timezone} label="Timezone" onChangeText={setTimezone} placeholder="UTC" />

            <ToggleRow
              title="Delivery channels"
              options={[
                {
                  label: 'In-app',
                  value: preference.in_app_enabled,
                  onToggle: () => setPreference((current) => (current ? { ...current, in_app_enabled: !current.in_app_enabled } : current)),
                },
                {
                  label: 'Email',
                  value: preference.email_enabled,
                  onToggle: () => setPreference((current) => (current ? { ...current, email_enabled: !current.email_enabled } : current)),
                },
                {
                  label: 'Push',
                  value: preference.push_enabled,
                  onToggle: () => setPreference((current) => (current ? { ...current, push_enabled: !current.push_enabled } : current)),
                },
              ]}
            />

            <ToggleRow
              title="Immediate alerts"
              options={[
                {
                  label: 'Assignment',
                  value: preference.immediate_assignment,
                  onToggle: () =>
                    setPreference((current) => (current ? { ...current, immediate_assignment: !current.immediate_assignment } : current)),
                },
                {
                  label: 'Status',
                  value: preference.immediate_status_change,
                  onToggle: () =>
                    setPreference((current) => (current ? { ...current, immediate_status_change: !current.immediate_status_change } : current)),
                },
                {
                  label: 'Comment',
                  value: preference.immediate_comment,
                  onToggle: () =>
                    setPreference((current) => (current ? { ...current, immediate_comment: !current.immediate_comment } : current)),
                },
              ]}
            />

            <Button label={savingPreference ? 'Saving...' : 'Save Preferences'} loading={savingPreference} onPress={() => void savePreference()} />
          </View>
        ) : null}
      </Card>

      <Button label="Logout" variant="danger" onPress={() => void logout()} />
    </ScreenContainer>
  )
}

interface ToggleRowOption {
  label: string
  value: boolean
  onToggle: () => void
}

const ToggleRow = ({ title, options }: { title: string; options: ToggleRowOption[] }) => {
  const theme = useAppTheme()

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontWeight: '700', color: theme.colors.text }}>{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((option) => (
          <Button
            key={option.label}
            label={option.label}
            size="sm"
            variant={option.value ? 'secondary' : 'ghost'}
            onPress={option.onToggle}
          />
        ))}
      </View>
    </View>
  )
}
