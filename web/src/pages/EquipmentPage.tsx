import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { DataGrid, type GridColDef, type GridPaginationModel } from '@mui/x-data-grid'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import type { EquipmentMaintenanceLog, EquipmentRecord, Paginated, ProjectSummary, Snag } from '../types'

const statusColor = (status: string): 'default' | 'success' | 'warning' | 'error' => {
  if (status === 'ok') return 'success'
  if (status === 'warn') return 'warning'
  if (status === 'critical') return 'error'
  return 'default'
}

interface EquipmentFormState {
  code: string
  name: string
  category: string
  barcode: string
  status: 'ok' | 'warn' | 'critical' | 'inactive'
  project_id: number | ''
  location_id: number | ''
}

interface MaintenanceFormState {
  status: 'ok' | 'warn' | 'critical'
  snag_id: number | ''
  description: string
  action_taken: string
}

export const EquipmentPage = () => {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [equipment, setEquipment] = useState<EquipmentRecord[]>([])
  const [total, setTotal] = useState(0)
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 20 })
  const [selectedProjectId, setSelectedProjectId] = useState<number | ''>('')
  const [selectedStatus, setSelectedStatus] = useState<'ok' | 'warn' | 'critical' | 'inactive' | ''>('')
  const [search, setSearch] = useState('')
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentRecord | null>(null)
  const [logs, setLogs] = useState<EquipmentMaintenanceLog[]>([])
  const [assignableSnags, setAssignableSnags] = useState<Snag[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [equipmentForm, setEquipmentForm] = useState<EquipmentFormState>({
    code: '',
    name: '',
    category: '',
    barcode: '',
    status: 'ok',
    project_id: '',
    location_id: '',
  })

  const [maintenanceForm, setMaintenanceForm] = useState<MaintenanceFormState>({
    status: 'ok',
    snag_id: '',
    description: '',
    action_taken: '',
  })

  const columns = useMemo<GridColDef<EquipmentRecord>[]>(
    () => [
      { field: 'code', headerName: 'Code', width: 140 },
      { field: 'name', headerName: 'Name', flex: 1, minWidth: 220 },
      {
        field: 'status',
        headerName: 'Status',
        width: 130,
        renderCell: (params) => <Chip label={String(params.value)} size="small" color={statusColor(String(params.value))} />,
      },
      {
        field: 'project',
        headerName: 'Project',
        width: 220,
        valueGetter: (_, row) => row.project?.code ?? '-',
      },
      {
        field: 'location',
        headerName: 'Location',
        width: 220,
        valueGetter: (_, row) => row.location?.name ?? '-',
      },
      {
        field: 'barcode',
        headerName: 'Barcode',
        width: 180,
        valueGetter: (_, row) => row.barcode ?? '-',
      },
    ],
    [],
  )

  const loadProjects = async () => {
    const response = await api.get<Paginated<ProjectSummary>>('/api/projects', { params: { per_page: 100 } })
    setProjects(response.data.data)
  }

  const loadEquipment = async () => {
    try {
      const response = await api.get<Paginated<EquipmentRecord>>('/api/equipment', {
        params: {
          per_page: paginationModel.pageSize,
          page: paginationModel.page + 1,
          project_id: selectedProjectId || undefined,
          status: selectedStatus || undefined,
          search: search.trim() || undefined,
        },
      })

      setEquipment(response.data.data)
      setTotal(response.data.total)
      setError(null)
    } catch {
      setError('Unable to load equipment inventory.')
    }
  }

  const loadLogs = async (equipmentId: number) => {
    const response = await api.get<Paginated<EquipmentMaintenanceLog>>(`/api/equipment/${equipmentId}/logs`, {
      params: { per_page: 20 },
    })
    setLogs(response.data.data)
  }

  const loadSnags = async () => {
    const response = await api.get<Paginated<Snag>>('/api/snags', {
      params: {
        per_page: 100,
        project_id: selectedProjectId || undefined,
      },
    })
    setAssignableSnags(response.data.data)
  }

  useEffect(() => {
    void Promise.all([loadProjects(), loadEquipment(), loadSnags()])
  }, [])

  useEffect(() => {
    void loadEquipment()
    void loadSnags()
  }, [paginationModel.page, paginationModel.pageSize, selectedProjectId, selectedStatus])

  const submitCreate = async () => {
    await api.post('/api/equipment', {
      ...equipmentForm,
      project_id: equipmentForm.project_id || null,
      location_id: equipmentForm.location_id || null,
      category: equipmentForm.category || null,
      barcode: equipmentForm.barcode || null,
    })

    setCreateOpen(false)
    setEquipmentForm({
      code: '',
      name: '',
      category: '',
      barcode: '',
      status: 'ok',
      project_id: '',
      location_id: '',
    })
    await loadEquipment()
  }

  const submitMaintenanceLog = async () => {
    if (!selectedEquipment) {
      return
    }

    await api.post(`/api/equipment/${selectedEquipment.id}/logs`, {
      ...maintenanceForm,
      snag_id: maintenanceForm.snag_id || null,
      description: maintenanceForm.description || null,
      action_taken: maintenanceForm.action_taken || null,
    })

    setLogOpen(false)
    setMaintenanceForm({
      status: 'ok',
      snag_id: '',
      description: '',
      action_taken: '',
    })
    await Promise.all([loadEquipment(), loadLogs(selectedEquipment.id)])
  }

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}

      <Box display="flex" justifyContent="space-between" flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h4">Equipment</Typography>
          <Typography color="text.secondary">Track equipment health, maintenance logs, and snag linkage.</Typography>
        </Box>

        <Stack direction="row" spacing={1.2}>
          <Button variant="contained" onClick={() => setCreateOpen(true)}>
            Add Equipment
          </Button>
          <Button variant="outlined" onClick={() => void loadEquipment()}>
            Refresh
          </Button>
        </Stack>
      </Box>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="equipment-project-label">Project</InputLabel>
          <Select
            labelId="equipment-project-label"
            value={selectedProjectId}
            label="Project"
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

        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel id="equipment-status-label">Status</InputLabel>
          <Select
            labelId="equipment-status-label"
            value={selectedStatus}
            label="Status"
            onChange={(event) => setSelectedStatus(event.target.value as 'ok' | 'warn' | 'critical' | 'inactive' | '')}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="ok">OK</MenuItem>
            <MenuItem value="warn">Warn</MenuItem>
            <MenuItem value="critical">Critical</MenuItem>
            <MenuItem value="inactive">Inactive</MenuItem>
          </Select>
        </FormControl>

        <TextField
          size="small"
          label="Search code/name/barcode"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              setPaginationModel((current) => ({ ...current, page: 0 }))
              void loadEquipment()
            }
          }}
          sx={{ minWidth: 280 }}
        />

        <Button
          variant="outlined"
          onClick={() => {
            setPaginationModel((current) => ({ ...current, page: 0 }))
            void loadEquipment()
          }}
        >
          Apply
        </Button>
      </Stack>

      <Box sx={{ height: 470, bgcolor: '#fff', borderRadius: 2 }}>
        <DataGrid
          rows={equipment}
          columns={columns}
          rowCount={total}
          paginationMode="server"
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={[10, 20, 50]}
          disableRowSelectionOnClick
          onRowClick={(params) => {
            setSelectedEquipment(params.row)
            void loadLogs(params.row.id)
          }}
        />
      </Box>

      {selectedEquipment && (
        <Card>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="h6">
                {selectedEquipment.code} - {selectedEquipment.name}
              </Typography>
              <Button variant="outlined" onClick={() => setLogOpen(true)}>
                Add Maintenance Log
              </Button>
            </Box>

            <Stack spacing={1}>
              {logs.length === 0 && <Typography color="text.secondary">No maintenance logs yet.</Typography>}
              {logs.map((log) => (
                <Box key={log.id} sx={{ border: '1px solid #E2E8F0', borderRadius: 2, p: 1.25 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Chip label={log.status} size="small" color={statusColor(log.status)} />
                    <Typography variant="caption">{new Date(log.occurred_at).toLocaleString()}</Typography>
                  </Box>
                  <Typography variant="body2" mt={0.8}>
                    {log.description ?? 'No description provided.'}
                  </Typography>
                  {log.action_taken && (
                    <Typography variant="body2" color="text.secondary" mt={0.4}>
                      Action: {log.action_taken}
                    </Typography>
                  )}
                  {log.snag && (
                    <Typography variant="caption" color="text.secondary">
                      Linked snag: {log.snag.reference} ({log.snag.status})
                    </Typography>
                  )}
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Equipment</DialogTitle>
        <DialogContent>
          <Stack spacing={1.4} mt={0.5}>
            <TextField
              label="Code"
              value={equipmentForm.code}
              onChange={(event) => setEquipmentForm((current) => ({ ...current, code: event.target.value }))}
            />
            <TextField
              label="Name"
              value={equipmentForm.name}
              onChange={(event) => setEquipmentForm((current) => ({ ...current, name: event.target.value }))}
            />
            <TextField
              label="Category"
              value={equipmentForm.category}
              onChange={(event) => setEquipmentForm((current) => ({ ...current, category: event.target.value }))}
            />
            <TextField
              label="Barcode"
              value={equipmentForm.barcode}
              onChange={(event) => setEquipmentForm((current) => ({ ...current, barcode: event.target.value }))}
            />
            <FormControl>
              <InputLabel id="equipment-form-status-label">Status</InputLabel>
              <Select
                labelId="equipment-form-status-label"
                label="Status"
                value={equipmentForm.status}
                onChange={(event) =>
                  setEquipmentForm((current) => ({ ...current, status: event.target.value as EquipmentFormState['status'] }))
                }
              >
                <MenuItem value="ok">OK</MenuItem>
                <MenuItem value="warn">Warn</MenuItem>
                <MenuItem value="critical">Critical</MenuItem>
                <MenuItem value="inactive">Inactive</MenuItem>
              </Select>
            </FormControl>
            <FormControl>
              <InputLabel id="equipment-form-project-label">Project</InputLabel>
              <Select
                labelId="equipment-form-project-label"
                label="Project"
                value={equipmentForm.project_id}
                onChange={(event) =>
                  setEquipmentForm((current) => ({ ...current, project_id: event.target.value ? Number(event.target.value) : '' }))
                }
              >
                <MenuItem value="">Unassigned</MenuItem>
                {projects.map((project) => (
                  <MenuItem key={project.id} value={project.id}>
                    {project.code} - {project.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              type="number"
              label="Location Id (optional)"
              value={equipmentForm.location_id}
              onChange={(event) =>
                setEquipmentForm((current) => ({
                  ...current,
                  location_id: event.target.value ? Number(event.target.value) : '',
                }))
              }
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void submitCreate()}
            disabled={!equipmentForm.code.trim() || !equipmentForm.name.trim()}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={logOpen} onClose={() => setLogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Maintenance Log</DialogTitle>
        <DialogContent>
          <Stack spacing={1.4} mt={0.5}>
            <FormControl>
              <InputLabel id="maintenance-status-label">Status</InputLabel>
              <Select
                labelId="maintenance-status-label"
                label="Status"
                value={maintenanceForm.status}
                onChange={(event) =>
                  setMaintenanceForm((current) => ({
                    ...current,
                    status: event.target.value as MaintenanceFormState['status'],
                  }))
                }
              >
                <MenuItem value="ok">OK</MenuItem>
                <MenuItem value="warn">Warn</MenuItem>
                <MenuItem value="critical">Critical</MenuItem>
              </Select>
            </FormControl>
            <FormControl>
              <InputLabel id="maintenance-snag-label">Link Snag (optional)</InputLabel>
              <Select
                labelId="maintenance-snag-label"
                label="Link Snag (optional)"
                value={maintenanceForm.snag_id}
                onChange={(event) =>
                  setMaintenanceForm((current) => ({
                    ...current,
                    snag_id: event.target.value ? Number(event.target.value) : '',
                  }))
                }
              >
                <MenuItem value="">No linked snag</MenuItem>
                {assignableSnags.slice(0, 120).map((snag) => (
                  <MenuItem key={snag.id} value={snag.id}>
                    {snag.reference} - {snag.title}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Description"
              multiline
              minRows={2}
              value={maintenanceForm.description}
              onChange={(event) => setMaintenanceForm((current) => ({ ...current, description: event.target.value }))}
            />
            <TextField
              label="Action Taken"
              multiline
              minRows={2}
              value={maintenanceForm.action_taken}
              onChange={(event) => setMaintenanceForm((current) => ({ ...current, action_taken: event.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void submitMaintenanceLog()}>
            Save Log
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
