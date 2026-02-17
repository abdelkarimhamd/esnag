import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  Grid,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { subscribeOrganizationChannel } from '../realtime/echo'
import { PageHero } from '../components/ui/PageHero'
import { StatCard } from '../components/ui/StatCard'
import { formatPriorityLabel, formatStatusLabel, snagStatusChipColor } from '../utils/ui'
import type {
  DashboardChartsResponse,
  DashboardConfigRecord,
  DashboardKpisResponse,
  Paginated,
  ProjectSummary,
  RootCauseCategoryRecord,
  SnagStatus,
} from '../types'

type CardKey =
  | 'total_snags'
  | 'open_snags'
  | 'overdue_snags'
  | 'avg_closure_days'
  | 'avg_ack_hours'
  | 'avg_fix_hours'
  | 'avg_close_hours'
  | 'cost_total'
  | 'effort_total'

const statusOptions = ['new', 'assigned', 'in_progress', 'ready_for_review', 'closed', 'rejected']
const priorityOptions = ['low', 'medium', 'high', 'critical']

const cardCatalog: Array<{ key: CardKey; label: string }> = [
  { key: 'total_snags', label: 'Total Snags' },
  { key: 'open_snags', label: 'Open Snags' },
  { key: 'overdue_snags', label: 'Overdue Snags' },
  { key: 'avg_closure_days', label: 'Avg Closure (days)' },
  { key: 'avg_ack_hours', label: 'Avg Acknowledge (hrs)' },
  { key: 'avg_fix_hours', label: 'Avg Fix (hrs)' },
  { key: 'avg_close_hours', label: 'Avg Close (hrs)' },
  { key: 'cost_total', label: 'Estimated Cost Total' },
  { key: 'effort_total', label: 'Estimated Hours Total' },
]

const defaultCards: CardKey[] = ['total_snags', 'open_snags', 'overdue_snags', 'avg_closure_days']

interface DashboardFilters {
  status: string[]
  priority: string[]
  rootCauseCategoryId: number | ''
}

const toErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }).response
    const firstError = response?.data?.errors ? Object.values(response.data.errors).flat().at(0) : null
    return firstError ?? response?.data?.message ?? fallback
  }

  return fallback
}

