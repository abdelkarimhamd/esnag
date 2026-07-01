import { Alert, Box, Button, Chip, FormControl, Grid, InputLabel, MenuItem, Paper, Select, Stack, Typography, } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { PageHero } from '../components/ui/PageHero';
import { StatCard } from '../components/ui/StatCard';
import { useAuth } from '../hooks/useAuth';
import { subscribeOrganizationChannel } from '../realtime/echo';
export const InspectionReportsPage = () => {
    const { activeOrganization, permissions } = useAuth();
    const activeOrganizationId = activeOrganization?.id ?? null;
    const canExport = permissions.includes('inspections.reports.export');
    const [projects, setProjects] = useState([]);
    const [report, setReport] = useState(null);
    const [exportJobs, setExportJobs] = useState([]);
    const [projectFilter, setProjectFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [exportType, setExportType] = useState('pdf');
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState(null);
    const loadProjects = useCallback(async () => {
        const response = await api.get('/api/projects', { params: { per_page: 100 } });
        setProjects(response.data.data);
    }, []);
    const loadReport = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.get('/api/inspections/reports', {
                params: {
                    project_id: projectFilter || undefined,
                    type: typeFilter || undefined,
                },
            });
            setReport(response.data.data);
        }
        catch {
            setError('Unable to load inspection reports.');
        }
        finally {
            setLoading(false);
        }
    }, [projectFilter, typeFilter]);
    const loadExports = useCallback(async () => {
        const response = await api.get('/api/exports', {
            params: {
                per_page: 100,
                project_id: projectFilter || undefined,
            },
        });
        const inspectionExports = response.data.data.filter((job) => job.filters?.module === 'inspections');
        setExportJobs(inspectionExports);
    }, [projectFilter]);
    useEffect(() => {
        void loadProjects();
    }, [loadProjects]);
    useEffect(() => {
        void Promise.all([loadReport(), loadExports()]);
    }, [loadExports, loadReport]);
    useEffect(() => {
        if (!activeOrganizationId) {
            return;
        }
        const unsubscribe = subscribeOrganizationChannel(activeOrganizationId, {
            onInspection: () => {
                void loadReport();
            },
            onExport: () => {
                void loadExports();
            },
        });
        return () => {
            unsubscribe();
        };
    }, [activeOrganizationId, loadExports, loadReport]);
    const requestExport = async () => {
        if (!canExport) {
            return;
        }
        setExporting(true);
        setError(null);
        try {
            await api.post('/api/inspections/reports/export', {
                type: exportType,
                project_id: projectFilter || undefined,
                filters: {
                    type: typeFilter || undefined,
                },
            });
            await loadExports();
        }
        catch {
            setError('Unable to request inspection export.');
        }
        finally {
            setExporting(false);
        }
    };
    const submissionColumns = useMemo(() => [
        { field: 'reference', headerName: 'Reference', width: 140 },
        {
            field: 'template',
            headerName: 'Template',
            minWidth: 220,
            flex: 1,
            valueGetter: (_, row) => row.template?.name ?? '-',
        },
        { field: 'status', headerName: 'Status', width: 130 },
        {
            field: 'creator',
            headerName: 'Created By',
            minWidth: 150,
            valueGetter: (_, row) => row.creator?.name ?? '-',
        },
        {
            field: 'created_at',
            headerName: 'Created',
            width: 180,
            valueFormatter: (value) => new Date(value).toLocaleString(),
        },
    ], []);
    return (<Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}

      <PageHero title="Inspection Reports" description="KPI summary, submissions performance, request health, and queued inspection exports."/>

      <Paper sx={{ p: 2 }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid size={{ xs: 12, md: 4 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="reports-project-filter">Project</InputLabel>
              <Select labelId="reports-project-filter" label="Project" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value ? Number(event.target.value) : '')}>
                <MenuItem value="">All projects</MenuItem>
                {projects.map((project) => (<MenuItem key={project.id} value={project.id}>
                    {project.code} - {project.name}
                  </MenuItem>))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="reports-type-filter">Type</InputLabel>
              <Select labelId="reports-type-filter" label="Type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <MenuItem value="">All types</MenuItem>
                <MenuItem value="ncr">NCR</MenuItem>
                <MenuItem value="rfi">RFI</MenuItem>
                <MenuItem value="safety">Safety</MenuItem>
                <MenuItem value="permit">Permit</MenuItem>
                <MenuItem value="commissioning">Commissioning</MenuItem>
                <MenuItem value="checklist">Checklist</MenuItem>
                <MenuItem value="handover">Handover</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Stack direction="row" spacing={1} justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
              <Button variant="outlined" onClick={() => void loadReport()}>
                Refresh
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {report && (<Grid container spacing={1.5}>
          <Grid size={{ xs: 12, md: 2.4 }}>
            <StatCard label="Total" value={report.summary.total_submissions} tone="primary"/>
          </Grid>
          <Grid size={{ xs: 12, md: 2.4 }}>
            <StatCard label="Approved" value={report.summary.approved_submissions} tone="success"/>
          </Grid>
          <Grid size={{ xs: 12, md: 2.4 }}>
            <StatCard label="In Review" value={report.summary.in_review_submissions} tone="secondary"/>
          </Grid>
          <Grid size={{ xs: 12, md: 2.4 }}>
            <StatCard label="Rejected" value={report.summary.rejected_submissions} tone="warning"/>
          </Grid>
          <Grid size={{ xs: 12, md: 2.4 }}>
            <StatCard label="Open Requests" value={report.summary.open_requests} tone="neutral"/>
          </Grid>
        </Grid>)}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Submission Status
            </Typography>
            <Stack spacing={1}>
              {Object.entries(report?.status_breakdown ?? {}).map(([status, total]) => (<Box key={status} display="flex" justifyContent="space-between">
                  <Typography variant="body2">{status}</Typography>
                  <Chip size="small" label={total}/>
                </Box>))}
            </Stack>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Type Breakdown
            </Typography>
            <Stack spacing={1}>
              {Object.entries(report?.type_breakdown ?? {}).map(([type, total]) => (<Box key={type} display="flex" justifyContent="space-between">
                  <Typography variant="body2">{type}</Typography>
                  <Chip size="small" label={total}/>
                </Box>))}
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ p: 2 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5} mb={1}>
          <Typography variant="h6">Inspection Export</Typography>
          <Stack direction="row" spacing={1}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel id="inspection-export-type">Type</InputLabel>
              <Select labelId="inspection-export-type" label="Type" value={exportType} onChange={(event) => setExportType(event.target.value)}>
                <MenuItem value="pdf">PDF</MenuItem>
                <MenuItem value="csv">CSV</MenuItem>
                <MenuItem value="xlsx">XLSX</MenuItem>
              </Select>
            </FormControl>
            <Button variant="contained" disabled={!canExport || exporting} onClick={() => void requestExport()}>
              {exporting ? 'Queueing...' : 'Request Export'}
            </Button>
          </Stack>
        </Box>

        <Stack spacing={1}>
          {exportJobs.slice(0, 8).map((job) => (<Box key={job.id} display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="body2">
                #{job.id} · {job.type.toUpperCase()} · {job.status}
              </Typography>
              {job.status === 'completed' && (<Button size="small" variant="outlined" onClick={() => window.open(`/api/exports/${job.id}/download`, '_blank')}>
                  Download
                </Button>)}
            </Box>))}
        </Stack>
      </Paper>

      <Paper sx={{ p: 1.5 }}>
        <DataGrid autoHeight rows={report?.submissions?.data ?? []} columns={submissionColumns} loading={loading} disableRowSelectionOnClick pageSizeOptions={[10, 20, 50]} sx={{ border: 0 }}/>
      </Paper>
    </Stack>);
};
