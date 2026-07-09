import { Alert, Box, Button, Chip, FormControl, Grid, InputLabel, MenuItem, Paper, Select, Stack, TextField, Tooltip, Typography, } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { DataGrid } from '@mui/x-data-grid';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { PageHero } from '../components/ui/PageHero';
import { StatCard } from '../components/ui/StatCard';
import { useAuth } from '../hooks/useAuth';
import { formatStatusLabel, snagStatusChipColor } from '../utils/ui';
import { normalizeApiError } from '../utils/apiError';
import { severityStyle } from '../theme';

// G3 faceted / saved search (item 13, BR-FR-035/036; UAT-12). Filters the snag
// register by Area / Building / Category / Severity / Status / Type / Company and
// exports the result set — every facet maps straight to SnagController::index
// params (no backend change). Saved views are per-device presets (localStorage);
// the org-wide SavedSearch entity is a later backend addition.
const SEVERITIES = ['major', 'high', 'medium', 'low'];
const STATUSES = ['new', 'assigned', 'in_progress', 'ready_for_review', 'closed', 'rejected'];
const SNAG_TYPES = [
    { value: 'construction', label: 'Construction' },
    { value: 'operational', label: 'Operational' },
];
const EMPTY_FILTERS = {
    search: '',
    project_id: '',
    area_id: '',
    building_id: '',
    category_id: '',
    severity: '',
    status: '',
    snag_type: '',
    assigned_company_id: '',
};
const savedViewsKey = (organizationId, userId) => `esnag.savedSearches.${organizationId ?? 'x'}.${userId ?? 'x'}`;
const readSavedViews = (key) => {
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : [];
    }
    catch {
        return [];
    }
};