export const DashboardPage = () => {
  const { activeOrganization } = useAuth()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [rootCauseCategories, setRootCauseCategories] = useState<RootCauseCategoryRecord[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | ''>('')
  const [kpis, setKpis] = useState<DashboardKpisResponse | null>(null)
  const [charts, setCharts] = useState<DashboardChartsResponse | null>(null)
  const [configs, setConfigs] = useState<DashboardConfigRecord[]>([])
  const [selectedConfigId, setSelectedConfigId] = useState<number | ''>('')
  const [configName, setConfigName] = useState('My Dashboard')
  const [selectedCards, setSelectedCards] = useState<CardKey[]>(defaultCards)
  const [filters, setFilters] = useState<DashboardFilters>({
    status: [],
    priority: [],
    rootCauseCategoryId: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [savingConfig, setSavingConfig] = useState(false)

  const loadProjects = async () => {
    const response = await api.get<Paginated<ProjectSummary>>('/api/projects', { params: { per_page: 100 } })
    setProjects(response.data.data)
  }

  const loadRootCauseCategories = async () => {
    const response = await api.get<{ data: RootCauseCategoryRecord[] }>('/api/root-cause-categories')
    setRootCauseCategories(response.data.data)
  }

  const loadConfigs = async () => {
    const response = await api.get<{ data: DashboardConfigRecord[] }>('/api/dashboard/configs')
    const records = response.data.data
    setConfigs(records)

    const defaultConfig = records.find((item) => item.is_default) ?? records[0]
    if (defaultConfig) {
      setSelectedConfigId(defaultConfig.id)
      applyConfig(defaultConfig)
    }
  }

  const loadDashboard = async () => {
    try {
      const params = {
        project_id: selectedProjectId || undefined,
        status: filters.status.length > 0 ? filters.status : undefined,
        priority: filters.priority.length > 0 ? filters.priority : undefined,
        root_cause_category_id: filters.rootCauseCategoryId || undefined,
      }

      const [kpiResponse, chartResponse] = await Promise.all([
        api.get<{ data: DashboardKpisResponse }>('/api/dashboard/kpis', { params }),
        api.get<{ data: DashboardChartsResponse }>('/api/dashboard/charts', { params }),
      ])

      setKpis(kpiResponse.data.data)
      setCharts(chartResponse.data.data)
      setError(null)
    } catch (requestError) {
      setError(toErrorMessage(requestError, 'Unable to load dashboard metrics.'))
    }
  }

  useEffect(() => {
    const run = async () => {
      await Promise.all([loadProjects(), loadRootCauseCategories(), loadConfigs()])
      await loadDashboard()
    }

    void run()
  }, [])

  useEffect(() => {
    void loadDashboard()
  }, [selectedProjectId, filters.status.join(','), filters.priority.join(','), filters.rootCauseCategoryId])

  useEffect(() => {
    if (!activeOrganization) {
      return
    }

    const unsubscribe = subscribeOrganizationChannel(activeOrganization.id, {
      onDashboard: () => {
        void loadDashboard()
      },
      onSnag: () => {
        void loadDashboard()
      },
    })

    return () => {
      unsubscribe()
    }
  }, [activeOrganization?.id, selectedProjectId, filters.status.join(','), filters.priority.join(','), filters.rootCauseCategoryId])

  const applyConfig = (config: DashboardConfigRecord) => {
    const configFilters = (config.filters ?? {}) as Record<string, unknown>
    setConfigName(config.name)
    setSelectedCards((config.cards as CardKey[]) ?? defaultCards)
    setFilters({
      status: Array.isArray(configFilters.status) ? configFilters.status.map((item) => String(item)) : [],
      priority: Array.isArray(configFilters.priority) ? configFilters.priority.map((item) => String(item)) : [],
      rootCauseCategoryId: configFilters.root_cause_category_id ? Number(configFilters.root_cause_category_id) : '',
    })
  }

  const saveNewConfig = async () => {
    setSavingConfig(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await api.post<{ data: DashboardConfigRecord }>('/api/dashboard/configs', {
        name: configName,
        cards: selectedCards,
        filters: {
          status: filters.status,
          priority: filters.priority,
          root_cause_category_id: filters.rootCauseCategoryId || undefined,
        },
        is_default: configs.length === 0,
      })

      const created = response.data.data
      setConfigs((current) => [...current, created])
      setSelectedConfigId(created.id)
      setSuccess('Dashboard config saved.')
    } catch (requestError) {
      setError(toErrorMessage(requestError, 'Unable to save dashboard config.'))
    } finally {
      setSavingConfig(false)
    }
  }

  const updateCurrentConfig = async () => {
    if (!selectedConfigId) {
      return
    }

    setSavingConfig(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await api.put<{ data: DashboardConfigRecord }>(`/api/dashboard/configs/${selectedConfigId}`, {
        name: configName,
        cards: selectedCards,
        filters: {
          status: filters.status,
          priority: filters.priority,
          root_cause_category_id: filters.rootCauseCategoryId || undefined,
        },
      })

      const updated = response.data.data
      setConfigs((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setSuccess('Dashboard config updated.')
    } catch (requestError) {
      setError(toErrorMessage(requestError, 'Unable to update dashboard config.'))
    } finally {
      setSavingConfig(false)
    }
  }

  const deleteCurrentConfig = async () => {
    if (!selectedConfigId) {
      return
    }

    setSavingConfig(true)
    setError(null)
    setSuccess(null)

    try {
      await api.delete(`/api/dashboard/configs/${selectedConfigId}`)

      const remaining = configs.filter((item) => item.id !== selectedConfigId)
      setConfigs(remaining)

      if (remaining.length > 0) {
        const fallback = remaining[0]
        setSelectedConfigId(fallback.id)
        applyConfig(fallback)
      } else {
        setSelectedConfigId('')
        setConfigName('My Dashboard')
        setSelectedCards(defaultCards)
        setFilters({
          status: [],
          priority: [],
          rootCauseCategoryId: '',
        })
      }

      setSuccess('Dashboard config deleted.')
    } catch (requestError) {
      setError(toErrorMessage(requestError, 'Unable to delete dashboard config.'))
    } finally {
      setSavingConfig(false)
    }
  }

  const selectedConfig = useMemo(
    () => configs.find((item) => item.id === selectedConfigId) ?? null,
    [configs, selectedConfigId],
  )

  const peakTrend = useMemo(
    () => Math.max(...(charts?.trend_14_days.map((item) => Math.max(item.created, item.closed)) ?? [1])),
    [charts],
  )

  const cardValues = useMemo(
    () => ({
      total_snags: kpis?.summary.total_snags ?? 0,
      open_snags: kpis?.summary.open_snags ?? 0,
      overdue_snags: kpis?.summary.overdue_snags ?? 0,
      avg_closure_days: kpis?.summary.avg_closure_days ?? '-',
      avg_ack_hours: kpis?.sla?.averages.ack_hours ?? '-',
      avg_fix_hours: kpis?.sla?.averages.fix_hours ?? '-',
      avg_close_hours: kpis?.sla?.averages.close_hours ?? '-',
      cost_total: kpis?.cost_impact?.summary.estimated_cost_total ?? 0,
      effort_total: kpis?.cost_impact?.summary.estimated_hours_total ?? 0,
    }),
    [kpis],
  )

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <PageHero
        title="Advanced Analytics"
        description="SLA, Pareto, cost impact, trend forecasting, and custom dashboard presets for each stakeholder."
        actions={
          <FormControl size="small" sx={{ minWidth: 280, bgcolor: 'rgba(255,255,255,0.14)', borderRadius: 1.5 }}>
            <InputLabel id="dashboard-project-label" sx={{ color: 'rgba(255,255,255,0.92)' }}>
              Project
            </InputLabel>
            <Select
              labelId="dashboard-project-label"
              value={selectedProjectId}
              label="Project"
              onChange={(event) => setSelectedProjectId(event.target.value ? Number(event.target.value) : '')}
              sx={{
                color: '#FFFFFF',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.42)' },
                '& .MuiSvgIcon-root': { color: '#FFFFFF' },
              }}
            >
              <MenuItem value="">All projects</MenuItem>
              {projects.map((project) => (
                <MenuItem key={project.id} value={project.id}>
                  {project.code} - {project.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        }
        badges={
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" variant="outlined" label={`Open ${kpis?.summary.open_snags ?? 0}`} sx={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.44)' }} />
            <Chip size="small" variant="outlined" label={`Overdue ${kpis?.summary.overdue_snags ?? 0}`} sx={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.44)' }} />
            <Chip size="small" variant="outlined" label={`Total ${kpis?.summary.total_snags ?? 0}`} sx={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.44)' }} />
          </Stack>
        }
      />

      <Paper sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          <Typography variant="h6">Custom Dashboard Builder</Typography>
          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr 1fr' }} gap={1.5}>
            <FormControl size="small">
              <InputLabel id="config-select-label">Saved Config</InputLabel>
              <Select
                labelId="config-select-label"
                value={selectedConfigId}
                label="Saved Config"
                onChange={(event) => {
                  const id = event.target.value ? Number(event.target.value) : ''
                  setSelectedConfigId(id)
                  const config = configs.find((item) => item.id === id)
                  if (config) {
                    applyConfig(config)
                  }
                }}
              >
                <MenuItem value="">Unsaved</MenuItem>
                {configs.map((config) => (
                  <MenuItem key={config.id} value={config.id}>
                    {config.name}
                    {config.is_default ? ' (default)' : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField size="small" label="Config Name" value={configName} onChange={(event) => setConfigName(event.target.value)} />

            <FormControl size="small">
              <InputLabel id="cards-select-label">KPI Cards</InputLabel>
              <Select
                multiple
                labelId="cards-select-label"
                value={selectedCards}
                label="KPI Cards"
                onChange={(event) => setSelectedCards(event.target.value as CardKey[])}
                renderValue={(selected) =>
                  (selected as CardKey[])
                    .map((key) => cardCatalog.find((item) => item.key === key)?.label ?? key)
                    .join(', ')
                }
              >
                {cardCatalog.map((card) => (
                  <MenuItem key={card.key} value={card.key}>
                    {card.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr 1fr' }} gap={1.5}>
            <FormControl size="small">
              <InputLabel id="status-filter-label">Status Filter</InputLabel>
              <Select
                multiple
                labelId="status-filter-label"
                value={filters.status}
                label="Status Filter"
                onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as string[] }))}
                renderValue={(selected) => (selected as string[]).map((status) => formatStatusLabel(status)).join(', ')}
              >
                {statusOptions.map((status) => (
                  <MenuItem key={status} value={status}>
                    {formatStatusLabel(status)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small">
              <InputLabel id="priority-filter-label">Priority Filter</InputLabel>
              <Select
                multiple
                labelId="priority-filter-label"
                value={filters.priority}
                label="Priority Filter"
                onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value as string[] }))}
                renderValue={(selected) => (selected as string[]).map((priority) => formatPriorityLabel(priority)).join(', ')}
              >
                {priorityOptions.map((priority) => (
                  <MenuItem key={priority} value={priority}>
                    {formatPriorityLabel(priority)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small">
              <InputLabel id="root-cause-filter-label">Root Cause</InputLabel>
              <Select
                labelId="root-cause-filter-label"
                value={filters.rootCauseCategoryId}
                label="Root Cause"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    rootCauseCategoryId: event.target.value ? Number(event.target.value) : '',
                  }))
                }
              >
                <MenuItem value="">All causes</MenuItem>
                {rootCauseCategories.map((category) => (
                  <MenuItem key={category.id} value={category.id}>
                    {category.code ? `${category.code} - ` : ''}
                    {category.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button variant="contained" onClick={() => void saveNewConfig()} disabled={savingConfig || !configName.trim() || selectedCards.length === 0}>
              Save New
            </Button>
            <Button variant="outlined" onClick={() => void updateCurrentConfig()} disabled={savingConfig || !selectedConfig}>
              Update Selected
            </Button>
            <Button color="error" variant="outlined" onClick={() => void deleteCurrentConfig()} disabled={savingConfig || !selectedConfig}>
              Delete Selected
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Grid container spacing={2}>
        {selectedCards.map((cardKey) => {
          const label = cardCatalog.find((item) => item.key === cardKey)?.label ?? cardKey
          const value = cardValues[cardKey]
          const tone =
            cardKey === 'overdue_snags' || cardKey === 'avg_close_hours'
              ? 'warning'
              : cardKey === 'open_snags' || cardKey === 'cost_total'
                ? 'secondary'
                : cardKey === 'avg_closure_days' || cardKey === 'avg_ack_hours'
                  ? 'neutral'
                  : 'primary'

          return (
            <Grid key={cardKey} size={{ xs: 12, md: 3 }}>
              <StatCard label={label} value={value} tone={tone} />
            </Grid>
          )
        })}
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              SLA Compliance
            </Typography>
            <Stack spacing={1}>
              <Typography variant="body2">
                Ack &lt;= {kpis?.sla?.thresholds.ack_hours ?? '-'}h: {kpis?.sla?.compliance.ack_within_sla ?? 0}/
                {kpis?.sla?.compliance.ack_measured ?? 0} ({kpis?.sla?.compliance.ack_rate ?? '-'}%)
              </Typography>
              <Typography variant="body2">
                Fix &lt;= {kpis?.sla?.thresholds.fix_hours ?? '-'}h: {kpis?.sla?.compliance.fix_within_sla ?? 0}/
                {kpis?.sla?.compliance.fix_measured ?? 0} ({kpis?.sla?.compliance.fix_rate ?? '-'}%)
              </Typography>
              <Typography variant="body2">
                Close &lt;= {kpis?.sla?.thresholds.close_hours ?? '-'}h: {kpis?.sla?.compliance.close_within_sla ?? 0}/
                {kpis?.sla?.compliance.close_measured ?? 0} ({kpis?.sla?.compliance.close_rate ?? '-'}%)
              </Typography>
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Root Cause Pareto
            </Typography>
            <List dense>
              {(kpis?.root_cause_pareto ?? []).slice(0, 8).map((item) => (
                <ListItem key={item.category} sx={{ px: 0 }}>
                  <ListItemText
                    primary={`${item.category} (${item.count})`}
                    secondary={`Share ${item.percentage}% | Cumulative ${item.cumulative_percentage}%`}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Cost Impact by Trade
            </Typography>
            <Stack spacing={1}>
              {(kpis?.cost_impact?.by_trade ?? []).slice(0, 8).map((entry) => (
                <Box key={entry.trade}>
                  <Typography variant="body2">
                    {entry.trade}: {entry.estimated_cost.toFixed(2)} cost | {entry.estimated_hours.toFixed(2)} hrs
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Cost Impact by Stakeholder
            </Typography>
            <Stack spacing={1}>
              {(kpis?.cost_impact?.by_stakeholder ?? []).slice(0, 8).map((entry) => (
                <Box key={entry.stakeholder}>
                  <Typography variant="body2">
                    {entry.stakeholder}: {entry.estimated_cost.toFixed(2)} cost | {entry.estimated_hours.toFixed(2)} hrs
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Backlog Forecast by Trade
            </Typography>
            <Stack spacing={1}>
              {(kpis?.forecast?.by_trade ?? []).slice(0, 8).map((entry) => (
                <Box key={entry.trade} display="flex" justifyContent="space-between" gap={1}>
                  <Typography variant="body2">{entry.trade}</Typography>
                  <Stack direction="row" spacing={1}>
                    <Chip size="small" label={`Now ${entry.current_open}`} />
                    <Chip size="small" label={`Projected ${entry.projected_open_end}`} />
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Backlog Forecast by Stakeholder
            </Typography>
            <Stack spacing={1}>
              {(kpis?.forecast?.by_stakeholder ?? []).slice(0, 8).map((entry) => (
                <Box key={entry.stakeholder} display="flex" justifyContent="space-between" gap={1}>
                  <Typography variant="body2">{entry.stakeholder}</Typography>
                  <Stack direction="row" spacing={1}>
                    <Chip size="small" label={`Now ${entry.current_open}`} />
                    <Chip size="small" label={`Projected ${entry.projected_open_end}`} />
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Status Breakdown
            </Typography>
            <Stack spacing={1}>
              {Object.entries(kpis?.status_breakdown ?? {}).map(([status, total]) => (
                <Box key={status}>
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2">{formatStatusLabel(status)}</Typography>
                    <Typography variant="body2" fontWeight={700}>
                      {total}
                    </Typography>
                  </Box>
                  <Box sx={{ height: 8, borderRadius: 8, bgcolor: '#E6ECF7' }}>
                    <Box
                      sx={{
                        height: 8,
                        borderRadius: 8,
                        width: `${kpis && kpis.summary.total_snags > 0 ? (total / kpis.summary.total_snags) * 100 : 0}%`,
                        bgcolor:
                          snagStatusChipColor(status as SnagStatus) === 'success'
                            ? '#7A933D'
                            : snagStatusChipColor(status as SnagStatus) === 'error'
                              ? '#B23B3B'
                              : snagStatusChipColor(status as SnagStatus) === 'warning'
                                ? '#C08A23'
                                : snagStatusChipColor(status as SnagStatus) === 'secondary'
                                  ? '#2F8FBE'
                                  : '#24488F',
                      }}
                    />
                  </Box>
                </Box>
              ))}
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              14-Day Trend
            </Typography>
            <Stack spacing={0.8}>
              {(charts?.trend_14_days ?? []).map((point) => (
                <Box key={point.date} display="grid" gridTemplateColumns="90px 1fr 1fr" columnGap={1} alignItems="center">
                  <Typography variant="caption">{point.date}</Typography>
                  <Box sx={{ height: 8, borderRadius: 8, bgcolor: '#DEE8FA' }}>
                    <Box
                      sx={{
                        height: 8,
                        borderRadius: 8,
                        width: `${(point.created / peakTrend) * 100}%`,
                        bgcolor: '#24488F',
                      }}
                    />
                  </Box>
                  <Box sx={{ height: 8, borderRadius: 8, bgcolor: '#E9F1D9' }}>
                    <Box
                      sx={{
                        height: 8,
                        borderRadius: 8,
                        width: `${(point.closed / peakTrend) * 100}%`,
                        bgcolor: '#7A933D',
                      }}
                    />
                  </Box>
                </Box>
              ))}
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  )
}
