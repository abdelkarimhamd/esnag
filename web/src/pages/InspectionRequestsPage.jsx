import { Alert, Button, Chip, FormControl, Grid, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography, } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { PageHero } from '../components/ui/PageHero';
import { StatCard } from '../components/ui/StatCard';
import { useAuth } from '../hooks/useAuth';
import { useFeatureTour } from '../hooks/useFeatureTour';
import { subscribeOrganizationChannel } from '../realtime/echo';
const statusColor = (status) => {
    if (status === 'completed') {
        return 'success';
    }
    if (status === 'rejected' || status === 'cancelled') {
        return 'error';
    }
    if (status === 'in_progress') {
        return 'info';
    }
    if (status === 'scheduled') {
        return 'warning';
    }
    return 'default';
};
const nextStatus = (status) => {
    if (status === 'requested') {
        return 'scheduled';
    }
    if (status === 'scheduled') {
        return 'in_progress';
    }
    if (status === 'in_progress') {
        return 'completed';
    }
    return null;
};
export const InspectionRequestsPage = () => {
    const { activeOrganization, permissions } = useAuth();
    const activeOrganizationId = activeOrganization?.id ?? null;
    const canManage = permissions.includes('inspections.requests.manage');
    const [projects, setProjects] = useState([]);
    const [members, setMembers] = useState([]);
    const [submissions, setSubmissions] = useState([]);
    const [requests, setRequests] = useState([]);
    const [projectFilter, setProjectFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [createProjectId, setCreateProjectId] = useState('');
    const [createSubmissionId, setCreateSubmissionId] = useState('');
    const [createType, setCreateType] = useState('mir');
    const [createTitle, setCreateTitle] = useState('');
    const [createDescription, setCreateDescription] = useState('');
    const [createAssignee, setCreateAssignee] = useState('');
    const [createSchedule, setCreateSchedule] = useState('');
    const requestTourSteps = useMemo(() => [
        {
            id: 'requests_create',
            title: 'Create MIR/WIR/IR',
            text: 'Create and assign inspection requests linked to submissions.',
            attachTo: { element: '#inspection-requests-create', on: 'bottom' },
        },
        {
            id: 'requests_grid',
            title: 'Track Status',
            text: 'Monitor scheduled and in-progress requests, then close when completed.',
            attachTo: { element: '#inspection-requests-grid', on: 'top' },
        },
    ], []);
    useFeatureTour({
        tourKey: 'requests',
        enabled: true,
        steps: requestTourSteps,
    });
    const loadProjects = useCallback(async () => {
        const response = await api.get('/api/projects', { params: { per_page: 100 } });
        setProjects(response.data.data);
    }, []);
    const loadMembers = useCallback(async () => {
        const response = await api.get('/api/organizations/members');
        setMembers(response.data.data);
    }, []);
    const loadSubmissions = useCallback(async () => {
        const response = await api.get('/api/inspections/submissions', {
            params: {
                per_page: 100,
                project_id: createProjectId || projectFilter || undefined,
            },
        });
        setSubmissions(response.data.data);
    }, [createProjectId, projectFilter]);
    const loadRequests = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.get('/api/inspections/requests', {
                params: {
                    per_page: 100,
                    project_id: projectFilter || undefined,
                    status: statusFilter || undefined,
                    request_type: typeFilter || undefined,
                },
            });
            setRequests(response.data.data);
        }
        catch {
            setError('Unable to load inspection requests.');
        }
        finally {
            setLoading(false);
        }
    }, [projectFilter, statusFilter, typeFilter]);
    useEffect(() => {
        void Promise.all([loadProjects(), loadMembers()]);
    }, [loadMembers, loadProjects]);
    useEffect(() => {
        void loadRequests();
        void loadSubmissions();
    }, [loadRequests, loadSubmissions]);
    useEffect(() => {
        if (!activeOrganizationId) {
            return;
        }
        const unsubscribe = subscribeOrganizationChannel(activeOrganizationId, {
            onInspection: () => {
                void loadRequests();
            },
        });
        return () => {
            unsubscribe();
        };
    }, [activeOrganizationId, loadRequests]);
    const createRequest = async () => {
        if (!canManage || !createTitle.trim()) {
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await api.post('/api/inspections/requests', {
                project_id: createProjectId || undefined,
                inspection_submission_id: createSubmissionId || undefined,
                request_type: createType,
                title: createTitle.trim(),
                description: createDescription || undefined,
                assigned_to: createAssignee || undefined,
                scheduled_for: createSchedule || undefined,
            });
            setCreateTitle('');
            setCreateDescription('');
            setCreateSubmissionId('');
            setCreateAssignee('');
            setCreateSchedule('');
            await loadRequests();
        }
        catch {
            setError('Unable to create inspection request.');
        }
        finally {
            setSubmitting(false);
        }
    };
    const progressRequest = useCallback(async (request) => {
        const next = nextStatus(request.status);
        if (!next || !canManage) {
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await api.put(`/api/inspections/requests/${request.id}`, {
                status: next,
            });
            await loadRequests();
        }
        catch {
            setError('Unable to update request status.');
        }
        finally {
            setSubmitting(false);
        }
    }, [canManage, loadRequests]);
    const columns = useMemo(() => [
        { field: 'reference', headerName: 'Reference', width: 130 },
        {
            field: 'request_type',
            headerName: 'Type',
            width: 100,
            valueFormatter: (value) => String(value).toUpperCase(),
        },
        { field: 'title', headerName: 'Title', minWidth: 220, flex: 1 },
        {
            field: 'status',
            headerName: 'Status',
            width: 140,
            renderCell: (params) => <Chip size="small" color={statusColor(params.row.status)} label={params.row.status}/>,
        },
        {
            field: 'submission',
            headerName: 'Submission',
            minWidth: 140,
            valueGetter: (_, row) => row.submission?.reference ?? '-',
        },
        {
            field: 'assignee',
            headerName: 'Assignee',
            minWidth: 140,
            valueGetter: (_, row) => row.assignee?.name ?? 'Unassigned',
        },
        {
            field: 'scheduled_for',
            headerName: 'Scheduled',
            width: 180,
            valueFormatter: (value) => (value ? new Date(value).toLocaleString() : '-'),
        },
        {
            field: 'actions',
            headerName: 'Actions',
            width: 170,
            sortable: false,
            filterable: false,
            renderCell: (params) => {
                const next = nextStatus(params.row.status);
                if (!next) {
                    return null;
                }
                return (<Button size="small" variant="outlined" onClick={() => void progressRequest(params.row)} disabled={!canManage || submitting}>
              Mark {next}
            </Button>);
            },
        },
    ], [canManage, progressRequest, submitting]);
    const metrics = useMemo(() => ({
        total: requests.length,
        scheduled: requests.filter((item) => item.status === 'scheduled').length,
        inProgress: requests.filter((item) => item.status === 'in_progress').length,
        completed: requests.filter((item) => item.status === 'completed').length,
    }), [requests]);
    return (<Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}

      <PageHero title="MIR / WIR / IR Requests" description="Create, assign, schedule, and close inspection requests from one workflow board."/>

      <Grid container spacing={1.2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard label="Total Requests" value={metrics.total} tone="primary"/>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard label="Scheduled" value={metrics.scheduled} tone="secondary"/>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard label="In Progress" value={metrics.inProgress} tone="warning"/>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard label="Completed" value={metrics.completed} tone="success"/>
        </Grid>
      </Grid>

      <Paper sx={{ p: 2 }} id="inspection-requests-create">
        <Stack spacing={1.5}>
          <Typography variant="subtitle1">Create Request</Typography>
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, md: 2 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="create-request-type">Type</InputLabel>
                <Select labelId="create-request-type" label="Type" value={createType} onChange={(event) => setCreateType(event.target.value)}>
                  <MenuItem value="mir">MIR</MenuItem>
                  <MenuItem value="wir">WIR</MenuItem>
                  <MenuItem value="ir">IR</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth size="small" label="Title" value={createTitle} onChange={(event) => setCreateTitle(event.target.value)}/>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="create-request-project">Project</InputLabel>
                <Select labelId="create-request-project" label="Project" value={createProjectId} onChange={(event) => setCreateProjectId(event.target.value ? Number(event.target.value) : '')}>
                  <MenuItem value="">Optional</MenuItem>
                  {projects.map((project) => (<MenuItem key={project.id} value={project.id}>
                      {project.code} - {project.name}
                    </MenuItem>))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="create-request-submission">Submission</InputLabel>
                <Select labelId="create-request-submission" label="Submission" value={createSubmissionId} onChange={(event) => setCreateSubmissionId(event.target.value ? Number(event.target.value) : '')}>
                  <MenuItem value="">Optional</MenuItem>
                  {submissions.map((submission) => (<MenuItem key={submission.id} value={submission.id}>
                      {submission.reference} | {submission.status}
                    </MenuItem>))}
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth size="small" label="Description" value={createDescription} onChange={(event) => setCreateDescription(event.target.value)}/>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="create-request-assignee">Assign To</InputLabel>
                <Select labelId="create-request-assignee" label="Assign To" value={createAssignee} onChange={(event) => setCreateAssignee(event.target.value ? Number(event.target.value) : '')}>
                  <MenuItem value="">Unassigned</MenuItem>
                  {members.map((member) => (<MenuItem key={member.id} value={member.id}>
                      {member.name}
                    </MenuItem>))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField fullWidth size="small" type="datetime-local" label="Schedule" InputLabelProps={{ shrink: true }} value={createSchedule} onChange={(event) => setCreateSchedule(event.target.value)}/>
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <Button fullWidth variant="contained" disabled={!canManage || !createTitle.trim() || submitting} onClick={() => void createRequest()}>
                {submitting ? 'Saving...' : 'Create'}
              </Button>
            </Grid>
          </Grid>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Grid container spacing={1.5}>
          <Grid size={{ xs: 12, md: 4 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="requests-filter-project">Project</InputLabel>
              <Select labelId="requests-filter-project" label="Project" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value ? Number(event.target.value) : '')}>
                <MenuItem value="">All projects</MenuItem>
                {projects.map((project) => (<MenuItem key={project.id} value={project.id}>
                    {project.code} - {project.name}
                  </MenuItem>))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="requests-filter-status">Status</InputLabel>
              <Select labelId="requests-filter-status" label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <MenuItem value="">All statuses</MenuItem>
                <MenuItem value="requested">requested</MenuItem>
                <MenuItem value="scheduled">scheduled</MenuItem>
                <MenuItem value="in_progress">in_progress</MenuItem>
                <MenuItem value="completed">completed</MenuItem>
                <MenuItem value="rejected">rejected</MenuItem>
                <MenuItem value="cancelled">cancelled</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="requests-filter-type">Type</InputLabel>
              <Select labelId="requests-filter-type" label="Type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <MenuItem value="">All types</MenuItem>
                <MenuItem value="mir">MIR</MenuItem>
                <MenuItem value="wir">WIR</MenuItem>
                <MenuItem value="ir">IR</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 1.5 }} id="inspection-requests-grid">
        <DataGrid autoHeight rows={requests} columns={columns} loading={loading} disableRowSelectionOnClick pageSizeOptions={[10, 20, 50]} sx={{ border: 0 }}/>
      </Paper>
    </Stack>);
};