export const AdvancedSearchPage = () => {
    const navigate = useNavigate();
    const { activeOrganization, permissions, user } = useAuth();
    const activeOrganizationId = activeOrganization?.id ?? null;
    const canExport = permissions.includes('exports.request');

    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [projects, setProjects] = useState([]);
    const [buildings, setBuildings] = useState([]);
    const [areas, setAreas] = useState([]);
    const [categories, setCategories] = useState([]);
    const [companies, setCompanies] = useState([]);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);
    const [exportType, setExportType] = useState('csv');

    const storageKey = useMemo(() => savedViewsKey(activeOrganizationId, user?.id), [activeOrganizationId, user?.id]);
    const [savedViews, setSavedViews] = useState([]);
    useEffect(() => {
        setSavedViews(readSavedViews(storageKey));
    }, [storageKey]);

    const setFilter = useCallback((key, value) => {
        setFilters((current) => {
            const next = { ...current, [key]: value };
            // Changing the project invalidates project-scoped facets.
            if (key === 'project_id') {
                next.area_id = '';
                next.building_id = '';
                next.assigned_company_id = '';
            }
            return next;
        });
    }, []);

    // Org-wide snag categories.
    useEffect(() => {
        if (!activeOrganizationId) {
            return;
        }
        void api.get('/api/snag-categories')
            .then((response) => setCategories(response.data.data ?? []))
            .catch(() => setCategories([]));
        void api.get('/api/projects')
            .then((response) => setProjects(response.data.data ?? []))
            .catch(() => setProjects([]));
    }, [activeOrganizationId]);

    // Project-scoped facet options: areas, buildings, companies.
    useEffect(() => {
        if (!filters.project_id) {
            setAreas([]);
            setBuildings([]);
            setCompanies([]);
            return;
        }
        const params = { project_id: filters.project_id };
        void api.get('/api/areas', { params }).then((r) => setAreas(r.data.data ?? [])).catch(() => setAreas([]));
        void api.get('/api/buildings', { params }).then((r) => setBuildings(r.data.data ?? [])).catch(() => setBuildings([]));
        void api.get('/api/stakeholders/companies', { params }).then((r) => setCompanies(r.data.data ?? [])).catch(() => setCompanies([]));
    }, [filters.project_id]);

    const buildingName = useCallback((id) => buildings.find((building) => building.id === id)?.name ?? '—', [buildings]);

    const runSearch = useCallback(async () => {
        setLoading(true);
        setError(null);
        setMessage(null);
        try {
            const params = { per_page: 200 };
            for (const [key, value] of Object.entries(filters)) {
                if (value !== '' && value !== null && value !== undefined) {
                    params[key] = value;
                }
            }
            const response = await api.get('/api/snags', { params });
            setRows(response.data.data ?? []);
        }
        catch (requestError) {
            setError(normalizeApiError(requestError, 'Unable to run the search.'));
            setRows([]);
        }
        finally {
            setLoading(false);
        }
    }, [filters]);

    // Run once on mount and whenever the filter set changes.
    useEffect(() => {
        void runSearch();
    }, [runSearch]);

    const activeFilterCount = useMemo(() => Object.entries(filters).filter(([, value]) => value !== '').length, [filters]);

    const saveCurrentView = useCallback(() => {
        const name = window.prompt('Name this view');
        if (!name || !name.trim()) {
            return;
        }
        const next = [
            ...savedViews.filter((view) => view.name !== name.trim()),
            { name: name.trim(), filters },
        ];
        setSavedViews(next);
        window.localStorage.setItem(storageKey, JSON.stringify(next));
        setMessage(`Saved view "${name.trim()}".`);
    }, [filters, savedViews, storageKey]);

    const deleteView = useCallback((name) => {
        const next = savedViews.filter((view) => view.name !== name);
        setSavedViews(next);
        window.localStorage.setItem(storageKey, JSON.stringify(next));
    }, [savedViews, storageKey]);

    const exportResults = useCallback(async () => {
        if (rows.length === 0) {
            return;
        }
        setError(null);
        setMessage(null);
        try {
            await api.post('/api/snags/bulk-export', {
                type: exportType,
                snag_ids: rows.map((row) => row.id),
            });
            setMessage(`${exportType.toUpperCase()} export requested for ${rows.length} snags — track it in Reports.`);
        }
        catch (requestError) {
            setError(normalizeApiError(requestError, 'Unable to queue the export.'));
        }
    }, [exportType, rows]);

    const columns = useMemo(() => [
        { field: 'reference', headerName: 'Ref', width: 118 },
        { field: 'title', headerName: 'Title', flex: 1, minWidth: 200 },
        {
            field: 'area',
            headerName: 'Area',
            width: 130,
            valueGetter: (_, row) => row.area?.name ?? '—',
        },
        {
            field: 'building_id',
            headerName: 'Building',
            width: 150,
            valueGetter: (_, row) => buildingName(row.building_id),
        },
        {
            field: 'category',
            headerName: 'Category',
            width: 140,
            valueGetter: (_, row) => row.category?.name ?? '—',
        },
        {
            field: 'severity',
            headerName: 'Severity',
            width: 120,
            renderCell: (params) => {
                const style = severityStyle(params.row.severity);
                return <Chip size="small" label={style.label} sx={{ background: style.tint, color: style.text, fontWeight: 700 }}/>;
            },
        },
        {
            field: 'status',
            headerName: 'Status',
            width: 150,
            renderCell: (params) => <Chip size="small" color={snagStatusChipColor(params.row.status)} label={formatStatusLabel(params.row.status)}/>,
        },
        {
            field: 'snag_type',
            headerName: 'Type',
            width: 120,
            valueGetter: (_, row) => (row.snag_type === 'operational' ? 'Operational' : 'Construction'),
        },
        {
            field: 'company',
            headerName: 'Company',
            width: 160,
            valueGetter: (_, row) => row.assigned_company?.name ?? row.source_organization?.name ?? '—',
        },
    ], [buildingName]);

    const severityTotals = useMemo(() => {
        const counts = { major: 0, high: 0, medium: 0, low: 0 };
        for (const row of rows) {
            if (counts[row.severity] !== undefined) {
                counts[row.severity] += 1;
            }
        }
        return counts;
    }, [rows]);

    return (<Stack spacing={2}>
      {error && (<Alert severity="error" onClose={() => setError(null)}>{error.message}</Alert>)}
      {message && <Alert severity="success" onClose={() => setMessage(null)}>{message}</Alert>}

      <PageHero title="Advanced Search" description="Filter the snag register across every axis — area, building, category, severity, status, type and company — then save the view or export the results." badges={<Chip size="small" variant="outlined" label={`${rows.length} results · ${activeFilterCount} filters`}/>}/>

      <Paper sx={{ p: 2 }}>
        <Grid container spacing={1.5}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField fullWidth size="small" label="Search text (title, reference, description)" value={filters.search} onChange={(event) => setFilter('search', event.target.value)}/>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="as-project">Project</InputLabel>
              <Select labelId="as-project" label="Project" value={filters.project_id} onChange={(event) => setFilter('project_id', event.target.value)}>
                <MenuItem value="">All projects</MenuItem>
                {projects.map((project) => (<MenuItem key={project.id} value={project.id}>{project.code ? `${project.code} — ${project.name}` : project.name}</MenuItem>))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size="small" disabled={areas.length === 0}>
              <InputLabel id="as-area">Area</InputLabel>
              <Select labelId="as-area" label="Area" value={filters.area_id} onChange={(event) => setFilter('area_id', event.target.value)}>
                <MenuItem value="">All areas</MenuItem>
                {areas.map((area) => (<MenuItem key={area.id} value={area.id}>{area.name}</MenuItem>))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size="small" disabled={buildings.length === 0}>
              <InputLabel id="as-building">Building</InputLabel>
              <Select labelId="as-building" label="Building" value={filters.building_id} onChange={(event) => setFilter('building_id', event.target.value)}>
                <MenuItem value="">All buildings</MenuItem>
                {buildings.map((building) => (<MenuItem key={building.id} value={building.id}>{building.name}</MenuItem>))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="as-category">Category</InputLabel>
              <Select labelId="as-category" label="Category" value={filters.category_id} onChange={(event) => setFilter('category_id', event.target.value)}>
                <MenuItem value="">All categories</MenuItem>
                {categories.map((category) => (<MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="as-severity">Severity</InputLabel>
              <Select labelId="as-severity" label="Severity" value={filters.severity} onChange={(event) => setFilter('severity', event.target.value)}>
                <MenuItem value="">All severities</MenuItem>
                {SEVERITIES.map((severity) => (<MenuItem key={severity} value={severity}>{severityStyle(severity).label}</MenuItem>))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="as-status">Status</InputLabel>
              <Select labelId="as-status" label="Status" value={filters.status} onChange={(event) => setFilter('status', event.target.value)}>
                <MenuItem value="">All statuses</MenuItem>
                {STATUSES.map((status) => (<MenuItem key={status} value={status}>{formatStatusLabel(status)}</MenuItem>))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="as-type">Type</InputLabel>
              <Select labelId="as-type" label="Type" value={filters.snag_type} onChange={(event) => setFilter('snag_type', event.target.value)}>
                <MenuItem value="">All types</MenuItem>
                {SNAG_TYPES.map((type) => (<MenuItem key={type.value} value={type.value}>{type.label}</MenuItem>))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size="small" disabled={companies.length === 0}>
              <InputLabel id="as-company">Company</InputLabel>
              <Select labelId="as-company" label="Company" value={filters.assigned_company_id} onChange={(event) => setFilter('assigned_company_id', event.target.value)}>
                <MenuItem value="">All companies</MenuItem>
                {companies.map((company) => (<MenuItem key={company.id} value={company.id}>{company.name}</MenuItem>))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12 }}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
              <Button variant="outlined" size="small" onClick={() => setFilters(EMPTY_FILTERS)} disabled={activeFilterCount === 0}>Clear filters</Button>
              <Button variant="outlined" size="small" onClick={saveCurrentView} disabled={activeFilterCount === 0}>Save view</Button>
              <Box sx={{ flex: 1 }}/>
              <FormControl size="small" sx={{ minWidth: 110 }}>
                <InputLabel id="as-export">Export</InputLabel>
                <Select labelId="as-export" label="Export" value={exportType} onChange={(event) => setExportType(event.target.value)}>
                  <MenuItem value="csv">CSV</MenuItem>
                  <MenuItem value="xlsx">XLSX</MenuItem>
                  <MenuItem value="pdf">PDF</MenuItem>
                </Select>
              </FormControl>
              <Tooltip title={canExport ? '' : 'You need export permission.'}>
                <span>
                  <Button variant="contained" size="small" onClick={() => void exportResults()} disabled={!canExport || rows.length === 0}>Export results</Button>
                </span>
              </Tooltip>
            </Stack>
          </Grid>

          {savedViews.length > 0 && (<Grid size={{ xs: 12 }}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                <Typography variant="caption" color="text.secondary" fontWeight={700}>SAVED VIEWS</Typography>
                {savedViews.map((view) => (<Chip key={view.name} label={view.name} onClick={() => setFilters({ ...EMPTY_FILTERS, ...view.filters })} onDelete={() => deleteView(view.name)} deleteIcon={<CloseRoundedIcon />} size="small" variant="outlined"/>))}
              </Stack>
            </Grid>)}
        </Grid>
      </Paper>

      <Grid container spacing={1.2}>
        <Grid size={{ xs: 6, sm: 4, md: 12 / 5 }}><StatCard label="Results" value={rows.length} tone="primary"/></Grid>
        <Grid size={{ xs: 6, sm: 4, md: 12 / 5 }}><StatCard label="Major" value={severityTotals.major} tone="warning"/></Grid>
        <Grid size={{ xs: 6, sm: 4, md: 12 / 5 }}><StatCard label="High" value={severityTotals.high} tone="neutral"/></Grid>
        <Grid size={{ xs: 6, sm: 4, md: 12 / 5 }}><StatCard label="Medium" value={severityTotals.medium} tone="neutral"/></Grid>
        <Grid size={{ xs: 6, sm: 4, md: 12 / 5 }}><StatCard label="Low" value={severityTotals.low} tone="success"/></Grid>
      </Grid>

      <Paper sx={{ p: 1 }}>
        <DataGrid autoHeight rows={rows} columns={columns} loading={loading} disableRowSelectionOnClick pageSizeOptions={[10, 25, 50, 100]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }} onRowClick={(params) => { if (params.row.project_id && params.row.drawing_id) { navigate(`/projects/${params.row.project_id}/drawings/${params.row.drawing_id}`); } }} sx={{ border: 0 }}/>
      </Paper>
    </Stack>);
};
