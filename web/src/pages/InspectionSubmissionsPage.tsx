import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { useFeatureTour } from '../hooks/useFeatureTour'
import { subscribeOrganizationChannel } from '../realtime/echo'
import type {
  InspectionSubmission,
  InspectionSubmissionStatus,
  InspectionTemplateRecord,
  Paginated,
  ProjectSummary,
} from '../types'

const statusColorMap: Record<InspectionSubmissionStatus, 'default' | 'warning' | 'success' | 'error' | 'info'> = {
  draft: 'default',
  submitted: 'warning',
  in_review: 'info',
  approved: 'success',
  rejected: 'error',
}

export const InspectionSubmissionsPage = () => {
  const navigate = useNavigate()
  const { activeOrganization, permissions } = useAuth()

  const canCreate = permissions.includes('inspections.submissions.create')

  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [templates, setTemplates] = useState<InspectionTemplateRecord[]>([])
  const [submissions, setSubmissions] = useState<InspectionSubmission[]>([])
  const [projectFilter, setProjectFilter] = useState<number | ''>('')
  const [statusFilter, setStatusFilter] = useState<InspectionSubmissionStatus | ''>('')
  const [search, setSearch] = useState('')
  const [createProjectId, setCreateProjectId] = useState<number | ''>('')
  const [createTemplateId, setCreateTemplateId] = useState<number | ''>('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inspectionTourSteps = useMemo(
    () => [
      {
        id: 'inspections_create',
        title: 'Create Submission',
        text: 'Pick a template and create a draft inspection submission from this panel.',
        attachTo: { element: '#inspections-create-panel', on: 'bottom' as const },
      },
      {
        id: 'inspections_filters',
        title: 'Filter Inspections',
        text: 'Filter by project, status, or search by reference.',
        attachTo: { element: '#inspections-filter-panel', on: 'bottom' as const },
      },
      {
        id: 'inspections_list',
        title: 'Submission List',
        text: 'Open any row to fill dynamic form fields, run approvals, and capture signatures.',
        attachTo: { element: '#inspections-grid', on: 'top' as const },
      },
    ],
    [],
  )

  useFeatureTour({
    tourKey: 'inspections',
    enabled: true,
    steps: inspectionTourSteps,
  })

  const loadProjects = async () => {
    const response = await api.get<Paginated<ProjectSummary>>('/api/projects', {
      params: { per_page: 100 },
    })
    setProjects(response.data.data)
  }

  const loadTemplates = async () => {
    const response = await api.get<{ data: InspectionTemplateRecord[] }>('/api/inspections/templates', {
      params: { is_active: true, project_id: createProjectId || projectFilter || undefined },
    })
    setTemplates(response.data.data)
  }

  const loadSubmissions = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await api.get<Paginated<InspectionSubmission>>('/api/inspections/submissions', {
        params: {
          per_page: 100,
          project_id: projectFilter || undefined,
          status: statusFilter || undefined,
          search: search || undefined,
        },
      })
      setSubmissions(response.data.data)
    } catch {
      setError('Unable to load inspection submissions.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void Promise.all([loadProjects(), loadSubmissions(), loadTemplates()])
  }, [])

  useEffect(() => {
    void loadSubmissions()
    void loadTemplates()
  }, [projectFilter, statusFilter])

  useEffect(() => {
    if (!activeOrganization) {
      return
    }

    const unsubscribe = subscribeOrganizationChannel(activeOrganization.id, {
      onInspection: () => {
        void loadSubmissions()
      },
    })

    return () => {
      unsubscribe()
    }
  }, [activeOrganization?.id, projectFilter, statusFilter, search])

  const createSubmission = async () => {
    if (!canCreate || !createTemplateId) {
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const response = await api.post<{ data: InspectionSubmission }>('/api/inspections/submissions', {
        inspection_template_id: createTemplateId,
        project_id: createProjectId || undefined,
        form_data: {},
      })

      const submission = response.data.data
      await loadSubmissions()
      navigate(`/inspections/submissions/${submission.id}`)
    } catch {
      setError('Unable to create inspection submission.')
    } finally {
      setSubmitting(false)
    }
  }

  const columns = useMemo<GridColDef<InspectionSubmission>[]>(
    () => [
      { field: 'reference', headerName: 'Reference', width: 130 },
      {
        field: 'template',
        headerName: 'Template',
        minWidth: 220,
        flex: 1,
        valueGetter: (_, row) => row.template?.name ?? '-',
      },
      {
        field: 'status',
        headerName: 'Status',
        width: 140,
        renderCell: (params) => {
          const status = params.row.status
          return <Chip size="small" color={statusColorMap[status]} label={status} />
        },
      },
      {
        field: 'project',
        headerName: 'Project',
        minWidth: 160,
        valueGetter: (_, row) => row.project?.code ?? '-',
      },
      {
        field: 'creator',
        headerName: 'Created By',
        minWidth: 160,
        valueGetter: (_, row) => row.creator?.name ?? '-',
      },
      {
        field: 'created_at',
        headerName: 'Created',
        width: 180,
        valueFormatter: (value) => new Date(value).toLocaleString(),
      },
    ],
    [],
  )

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}

      <Box>
        <Typography variant="h4">Inspections</Typography>
        <Typography color="text.secondary">
          Manage dynamic inspection submissions through draft, review, approval, and signature flow.
        </Typography>
      </Box>

      <Paper sx={{ p: 2 }} id="inspections-create-panel">
        <Stack spacing={1.5}>
          <Typography variant="subtitle1">Create Submission</Typography>

          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, md: 4 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="create-submission-project">Project</InputLabel>
                <Select
                  labelId="create-submission-project"
                  label="Project"
                  value={createProjectId}
                  onChange={(event) => setCreateProjectId(event.target.value ? Number(event.target.value) : '')}
                >
                  <MenuItem value="">Use template default</MenuItem>
                  {projects.map((project) => (
                    <MenuItem key={project.id} value={project.id}>
                      {project.code} - {project.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 5 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="create-submission-template">Template</InputLabel>
                <Select
                  labelId="create-submission-template"
                  label="Template"
                  value={createTemplateId}
                  onChange={(event) => setCreateTemplateId(event.target.value ? Number(event.target.value) : '')}
                >
                  {templates.map((template) => (
                    <MenuItem key={template.id} value={template.id}>
                      {template.type.toUpperCase()} - {template.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Button
                fullWidth
                variant="contained"
                disabled={!canCreate || !createTemplateId || submitting}
                onClick={() => void createSubmission()}
              >
                {submitting ? 'Creating...' : 'Create Draft'}
              </Button>
            </Grid>
          </Grid>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2 }} id="inspections-filter-panel">
        <Grid container spacing={1.5}>
          <Grid size={{ xs: 12, md: 4 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="inspections-filter-project">Project</InputLabel>
              <Select
                labelId="inspections-filter-project"
                label="Project"
                value={projectFilter}
                onChange={(event) => setProjectFilter(event.target.value ? Number(event.target.value) : '')}
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
          <Grid size={{ xs: 12, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="inspections-filter-status">Status</InputLabel>
              <Select
                labelId="inspections-filter-status"
                label="Status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as InspectionSubmissionStatus | '')}
              >
                <MenuItem value="">All statuses</MenuItem>
                <MenuItem value="draft">draft</MenuItem>
                <MenuItem value="submitted">submitted</MenuItem>
                <MenuItem value="in_review">in_review</MenuItem>
                <MenuItem value="approved">approved</MenuItem>
                <MenuItem value="rejected">rejected</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <TextField
              fullWidth
              size="small"
              label="Search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
            <Stack direction="row" spacing={1}>
              <Button fullWidth variant="outlined" onClick={() => void loadSubmissions()}>
                Apply
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 1.5 }} id="inspections-grid">
        <DataGrid
          autoHeight
          rows={submissions}
          columns={columns}
          loading={loading}
          disableRowSelectionOnClick
          onRowClick={(params) => navigate(`/inspections/submissions/${params.row.id}`)}
          pageSizeOptions={[10, 20, 50]}
          sx={{ border: 0 }}
        />
      </Paper>
    </Stack>
  )
}

