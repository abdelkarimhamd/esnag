import {
  Alert,
  Button,
  Chip,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { PageHero } from '../components/ui/PageHero'
import { StatCard } from '../components/ui/StatCard'
import { useAuth } from '../hooks/useAuth'
import { useFeatureTour } from '../hooks/useFeatureTour'
import { subscribeOrganizationChannel } from '../realtime/echo'
import { parseApiError } from '../utils/apiError'
import { formatStatusLabel } from '../utils/ui'
import type { ExportJob, Paginated, ProjectSummary } from '../types'

export const ExportCenterPage = () => {
  const { activeOrganization, permissions } = useAuth()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [jobs, setJobs] = useState<ExportJob[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | ''>('')
  const [type, setType] = useState<'pdf' | 'csv' | 'xlsx'>('pdf')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const canRequest = permissions.includes('exports.request')
  const exportTourSteps = useMemo(
    () => [
      {
        id: 'exports_create',
        title: 'Request Export',
        text: 'Generate PDF, CSV, or XLSX reports from current snag data.',
        attachTo: { element: '#exports-create', on: 'bottom' as const },
      },
      {
        id: 'exports_center',
        title: 'Export Center',
        text: 'Track queued and completed exports, then download when ready.',
        attachTo: { element: '#exports-grid', on: 'top' as const },
      },
    ],
    [],
  )

  useFeatureTour({
    tourKey: 'exports',
    enabled: true,
    steps: exportTourSteps,
  })

  const loadProjects = async () => {
    const response = await api.get<Paginated<ProjectSummary>>('/api/projects', {
      params: { per_page: 100 },
    })
    setProjects(response.data.data)
  }

  const loadJobs = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await api.get<Paginated<ExportJob>>('/api/exports', {
        params: { per_page: 100, project_id: selectedProjectId || undefined },
      })
      setJobs(response.data.data)
    } catch (requestError) {
      setError(parseApiError(requestError, 'Unable to load export jobs.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void Promise.all([loadProjects(), loadJobs()])
  }, [])

  useEffect(() => {
    void loadJobs()
  }, [selectedProjectId])

  useEffect(() => {
    if (!activeOrganization) {
      return
    }

    const unsubscribe = subscribeOrganizationChannel(activeOrganization.id, {
      onExport: () => {
        void loadJobs()
      },
    })

    return () => {
      unsubscribe()
    }
  }, [activeOrganization?.id, selectedProjectId])

  const requestExport = async () => {
    setSubmitting(true)
    setError(null)

    try {
      await api.post('/api/exports', {
        type,
        project_id: selectedProjectId || undefined,
      })
      await loadJobs()
    } catch (requestError) {
      setError(parseApiError(requestError, 'Export request failed.'))
    } finally {
      setSubmitting(false)
    }
  }

  const columns = useMemo<GridColDef<ExportJob>[]>(
    () => [
      { field: 'id', headerName: 'ID', width: 80 },
      { field: 'type', headerName: 'Type', width: 100 },
      {
        field: 'status',
        headerName: 'Status',
        width: 140,
        renderCell: (params) => {
          const status = params.row.status
          const color = status === 'completed' ? 'success' : status === 'failed' ? 'error' : 'warning'
          return <Chip size="small" color={color} label={formatStatusLabel(status)} />
        },
      },
      {
        field: 'project',
        headerName: 'Project',
        minWidth: 180,
        flex: 1,
        valueGetter: (_, row) => row.project?.code ?? 'All projects',
      },
      {
        field: 'created_at',
        headerName: 'Requested',
        width: 190,
        valueFormatter: (value) => new Date(value).toLocaleString(),
      },
      {
        field: 'completed_at',
        headerName: 'Completed',
        width: 190,
        valueFormatter: (value) => (value ? new Date(value).toLocaleString() : '-'),
      },
      {
        field: 'actions',
        headerName: 'Actions',
        width: 150,
        sortable: false,
        filterable: false,
        renderCell: (params) => {
          const row = params.row
          if (row.status !== 'completed') {
            return null
          }

          return (
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                window.open(`/api/exports/${row.id}/download`, '_blank')
              }}
            >
              Download
            </Button>
          )
        },
      },
    ],
    [],
  )

  const queuedCount = useMemo(
    () => jobs.filter((job) => job.status === 'queued' || job.status === 'processing').length,
    [jobs],
  )
  const completedCount = useMemo(() => jobs.filter((job) => job.status === 'completed').length, [jobs])
  const failedCount = useMemo(() => jobs.filter((job) => job.status === 'failed').length, [jobs])

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}

      <PageHero
        title="Export Center"
        description="Queue PDF, CSV, and XLSX exports and download files as soon as processing completes."
        badges={
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" variant="outlined" label={`Queued ${queuedCount}`} sx={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.44)' }} />
            <Chip size="small" variant="outlined" label={`Completed ${completedCount}`} sx={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.44)' }} />
            <Chip size="small" variant="outlined" label={`Failed ${failedCount}`} sx={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.44)' }} />
          </Stack>
        }
      />

      <Grid container spacing={1.2}>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <StatCard label="Queued / Processing" value={queuedCount} tone="warning" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <StatCard label="Completed" value={completedCount} tone="success" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <StatCard label="Failed" value={failedCount} tone="secondary" />
        </Grid>
      </Grid>

      <Paper sx={{ p: 2 }} id="exports-create">
        <Grid container spacing={2} mt={0.2} alignItems="center">
          <Grid size={{ xs: 12, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="export-type-label">Type</InputLabel>
              <Select
                labelId="export-type-label"
                label="Type"
                value={type}
                onChange={(event) => setType(event.target.value as 'pdf' | 'csv' | 'xlsx')}
              >
                <MenuItem value="pdf">PDF</MenuItem>
                <MenuItem value="csv">CSV</MenuItem>
                <MenuItem value="xlsx">XLSX</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="export-project-label">Project</InputLabel>
              <Select
                labelId="export-project-label"
                label="Project"
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value ? Number(event.target.value) : '')}
              >
                <MenuItem value="">All projects</MenuItem>
                {projects.map((project) => (
                  <MenuItem key={project.id} value={project.id}>
                    {project.code} - {project.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, md: 5 }}>
            <Stack direction="row" justifyContent={{ xs: 'flex-start', md: 'flex-end' }} spacing={1}>
              <Button variant="outlined" onClick={() => void loadJobs()}>
                Refresh
              </Button>
              <Button variant="contained" onClick={() => void requestExport()} disabled={!canRequest || submitting}>
                {submitting ? 'Queueing...' : 'Request Export'}
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 1.5 }} id="exports-grid">
        <DataGrid
          autoHeight
          rows={jobs}
          columns={columns}
          loading={loading}
          disableRowSelectionOnClick
          pageSizeOptions={[10, 20, 50]}
          sx={{ border: 0 }}
        />
      </Paper>
    </Stack>
  )
}
