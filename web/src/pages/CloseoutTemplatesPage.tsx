import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { parseApiError } from '../utils/apiError'
import type { CloseoutTemplate, Paginated, ProjectSummary } from '../types'

interface CloseoutTemplateDraft {
  project_id: number | ''
  name: string
  trade: string
  discipline: string
  description: string
  is_default: boolean
  is_active: boolean
  items: CloseoutTemplateItemDraft[]
}

interface CloseoutTemplateItemDraft {
  title: string
  description: string
  required: boolean
  evidence_required: boolean
}

const emptyItem = (): CloseoutTemplateItemDraft => ({
  title: '',
  description: '',
  required: true,
  evidence_required: true,
})

const initialDraft = (): CloseoutTemplateDraft => ({
  project_id: '',
  name: '',
  trade: '',
  discipline: '',
  description: '',
  is_default: false,
  is_active: true,
  items: [emptyItem()],
})

const toDraft = (template: CloseoutTemplate): CloseoutTemplateDraft => ({
  project_id: template.project_id ?? '',
  name: template.name,
  trade: template.trade ?? '',
  discipline: template.discipline ?? '',
  description: template.description ?? '',
  is_default: template.is_default,
  is_active: template.is_active,
  items:
    template.items?.map((item) => ({
      title: item.title,
      description: item.description ?? '',
      required: item.required,
      evidence_required: item.evidence_required,
    })) ?? [emptyItem()],
})

const disciplineOptions = ['Architectural', 'Civil', 'Electrical', 'Mechanical', 'MEP', 'QA/QC', 'Safety']

