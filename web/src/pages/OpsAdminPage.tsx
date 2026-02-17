import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import type {
  OpsFeatureFlagsResponse,
  OpsHealthDashboardResponse,
  OrganizationInviteRecord,
  OrganizationSecuritySettingsRecord,
  OrganizationUsageLimitsRecord,
  OrganizationUsageSnapshot,
  Paginated,
  ProjectSummary,
  UserSummary,
} from '../types'

const toErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }).response
    const firstError = response?.data?.errors ? Object.values(response.data.errors).flat().at(0) : null
    return firstError ?? response?.data?.message ?? fallback
  }

  return fallback
}

export const OpsAdminPage = () => {
  const { activeOrganization, permissions } = useAuth()

  const canManageFlags = permissions.includes('ops.feature_flags.manage')
  const canManageLimits = permissions.includes('ops.usage_limits.manage')
  const canManageSecurity = permissions.includes('ops.security.manage')
  const canViewHealth = permissions.includes('ops.health.view')
  const canManageSupport = permissions.includes('ops.support.manage')
  const canAccess = canManageFlags || canManageLimits || canManageSecurity || canViewHealth || canManageSupport

  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | ''>('')

  const [featureRows, setFeatureRows] = useState<OpsFeatureFlagsResponse['flags']>([])
  const [featureDraft, setFeatureDraft] = useState<Record<string, boolean>>({})
  const [savingFlags, setSavingFlags] = useState(false)

  const [limits, setLimits] = useState<OrganizationUsageLimitsRecord | null>(null)
  const [usage, setUsage] = useState<OrganizationUsageSnapshot | null>(null)
  const [savingLimits, setSavingLimits] = useState(false)
  const [securitySettings, setSecuritySettings] = useState<OrganizationSecuritySettingsRecord | null>(null)
  const [savingSecurity, setSavingSecurity] = useState(false)
  const [ipAllowlistDraft, setIpAllowlistDraft] = useState('')

  const [windowHours, setWindowHours] = useState(24)
  const [health, setHealth] = useState<OpsHealthDashboardResponse | null>(null)

  const [members, setMembers] = useState<UserSummary[]>([])
  const [invites, setInvites] = useState<Paginated<OrganizationInviteRecord> | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteExpiryDays, setInviteExpiryDays] = useState('7')
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [resetTourKey, setResetTourKey] = useState('')
  const [replayTourKeys, setReplayTourKeys] = useState('core,snags_board,closeout,exports,inspections,approvals,requests')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const selectedProjectNumericId = selectedProjectId ? Number(selectedProjectId) : null

  const loadProjects = async () => {
    const response = await api.get<Paginated<ProjectSummary>>('/api/projects', {
      params: { per_page: 200 },
    })

    setProjects(response.data.data)
  }

  const loadFeatureFlags = async () => {
    if (!canManageFlags) {
      return
    }

    const response = await api.get<{ data: OpsFeatureFlagsResponse }>('/api/ops/feature-flags', {
      params: {
        project_id: selectedProjectNumericId || undefined,
      },
    })

    const rows = response.data.data.flags
    setFeatureRows(rows)
    setFeatureDraft(
      rows.reduce<Record<string, boolean>>((acc, row) => {
        acc[row.feature_key] = row.resolved_enabled
        return acc
      }, {}),
    )
  }

  const loadUsageLimits = async () => {
    if (!canManageLimits) {
      return
    }

    const response = await api.get<{ data: { limits: OrganizationUsageLimitsRecord; usage: OrganizationUsageSnapshot } }>('/api/ops/usage-limits')
    setLimits(response.data.data.limits)
    setUsage(response.data.data.usage)
  }

  const loadSecuritySettings = async () => {
    if (!canManageSecurity) {
      return
    }

    const response = await api.get<{ data: { settings: OrganizationSecuritySettingsRecord } }>('/api/ops/security')
    const settings = response.data.data.settings
    setSecuritySettings(settings)
    setIpAllowlistDraft((settings.ip_allowlist ?? []).join('\n'))
  }

  const loadHealth = async () => {
    if (!canViewHealth) {
      return
    }

    const response = await api.get<{ data: OpsHealthDashboardResponse }>('/api/ops/health', {
      params: {
        window_hours: windowHours,
      },
    })

    setHealth(response.data.data)
  }

  const loadSupportData = async () => {
    if (!canManageSupport) {
      return
    }

    const [membersResponse, invitesResponse] = await Promise.all([
      api.get<{ data: UserSummary[] }>('/api/organizations/members'),
      api.get<Paginated<OrganizationInviteRecord>>('/api/ops/support/invites', {
        params: { per_page: 20 },
      }),
    ])

    setMembers(membersResponse.data.data)
    setInvites(invitesResponse.data)
  }

  const loadAll = async () => {
    if (!canAccess) {
      return
    }

    setBusy(true)
    setError(null)

    try {
      const tasks: Array<Promise<unknown>> = []

      if (canManageFlags) {
        tasks.push(loadProjects())
        tasks.push(loadFeatureFlags())
      }

      if (canManageLimits) {
        tasks.push(loadUsageLimits())
      }

      if (canManageSecurity) {
        tasks.push(loadSecuritySettings())
      }

      if (canViewHealth) {
        tasks.push(loadHealth())
      }

      if (canManageSupport) {
        tasks.push(loadSupportData())
      }

      await Promise.all(tasks)
    } catch (requestError) {
      setError(toErrorMessage(requestError, 'Unable to load ops data.'))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!activeOrganization) {
      return
    }

    void loadAll()
  }, [activeOrganization?.id])

  useEffect(() => {
    if (!activeOrganization || !canManageFlags) {
      return
    }

    void loadFeatureFlags()
  }, [selectedProjectId])

  useEffect(() => {
    if (!activeOrganization || !canViewHealth) {
      return
    }

    void loadHealth()
  }, [windowHours])

  const saveFeatureFlags = async () => {
    if (!canManageFlags || featureRows.length === 0) {
      return
    }

    setSavingFlags(true)
    setError(null)
    setSuccess(null)

    try {
      await api.put('/api/ops/feature-flags', {
        project_id: selectedProjectNumericId || null,
        flags: featureRows.map((row) => ({
          feature_key: row.feature_key,
          is_enabled: Boolean(featureDraft[row.feature_key]),
        })),
      })

      setSuccess('Feature flags updated.')
      await loadFeatureFlags()
    } catch (requestError) {
      setError(toErrorMessage(requestError, 'Unable to save feature flags.'))
    } finally {
      setSavingFlags(false)
    }
  }

  const saveUsageLimits = async () => {
    if (!canManageLimits || !limits) {
      return
    }

    setSavingLimits(true)
    setError(null)
    setSuccess(null)

    try {
      await api.put<{ data: OrganizationUsageLimitsRecord }>('/api/ops/usage-limits', {
        storage_quota_mb: Number(limits.storage_quota_mb),
        max_exports_per_day: Number(limits.max_exports_per_day),
        max_users: Number(limits.max_users),
      })

      setSuccess('Usage limits updated.')
      await loadUsageLimits()
    } catch (requestError) {
      setError(toErrorMessage(requestError, 'Unable to save usage limits.'))
    } finally {
      setSavingLimits(false)
    }
  }

  const saveSecuritySettings = async () => {
    if (!canManageSecurity || !securitySettings) {
      return
    }

    setSavingSecurity(true)
    setError(null)
    setSuccess(null)

    try {
      await api.put<{ data: OrganizationSecuritySettingsRecord }>('/api/ops/security', {
        mfa_required_web: securitySettings.mfa_required_web,
        mfa_required_mobile: securitySettings.mfa_required_mobile,
        mobile_device_trust_days: Number(securitySettings.mobile_device_trust_days),
        enforce_ip_allowlist: securitySettings.enforce_ip_allowlist,
        ip_allowlist: ipAllowlistDraft
          .split(/\r?\n|,/)
          .map((entry) => entry.trim())
          .filter(Boolean),
        antivirus_mode: securitySettings.antivirus_mode,
        pii_redaction_mode: securitySettings.pii_redaction_mode,
      })

      setSuccess('Security settings updated.')
      await loadSecuritySettings()
    } catch (requestError) {
      setError(toErrorMessage(requestError, 'Unable to save security settings.'))
    } finally {
      setSavingSecurity(false)
    }
  }

  const createInvite = async () => {
    if (!canManageSupport || !inviteEmail.trim()) {
      return
    }

    setError(null)
    setSuccess(null)

    try {
      await api.post('/api/ops/support/invites', {
        email: inviteEmail.trim(),
        expires_in_days: Number(inviteExpiryDays || 7),
      })

      setInviteEmail('')
      setSuccess('Invite created.')
      await loadSupportData()
      if (canManageLimits) {
        await loadUsageLimits()
      }
    } catch (requestError) {
      setError(toErrorMessage(requestError, 'Unable to create invite.'))
    }
  }

  const resendInvite = async (inviteId: number) => {
    if (!canManageSupport) {
      return
    }

    setError(null)
    setSuccess(null)

    try {
      await api.post(`/api/ops/support/invites/${inviteId}/resend`)
      setSuccess('Invite resent.')
      await loadSupportData()
    } catch (requestError) {
      setError(toErrorMessage(requestError, 'Unable to resend invite.'))
    }
  }

  const resetMfa = async () => {
    if (!canManageSupport || !selectedUserId) {
      return
    }

    setError(null)
    setSuccess(null)

    try {
      await api.post(`/api/ops/support/users/${selectedUserId}/reset-mfa`)
      setSuccess('MFA reset completed.')
    } catch (requestError) {
      setError(toErrorMessage(requestError, 'Unable to reset MFA.'))
    }
  }

  const resetOnboarding = async () => {
    if (!canManageSupport || !selectedUserId) {
      return
    }

    setError(null)
    setSuccess(null)

    try {
      await api.post(`/api/ops/support/users/${selectedUserId}/reset-onboarding`, {
        tour_key: resetTourKey.trim() || undefined,
      })
      setSuccess('Onboarding progress reset.')
    } catch (requestError) {
      setError(toErrorMessage(requestError, 'Unable to reset onboarding.'))
    }
  }

  const replayTours = async () => {
    if (!canManageSupport || !selectedUserId) {
      return
    }

    const keys = replayTourKeys
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)

    if (keys.length === 0) {
      setError('Provide at least one tour key.')
      return
    }

    setError(null)
    setSuccess(null)

    try {
      await api.post(`/api/ops/support/users/${selectedUserId}/replay-tours`, {
        tour_keys: keys,
      })
      setSuccess('Tour replay queued.')
    } catch (requestError) {
      setError(toErrorMessage(requestError, 'Unable to replay tours.'))
    }
  }

  const syncBreakdownRows = useMemo(() => {
    if (!health) {
      return []
    }

    return Object.entries(health.sync.by_status)
      .map(([status, total]) => ({ status, total }))
      .sort((a, b) => b.total - a.total)
  }, [health])

  if (!canAccess) {
    return <Alert severity="warning">You do not have access to the ops console.</Alert>
  }

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Paper sx={{ p: 2 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
          <Box>
            <Typography variant="h4">Ops Console</Typography>
            <Typography color="text.secondary">
              Tenant controls for feature flags, quotas, health metrics, and self-serve support actions.
            </Typography>
          </Box>

          <Button variant="outlined" onClick={() => void loadAll()} disabled={busy}>
            Refresh
          </Button>
        </Box>
      </Paper>

      {canManageFlags && (
        <Paper sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Box display="flex" justifyContent="space-between" alignItems="center" gap={2} flexWrap="wrap">
              <Box>
                <Typography variant="h6">Feature Flags</Typography>
                <Typography variant="body2" color="text.secondary">
                  Configure module availability at organization level or project override scope.
                </Typography>
              </Box>

              <FormControl size="small" sx={{ minWidth: 280 }}>
                <InputLabel id="ops-feature-project">Scope</InputLabel>
                <Select
                  labelId="ops-feature-project"
                  label="Scope"
                  value={selectedProjectId}
                  onChange={(event) => setSelectedProjectId(event.target.value ? Number(event.target.value) : '')}
                >
                  <MenuItem value="">Organization defaults</MenuItem>
                  {projects.map((project) => (
                    <MenuItem key={project.id} value={project.id}>
                      {project.code} - {project.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Feature</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="center">Default</TableCell>
                  <TableCell align="center">Resolved</TableCell>
                  <TableCell align="center">Scope Value</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {featureRows.map((row) => (
                  <TableRow key={row.feature_key}>
                    <TableCell>
                      <Typography fontWeight={700}>{row.label}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {row.feature_key}
                      </Typography>
                    </TableCell>
                    <TableCell>{row.description}</TableCell>
                    <TableCell align="center">{row.default_enabled ? 'On' : 'Off'}</TableCell>
                    <TableCell align="center">{row.resolved_enabled ? 'On' : 'Off'}</TableCell>
                    <TableCell align="center">
                      <Switch
                        checked={Boolean(featureDraft[row.feature_key])}
                        onChange={(event) =>
                          setFeatureDraft((current) => ({
                            ...current,
                            [row.feature_key]: event.target.checked,
                          }))
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Box display="flex" justifyContent="flex-end">
              <Button variant="contained" onClick={() => void saveFeatureFlags()} disabled={savingFlags || featureRows.length === 0}>
                {savingFlags ? 'Saving...' : 'Save Flags'}
              </Button>
            </Box>
          </Stack>
        </Paper>
      )}

      {canManageSecurity && securitySettings && (
        <Paper sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Typography variant="h6">Security Policies</Typography>
            <Typography variant="body2" color="text.secondary">
              Configure tenant-level MFA enforcement, trusted mobile device window, IP allowlist, antivirus, and PII redaction controls.
            </Typography>

            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, md: 3 }}>
                <Typography variant="body2" fontWeight={700}>Web MFA Required</Typography>
                <Switch
                  checked={securitySettings.mfa_required_web}
                  onChange={(event) =>
                    setSecuritySettings((current) =>
                      current
                        ? {
                            ...current,
                            mfa_required_web: event.target.checked,
                          }
                        : current,
                    )
                  }
                />
              </Grid>

              <Grid size={{ xs: 12, md: 3 }}>
                <Typography variant="body2" fontWeight={700}>Mobile MFA Required</Typography>
                <Switch
                  checked={securitySettings.mfa_required_mobile}
                  onChange={(event) =>
                    setSecuritySettings((current) =>
                      current
                        ? {
                            ...current,
                            mfa_required_mobile: event.target.checked,
                          }
                        : current,
                    )
                  }
                />
              </Grid>

              <Grid size={{ xs: 12, md: 3 }}>
                <TextField
                  size="small"
                  label="Trusted device days"
                  type="number"
                  value={securitySettings.mobile_device_trust_days}
                  onChange={(event) =>
                    setSecuritySettings((current) =>
                      current
                        ? {
                            ...current,
                            mobile_device_trust_days: Number(event.target.value),
                          }
                        : current,
                    )
                  }
                />
              </Grid>

              <Grid size={{ xs: 12, md: 3 }}>
                <Typography variant="body2" fontWeight={700}>IP Allowlist Enforced</Typography>
                <Switch
                  checked={securitySettings.enforce_ip_allowlist}
                  onChange={(event) =>
                    setSecuritySettings((current) =>
                      current
                        ? {
                            ...current,
                            enforce_ip_allowlist: event.target.checked,
                          }
                        : current,
                    )
                  }
                />
              </Grid>
            </Grid>

            <TextField
              size="small"
              label="IP allowlist (newline or comma separated; CIDR supported)"
              value={ipAllowlistDraft}
              onChange={(event) => setIpAllowlistDraft(event.target.value)}
              multiline
              minRows={3}
            />

            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, md: 6 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel id="ops-antivirus-mode">Antivirus Mode</InputLabel>
                  <Select
                    labelId="ops-antivirus-mode"
                    label="Antivirus Mode"
                    value={securitySettings.antivirus_mode}
                    onChange={(event) =>
                      setSecuritySettings((current) =>
                        current
                          ? {
                              ...current,
                              antivirus_mode: event.target.value as OrganizationSecuritySettingsRecord['antivirus_mode'],
                            }
                          : current,
                      )
                    }
                  >
                    <MenuItem value="off">off</MenuItem>
                    <MenuItem value="log_only">log_only</MenuItem>
                    <MenuItem value="enforce">enforce</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel id="ops-pii-mode">PII Redaction Mode</InputLabel>
                  <Select
                    labelId="ops-pii-mode"
                    label="PII Redaction Mode"
                    value={securitySettings.pii_redaction_mode}
                    onChange={(event) =>
                      setSecuritySettings((current) =>
                        current
                          ? {
                              ...current,
                              pii_redaction_mode: event.target.value as OrganizationSecuritySettingsRecord['pii_redaction_mode'],
                            }
                          : current,
                      )
                    }
                  >
                    <MenuItem value="off">off</MenuItem>
                    <MenuItem value="warn">warn</MenuItem>
                    <MenuItem value="require">require</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <Box display="flex" justifyContent="flex-end">
              <Button variant="contained" onClick={() => void saveSecuritySettings()} disabled={savingSecurity}>
                {savingSecurity ? 'Saving...' : 'Save Security'}
              </Button>
            </Box>
          </Stack>
        </Paper>
      )}

      {(canManageLimits || canViewHealth) && (
        <Grid container spacing={2}>
          {canManageLimits && (
            <Grid size={{ xs: 12, lg: 5 }}>
              <Paper sx={{ p: 2, height: '100%' }}>
                <Stack spacing={1.5}>
                  <Typography variant="h6">Usage Limits</Typography>

                  <TextField
                    size="small"
                    label="Storage quota (MB)"
                    type="number"
                    value={limits?.storage_quota_mb ?? ''}
                    onChange={(event) =>
                      setLimits((current) =>
                        current
                          ? {
                              ...current,
                              storage_quota_mb: Number(event.target.value),
                            }
                          : current,
                      )
                    }
                  />

                  <TextField
                    size="small"
                    label="Max exports/day"
                    type="number"
                    value={limits?.max_exports_per_day ?? ''}
                    onChange={(event) =>
                      setLimits((current) =>
                        current
                          ? {
                              ...current,
                              max_exports_per_day: Number(event.target.value),
                            }
                          : current,
                      )
                    }
                  />

                  <TextField
                    size="small"
                    label="Max users"
                    type="number"
                    value={limits?.max_users ?? ''}
                    onChange={(event) =>
                      setLimits((current) =>
                        current
                          ? {
                              ...current,
                              max_users: Number(event.target.value),
                            }
                          : current,
                      )
                    }
                  />

                  <Button variant="contained" onClick={() => void saveUsageLimits()} disabled={!limits || savingLimits}>
                    {savingLimits ? 'Saving...' : 'Save Limits'}
                  </Button>

                  <Typography variant="subtitle2" sx={{ pt: 1 }}>
                    Current Usage
                  </Typography>
                  <Typography variant="body2">Active users: {usage?.active_users ?? 0}</Typography>
                  <Typography variant="body2">Pending invites: {usage?.pending_invites ?? 0}</Typography>
                  <Typography variant="body2">Exports today: {usage?.exports_today ?? 0}</Typography>
                  <Typography variant="body2">Storage used: {usage?.storage_used_mb ?? 0} MB</Typography>
                </Stack>
              </Paper>
            </Grid>
          )}

          {canViewHealth && (
            <Grid size={{ xs: 12, lg: canManageLimits ? 7 : 12 }}>
              <Paper sx={{ p: 2, height: '100%' }}>
                <Stack spacing={2}>
                  <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                    <Typography variant="h6">Health Dashboard</Typography>

                    <FormControl size="small" sx={{ minWidth: 180 }}>
                      <InputLabel id="ops-window-hours">Window</InputLabel>
                      <Select
                        labelId="ops-window-hours"
                        label="Window"
                        value={windowHours}
                        onChange={(event) => setWindowHours(Number(event.target.value))}
                      >
                        <MenuItem value={6}>Last 6 hours</MenuItem>
                        <MenuItem value={24}>Last 24 hours</MenuItem>
                        <MenuItem value={72}>Last 72 hours</MenuItem>
                        <MenuItem value={168}>Last 7 days</MenuItem>
                      </Select>
                    </FormControl>
                  </Box>

                  <Grid container spacing={1.5}>
                    <Grid size={{ xs: 12, md: 3 }}>
                      <Card>
                        <CardContent>
                          <Typography variant="body2" color="text.secondary">Sync Errors</Typography>
                          <Typography variant="h5">{health?.sync.error_rate_percent ?? 0}%</Typography>
                          <Typography variant="caption">
                            {health?.sync.error_operations ?? 0} / {health?.sync.total_operations ?? 0}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid size={{ xs: 12, md: 3 }}>
                      <Card>
                        <CardContent>
                          <Typography variant="body2" color="text.secondary">Queue Depth</Typography>
                          <Typography variant="h5">{health?.queue_depth.framework_jobs ?? 0}</Typography>
                          <Typography variant="caption">jobs table rows</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid size={{ xs: 12, md: 3 }}>
                      <Card>
                        <CardContent>
                          <Typography variant="body2" color="text.secondary">Failed Queue (24h)</Typography>
                          <Typography variant="h5">{health?.queue_depth.framework_failed_jobs_last_24h ?? 0}</Typography>
                          <Typography variant="caption">framework failed jobs</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid size={{ xs: 12, md: 3 }}>
                      <Card>
                        <CardContent>
                          <Typography variant="body2" color="text.secondary">Storage Failures (24h)</Typography>
                          <Typography variant="h5">{health?.storage_failures.ops_events_last_24h ?? 0}</Typography>
                          <Typography variant="caption">
                            + mobile failed: {health?.storage_failures.mobile_upload_failed_last_24h ?? 0}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>

                  <Grid container spacing={1.5}>
                    <Grid size={{ xs: 12, md: 5 }}>
                      <Paper variant="outlined" sx={{ p: 1.5 }}>
                        <Typography variant="subtitle2" gutterBottom>
                          Sync Status Breakdown
                        </Typography>
                        <Stack spacing={0.7}>
                          {syncBreakdownRows.map((row) => (
                            <Box key={row.status} display="flex" justifyContent="space-between">
                              <Typography variant="body2">{row.status}</Typography>
                              <Typography variant="body2" fontWeight={700}>{row.total}</Typography>
                            </Box>
                          ))}
                          {syncBreakdownRows.length === 0 && <Typography variant="body2" color="text.secondary">No sync telemetry yet.</Typography>}
                        </Stack>
                      </Paper>
                    </Grid>

                    <Grid size={{ xs: 12, md: 7 }}>
                      <Paper variant="outlined" sx={{ p: 1.5 }}>
                        <Typography variant="subtitle2" gutterBottom>
                          Recent Storage Failures
                        </Typography>
                        <Stack spacing={1}>
                          {(health?.storage_failures.recent ?? []).map((event, index) => (
                            <Box key={`${event.source}-${event.occurred_at ?? index}`}>
                              <Typography variant="body2" fontWeight={700}>
                                [{event.severity}] {event.source}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {event.occurred_at ? new Date(event.occurred_at).toLocaleString() : 'n/a'}
                              </Typography>
                              <Typography variant="body2">{event.message || 'No message provided.'}</Typography>
                            </Box>
                          ))}
                          {(health?.storage_failures.recent ?? []).length === 0 && (
                            <Typography variant="body2" color="text.secondary">No storage failures recorded in this window.</Typography>
                          )}
                        </Stack>
                      </Paper>
                    </Grid>
                  </Grid>
                </Stack>
              </Paper>
            </Grid>
          )}
        </Grid>
      )}

      {canManageSupport && (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, lg: 6 }}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Stack spacing={1.5}>
                <Typography variant="h6">Support Tools</Typography>

                <FormControl size="small" fullWidth>
                  <InputLabel id="ops-target-user">Target user</InputLabel>
                  <Select
                    labelId="ops-target-user"
                    label="Target user"
                    value={selectedUserId}
                    onChange={(event) => setSelectedUserId(String(event.target.value))}
                  >
                    {members.map((member) => (
                      <MenuItem key={member.id} value={member.id}>
                        {member.name} ({member.email})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button variant="outlined" onClick={() => void resetMfa()} disabled={!selectedUserId}>
                    Reset MFA
                  </Button>
                  <Button variant="outlined" onClick={() => void resetOnboarding()} disabled={!selectedUserId}>
                    Reset Onboarding
                  </Button>
                </Stack>

                <TextField
                  size="small"
                  label="Tour key for reset (optional)"
                  value={resetTourKey}
                  onChange={(event) => setResetTourKey(event.target.value)}
                />

                <TextField
                  size="small"
                  label="Replay tours (csv keys)"
                  value={replayTourKeys}
                  onChange={(event) => setReplayTourKeys(event.target.value)}
                />

                <Button variant="contained" onClick={() => void replayTours()} disabled={!selectedUserId}>
                  Replay Tours
                </Button>
              </Stack>
            </Paper>
          </Grid>

          <Grid size={{ xs: 12, lg: 6 }}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Stack spacing={1.5}>
                <Typography variant="h6">Invites</Typography>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <TextField
                    size="small"
                    label="Invite email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    fullWidth
                  />
                  <TextField
                    size="small"
                    label="Expires in days"
                    type="number"
                    value={inviteExpiryDays}
                    onChange={(event) => setInviteExpiryDays(event.target.value)}
                    sx={{ width: { xs: '100%', sm: 150 } }}
                  />
                  <Button variant="contained" onClick={() => void createInvite()}>
                    Create
                  </Button>
                </Stack>

                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Email</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Last sent</TableCell>
                      <TableCell align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(invites?.data ?? []).map((invite) => (
                      <TableRow key={invite.id}>
                        <TableCell>{invite.email}</TableCell>
                        <TableCell>{invite.status}</TableCell>
                        <TableCell>{invite.last_sent_at ? new Date(invite.last_sent_at).toLocaleString() : 'n/a'}</TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            onClick={() => void resendInvite(invite.id)}
                            disabled={invite.status !== 'pending'}
                          >
                            Resend
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      )}

      {busy && (
        <Typography variant="body2" color="text.secondary">
          Loading ops data...
        </Typography>
      )}
    </Stack>
  )
}