export const CloseoutTemplatesPage = () => {
  const { permissions } = useAuth()
  const canView = permissions.includes('closeout.templates.view') || permissions.includes('projects.view')
  const canManage = permissions.includes('closeout.templates.manage')

  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [templates, setTemplates] = useState<CloseoutTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [projectFilter, setProjectFilter] = useState<number | ''>('')
  const [disciplineFilter, setDisciplineFilter] = useState<string>('')
  const [libraryOnly, setLibraryOnly] = useState(false)
  const [draft, setDraft] = useState<CloseoutTemplateDraft>(initialDraft())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  )
  const selectedTemplateIsLibrary = Boolean(selectedTemplate?.is_library)
  const formLocked = !canManage || selectedTemplateIsLibrary

  const columns = useMemo<GridColDef<CloseoutTemplate>[]>(
    () => [
      { field: 'name', headerName: 'Name', minWidth: 220, flex: 1 },
      { field: 'trade', headerName: 'Trade', width: 130, valueGetter: (_, row) => row.trade ?? '-' },
      { field: 'discipline', headerName: 'Discipline', width: 140, valueGetter: (_, row) => row.discipline ?? '-' },
      {
        field: 'project',
        headerName: 'Project',
        minWidth: 160,
        flex: 1,
        valueGetter: (_, row) => row.project?.code ?? 'Org default',
      },
      { field: 'is_library', headerName: 'Library', width: 90, valueFormatter: (value) => (value ? 'Yes' : 'No') },
      { field: 'is_default', headerName: 'Default', width: 90, valueFormatter: (value) => (value ? 'Yes' : 'No') },
      { field: 'is_active', headerName: 'Active', width: 90, valueFormatter: (value) => (value ? 'Yes' : 'No') },
      { field: 'items_count', headerName: 'Items', width: 80, valueGetter: (_, row) => row.items?.length ?? 0 },
    ],
    [],
  )

  const loadProjects = async () => {
    const response = await api.get<Paginated<ProjectSummary>>('/api/projects', { params: { per_page: 100 } })
    setProjects(response.data.data)
  }

  const loadTemplates = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await api.get<{ data: CloseoutTemplate[] }>('/api/closeout/templates', {
        params: {
          project_id: projectFilter || undefined,
          discipline: disciplineFilter || undefined,
          library_only: libraryOnly || undefined,
        },
      })
      setTemplates(response.data.data)
    } catch (requestError) {
      setError(parseApiError(requestError, 'Unable to load closeout templates.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!canView) {
      return
    }

    void Promise.all([loadProjects(), loadTemplates()])
  }, [canView])

  useEffect(() => {
    if (!canView) {
      return
    }

    void loadTemplates()
  }, [canView, disciplineFilter, libraryOnly, projectFilter])

  useEffect(() => {
    if (!selectedTemplate) {
      return
    }

    setDraft(toDraft(selectedTemplate))
  }, [selectedTemplateId])

  const resetForm = () => {
    setSelectedTemplateId(null)
    setDraft(initialDraft())
  }

  const saveTemplate = async () => {
    if (!canManage) {
      return
    }

    if (selectedTemplateId && selectedTemplateIsLibrary) {
      setError('Library templates are read-only. Clone the template to create a project copy.')
      return
    }

    setSaving(true)
    setError(null)

    const payload = {
      project_id: draft.project_id || null,
      name: draft.name.trim(),
      trade: draft.trade.trim() || null,
      discipline: draft.discipline.trim() || null,
      description: draft.description.trim() || null,
      is_default: draft.is_default,
      is_active: draft.is_active,
      items: draft.items.map((item) => ({
        title: item.title.trim(),
        description: item.description.trim() || null,
        required: item.required,
        evidence_required: item.evidence_required,
      })),
    }

    try {
      if (selectedTemplateId) {
        await api.put(`/api/closeout/templates/${selectedTemplateId}`, payload)
      } else {
        const response = await api.post<{ data: CloseoutTemplate }>('/api/closeout/templates', payload)
        setSelectedTemplateId(response.data.data.id)
      }

      await loadTemplates()
    } catch (requestError) {
      setError(parseApiError(requestError, 'Unable to save closeout template.'))
    } finally {
      setSaving(false)
    }
  }

  const cloneTemplate = async () => {
    if (!canManage || !selectedTemplateId || !selectedTemplateIsLibrary) {
      return
    }

    setSaving(true)
    setError(null)

    try {
      await api.post(`/api/closeout/templates/${selectedTemplateId}/clone`, {
        project_id: draft.project_id || projectFilter || null,
        name: draft.name.trim() || undefined,
      })

      await loadTemplates()
      setError(null)
    } catch (requestError) {
      setError(parseApiError(requestError, 'Unable to clone library template.'))
    } finally {
      setSaving(false)
    }
  }

  const deleteTemplate = async () => {
    if (!canManage || !selectedTemplateId || selectedTemplateIsLibrary) {
      return
    }

    setSaving(true)
    setError(null)

    try {
      await api.delete(`/api/closeout/templates/${selectedTemplateId}`)
      resetForm()
      await loadTemplates()
    } catch (requestError) {
      setError(parseApiError(requestError, 'Unable to delete closeout template.'))
    } finally {
      setSaving(false)
    }
  }

  const updateItem = (index: number, updater: (item: CloseoutTemplateItemDraft) => CloseoutTemplateItemDraft) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index ? updater(item) : item)),
    }))
  }

  if (!canView) {
    return <Alert severity="warning">You do not have permission to view closeout templates.</Alert>
  }

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}

      <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h5">Closeout Templates</Typography>
          <Typography color="text.secondary">Manage checklist libraries and clone discipline templates into projects.</Typography>
        </Box>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} width={{ xs: '100%', md: 'auto' }}>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="closeout-template-project-filter">Project</InputLabel>
            <Select
              labelId="closeout-template-project-filter"
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

          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="closeout-template-discipline-filter">Discipline</InputLabel>
            <Select
              labelId="closeout-template-discipline-filter"
              label="Discipline"
              value={disciplineFilter}
              onChange={(event) => setDisciplineFilter(String(event.target.value))}
            >
              <MenuItem value="">All</MenuItem>
              {disciplineOptions.map((discipline) => (
                <MenuItem key={discipline} value={discipline}>
                  {discipline}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControlLabel
            control={<Switch checked={libraryOnly} onChange={(event) => setLibraryOnly(event.target.checked)} />}
            label="Library only"
            sx={{ mx: 0 }}
          />
        </Stack>
      </Box>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Paper sx={{ p: 1.5 }}>
            <DataGrid
              autoHeight
              rows={templates}
              columns={columns}
              loading={loading}
              disableRowSelectionOnClick
              onRowClick={(params) => {
                setSelectedTemplateId(params.row.id)
              }}
              pageSizeOptions={[10, 20, 50]}
              sx={{ border: 0 }}
            />
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 7 }}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="h6">{selectedTemplateId ? 'Edit Template' : 'Create Template'}</Typography>
                    {selectedTemplateIsLibrary && <Alert severity="info">Library template</Alert>}
                  </Stack>
                  <Button variant="outlined" onClick={resetForm}>
                    New Template
                  </Button>
                </Box>

                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, md: 8 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Template Name"
                      value={draft.name}
                      onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                      disabled={formLocked}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Trade"
                      value={draft.trade}
                      onChange={(event) => setDraft((current) => ({ ...current, trade: event.target.value }))}
                      disabled={formLocked}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Discipline"
                      value={draft.discipline}
                      onChange={(event) => setDraft((current) => ({ ...current, discipline: event.target.value }))}
                      disabled={formLocked}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 8 }}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="closeout-template-project-id">Project</InputLabel>
                      <Select
                        labelId="closeout-template-project-id"
                        label="Project"
                        value={draft.project_id}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            project_id: event.target.value ? Number(event.target.value) : '',
                          }))
                        }
                        disabled={formLocked}
                      >
                        <MenuItem value="">Organization default</MenuItem>
                        {projects.map((project) => (
                          <MenuItem key={project.id} value={project.id}>
                            {project.code} - {project.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      multiline
                      minRows={2}
                      size="small"
                      label="Description"
                      value={draft.description}
                      onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                      disabled={formLocked}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={draft.is_default}
                          onChange={(event) => setDraft((current) => ({ ...current, is_default: event.target.checked }))}
                          disabled={formLocked}
                        />
                      }
                      label="Default template"
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={draft.is_active}
                          onChange={(event) => setDraft((current) => ({ ...current, is_active: event.target.checked }))}
                          disabled={formLocked}
                        />
                      }
                      label="Template is active"
                    />
                  </Grid>
                </Grid>

                <Typography variant="subtitle1">Checklist Items</Typography>
                <Stack spacing={1.2}>
                  {draft.items.map((item, index) => (
                    <Paper key={`closeout-item-${index}`} variant="outlined" sx={{ p: 1.2 }}>
                      <Grid container spacing={1}>
                        <Grid size={{ xs: 12, md: 5 }}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Title"
                            value={item.title}
                            onChange={(event) =>
                              updateItem(index, (current) => ({
                                ...current,
                                title: event.target.value,
                              }))
                            }
                            disabled={formLocked}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 5 }}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Description"
                            value={item.description}
                            onChange={(event) =>
                              updateItem(index, (current) => ({
                                ...current,
                                description: event.target.value,
                              }))
                            }
                            disabled={formLocked}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 1 }}>
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={item.required}
                                onChange={(event) =>
                                  updateItem(index, (current) => ({
                                    ...current,
                                    required: event.target.checked,
                                  }))
                                }
                                disabled={formLocked}
                              />
                            }
                            label="Req"
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 1 }}>
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={item.evidence_required}
                                onChange={(event) =>
                                  updateItem(index, (current) => ({
                                    ...current,
                                    evidence_required: event.target.checked,
                                  }))
                                }
                                disabled={formLocked}
                              />
                            }
                            label="Evd"
                          />
                        </Grid>
                      </Grid>
                      {!formLocked && draft.items.length > 1 && (
                        <Box mt={1}>
                          <Button
                            size="small"
                            color="error"
                            onClick={() =>
                              setDraft((current) => ({
                                ...current,
                                items: current.items.filter((_, itemIndex) => itemIndex !== index),
                              }))
                            }
                          >
                            Remove Item
                          </Button>
                        </Box>
                      )}
                    </Paper>
                  ))}
                </Stack>

                {!formLocked && (
                  <Button
                    variant="outlined"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        items: [...current.items, emptyItem()],
                      }))
                    }
                  >
                    Add Item
                  </Button>
                )}

                {canManage && (
                  <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                    <Button variant="outlined" onClick={() => void loadTemplates()}>
                      Refresh
                    </Button>
                    {selectedTemplateId && !selectedTemplateIsLibrary && (
                      <Button color="error" variant="outlined" onClick={() => void deleteTemplate()} disabled={saving}>
                        Delete
                      </Button>
                    )}
                    {selectedTemplateIsLibrary ? (
                      <Button variant="contained" onClick={() => void cloneTemplate()} disabled={saving}>
                        {saving ? 'Cloning...' : 'Clone Library Template'}
                      </Button>
                    ) : (
                      <Button
                        variant="contained"
                        onClick={() => void saveTemplate()}
                        disabled={saving || !draft.name.trim() || draft.items.some((item) => item.title.trim() === '')}
                      >
                        {saving ? 'Saving...' : selectedTemplateId ? 'Update Template' : 'Create Template'}
                      </Button>
                    )}
                  </Stack>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  )
}
