import { Alert, Box, Button, Chip, Divider, FormControl, Grid, InputLabel, MenuItem, Paper, Popover, Select, Stack, ToggleButton, ToggleButtonGroup, Typography, } from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { PageHero } from '../components/ui/PageHero';
import { StatCard } from '../components/ui/StatCard';
import { useAuth } from '../hooks/useAuth';
import { formatStatusLabel } from '../utils/ui';
import { normalizeApiError } from '../utils/apiError';
import { BRAND, FONT_MONO, SEVERITY, severityStyle } from '../theme';

// D4 — Area → Building → Level spatial overlay (UIspec_web D4, BR-FR-028).
// Aggregates every pinned snag for a building/area across all of its drawings
// via /api/drawings/aggregate and renders one plan panel per level with
// severity-coded pins. Read-only companion to the per-drawing DrawingViewer;
// clicking a pin deep-links into that drawing for editing.

const STATUS_PIN = {
    closed: '#6E8C3A',
    rejected: '#B23B3B',
    ready_for_review: '#C08A23',
    in_progress: '#2F8FBE',
    assigned: '#24488F',
    new: '#6B7A93',
};
const statusPinColor = (status) => STATUS_PIN[status] ?? '#6B7A93';
const STATUS_LEGEND = [
    { key: 'new', label: 'New' },
    { key: 'assigned', label: 'Assigned' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'ready_for_review', label: 'Review' },
    { key: 'closed', label: 'Closed' },
    { key: 'rejected', label: 'Rejected' },
];
const SEVERITY_ORDER = ['major', 'high', 'medium', 'low'];
const pinColorFor = (snag, mode) => mode === 'severity' ? severityStyle(snag.severity).dot : statusPinColor(snag.status);
const isImageMime = (mime) => Boolean(mime && mime.startsWith('image/'));

export const DrawingOverlayPage = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { activeOrganization } = useAuth();
    const activeOrganizationId = activeOrganization?.id ?? null;

    const [projects, setProjects] = useState([]);
    const [projectId, setProjectId] = useState(searchParams.get('project_id') ?? '');
    const [areas, setAreas] = useState([]);
    const [buildings, setBuildings] = useState([]);
    const [floorNames, setFloorNames] = useState({});
    const [areaId, setAreaId] = useState(searchParams.get('area_id') ?? '');
    const [buildingId, setBuildingId] = useState(searchParams.get('building_id') ?? '');
    const [colorMode, setColorMode] = useState('severity');
    const [aggregate, setAggregate] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [pinPopover, setPinPopover] = useState(null);

    const syncParams = useCallback((updates) => {
        const next = new URLSearchParams(searchParams);
        for (const [key, value] of Object.entries(updates)) {
            if (!value) {
                next.delete(key);
            }
            else {
                next.set(key, String(value));
            }
        }
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams]);

    // Projects for the top-level picker (org-scoped by the api client).
    useEffect(() => {
        const run = async () => {
            try {
                const response = await api.get('/api/projects');
                const list = response.data.data ?? [];
                setProjects(list);
                setProjectId((current) => {
                    if (current && list.some((project) => String(project.id) === String(current))) {
                        return current;
                    }
                    return list[0] ? String(list[0].id) : '';
                });
            }
            catch (requestError) {
                setError(normalizeApiError(requestError, 'Unable to load projects.'));
            }
        };
        void run();
    }, [activeOrganizationId]);

    // Areas + buildings + floor names for the chosen project.
    useEffect(() => {
        if (!projectId) {
            setAreas([]);
            setBuildings([]);
            setFloorNames({});
            return;
        }
        const run = async () => {
            try {
                const [areasResponse, buildingsResponse, projectResponse] = await Promise.all([
                    api.get('/api/areas', { params: { project_id: projectId } }),
                    api.get('/api/buildings', { params: { project_id: projectId } }),
                    api.get(`/api/projects/${projectId}`),
                ]);
                setAreas(areasResponse.data.data ?? []);
                setBuildings(buildingsResponse.data.data ?? []);
                const names = {};
                for (const building of projectResponse.data.data.buildings ?? []) {
                    for (const floor of building.floors ?? []) {
                        names[floor.id] = floor.name;
                    }
                }
                setFloorNames(names);
            }
            catch (requestError) {
                setError(normalizeApiError(requestError, 'Unable to load master data for this project.'));
            }
        };
        void run();
    }, [projectId]);

    const buildingsForArea = useMemo(() => {
        if (!areaId) {
            return buildings;
        }
        return buildings.filter((building) => String(building.area_id) === String(areaId));
    }, [areaId, buildings]);

    // Reset a building selection that no longer belongs to the active area.
    useEffect(() => {
        if (buildingId && !buildingsForArea.some((building) => String(building.id) === String(buildingId))) {
            setBuildingId('');
            syncParams({ building_id: null });
        }
    }, [buildingId, buildingsForArea, syncParams]);

    // Aggregate whenever a concrete scope (building, else area) is resolved.
    const scope = useMemo(() => {
        if (buildingId) {
            return { kind: 'building', building_id: buildingId };
        }
        if (areaId) {
            return { kind: 'area', area_id: areaId };
        }
        return null;
    }, [areaId, buildingId]);

    useEffect(() => {
        if (!projectId || !scope) {
            setAggregate(null);
            return;
        }
        let cancelled = false;
        const run = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await api.get('/api/drawings/aggregate', {
                    params: {
                        project_id: projectId,
                        building_id: scope.building_id ?? undefined,
                        area_id: scope.kind === 'area' ? scope.area_id : undefined,
                    },
                });
                if (!cancelled) {
                    setAggregate(response.data.data);
                }
            }
            catch (requestError) {
                if (!cancelled) {
                    setError(normalizeApiError(requestError, 'Unable to aggregate snags for the selected scope.'));
                    setAggregate(null);
                }
            }
            finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [projectId, scope]);

    const snagsByDrawing = useMemo(() => {
        const map = new Map();
        for (const snag of aggregate?.snags ?? []) {
            const list = map.get(snag.drawing_id) ?? [];
            list.push(snag);
            map.set(snag.drawing_id, list);
        }
        return map;
    }, [aggregate]);

    const severityCounts = useMemo(() => {
        const raw = aggregate?.summary?.by_severity ?? {};
        return SEVERITY_ORDER.map((key) => ({ key, label: SEVERITY[key].label, count: Number(raw[key] ?? 0) }));
    }, [aggregate]);

    const totalSnags = aggregate?.summary?.total ?? 0;
    const scopeLabel = useMemo(() => {
        if (buildingId) {
            return buildings.find((building) => String(building.id) === String(buildingId))?.name ?? 'Building';
        }
        if (areaId) {
            return `${areas.find((area) => String(area.id) === String(areaId))?.name ?? 'Area'} (all buildings)`;
        }
        return null;
    }, [areaId, areas, buildingId, buildings]);

    const openInDrawing = useCallback((snag) => {
        const query = new URLSearchParams();
        if (snag.drawing_revision_id) {
            query.set('revision_id', String(snag.drawing_revision_id));
        }
        navigate(`/projects/${projectId}/drawings/${snag.drawing_id}?${query.toString()}`);
    }, [navigate, projectId]);

    const legend = colorMode === 'severity'
        ? SEVERITY_ORDER.map((key) => ({ color: SEVERITY[key].dot, label: SEVERITY[key].label }))
        : STATUS_LEGEND.map((entry) => ({ color: statusPinColor(entry.key), label: entry.label }));

    return (<Stack spacing={2}>
      {error && (<Alert severity="error" onClose={() => setError(null)}>
          <Stack spacing={0.5}>
            <Typography variant="body2">{error.message}</Typography>
            {error.hint && <Typography variant="caption" color="text.secondary">{error.hint}</Typography>}
          </Stack>
        </Alert>)}

      <PageHero title="Area & Building Overlay" description="Aggregated severity view of every pinned snag across a building's levels — the Area → Building → Level spatial overlay (D4)." badges={scopeLabel && (<Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" variant="outlined" label={scopeLabel}/>
            <Chip size="small" variant="outlined" label={`${totalSnags} pinned snags`}/>
            <Chip size="small" variant="outlined" label={`${(aggregate?.drawings ?? []).length} levels`}/>
          </Stack>)}/>

      <Paper sx={{ p: 2 }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid size={{ xs: 12, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="overlay-project-label">Project</InputLabel>
              <Select labelId="overlay-project-label" label="Project" value={projectId} onChange={(event) => {
            const value = String(event.target.value);
            setProjectId(value);
            setAreaId('');
            setBuildingId('');
            syncParams({ project_id: value, area_id: null, building_id: null });
        }}>
                {projects.map((project) => (<MenuItem key={project.id} value={String(project.id)}>
                    {project.code ? `${project.code} — ${project.name}` : project.name}
                  </MenuItem>))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, md: 3 }}>
            <FormControl fullWidth size="small" disabled={areas.length === 0}>
              <InputLabel id="overlay-area-label">Area</InputLabel>
              <Select labelId="overlay-area-label" label="Area" value={areaId} onChange={(event) => {
            const value = String(event.target.value);
            setAreaId(value);
            syncParams({ area_id: value || null });
        }}>
                <MenuItem value="">All areas</MenuItem>
                {areas.map((area) => (<MenuItem key={area.id} value={String(area.id)}>
                    {area.code ? `${area.code} — ${area.name}` : area.name}
                  </MenuItem>))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, md: 3 }}>
            <FormControl fullWidth size="small" disabled={buildingsForArea.length === 0}>
              <InputLabel id="overlay-building-label">Building</InputLabel>
              <Select labelId="overlay-building-label" label="Building" value={buildingId} onChange={(event) => {
            const value = String(event.target.value);
            setBuildingId(value);
            syncParams({ building_id: value || null });
        }}>
                <MenuItem value="">{areaId ? 'All buildings in area' : 'Select a building'}</MenuItem>
                {buildingsForArea.map((building) => (<MenuItem key={building.id} value={String(building.id)}>
                    {building.code ? `${building.code} — ${building.name}` : building.name}
                  </MenuItem>))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, md: 3 }}>
            <Stack spacing={0.5}>
              <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ letterSpacing: '0.04em' }}>
                COLOUR BY
              </Typography>
              <ToggleButtonGroup exclusive size="small" value={colorMode} onChange={(_, value) => value && setColorMode(value)}>
                <ToggleButton value="severity">Severity</ToggleButton>
                <ToggleButton value="status">Status</ToggleButton>
              </ToggleButtonGroup>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {!scope && (<Alert severity="info">Choose an area or building to render the aggregated overlay.</Alert>)}

      {scope && (<Grid container spacing={1.2}>
          <Grid size={{ xs: 6, sm: 4, md: 12 / 5 }}>
            <StatCard label="Total pinned" value={totalSnags} tone="primary"/>
          </Grid>
          {severityCounts.map((entry) => (<Grid key={entry.key} size={{ xs: 6, sm: 4, md: 12 / 5 }}>
              <StatCard label={entry.label} value={entry.count} tone={entry.key === 'major' ? 'warning' : entry.key === 'low' ? 'success' : 'neutral'}/>
            </Grid>))}
        </Grid>)}

      {scope && (<Paper sx={{ p: 1.5 }}>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="center">
            <Typography variant="caption" color="text.secondary" fontWeight={700}>LEGEND</Typography>
            {legend.map((item) => (<Box key={item.label} sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 12, color: BRAND.inkSoft }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', background: item.color, flex: 'none' }}/>
                {item.label}
              </Box>))}
            <Divider orientation="vertical" flexItem/>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 12, color: BRAND.inkSoft }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', border: `2px dashed ${BRAND.muted}`, flex: 'none' }}/>
              Operational
            </Box>
          </Stack>
        </Paper>)}

      {scope && !loading && (aggregate?.drawings ?? []).length === 0 && (<Alert severity="warning">This scope has no drawings yet. Every building should carry at least one drawing (BR-BR-016).</Alert>)}

      {scope && (<Grid container spacing={2}>
          {(aggregate?.drawings ?? []).map((drawing) => {
            const drawingSnags = snagsByDrawing.get(drawing.id) ?? [];
            const revision = drawing.current_revision ?? drawing.currentRevision ?? null;
            const canRenderImage = drawing.current_revision_id && isImageMime(revision?.mime_type);
            const imageSource = canRenderImage ? `/api/drawing-revisions/${drawing.current_revision_id}/file` : null;
            return (<Grid key={drawing.id} size={{ xs: 12, md: 6 }}>
                <Paper sx={{ p: 1.5 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} mb={1}>
                    <Box>
                      <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                        {drawing.title ?? drawing.code ?? 'Drawing'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {(drawing.building?.name ?? scopeLabel ?? 'Building')} · {floorNames[drawing.floor_id] ?? 'Level'}
                        {revision?.revision_label ? ` · Rev ${revision.revision_label}` : ''}
                      </Typography>
                    </Box>
                    <Chip size="small" label={`${drawingSnags.length}`} sx={{ fontFamily: FONT_MONO }}/>
                  </Stack>

                  <Box sx={{
                position: 'relative',
                width: '100%',
                minHeight: 260,
                borderRadius: '12px',
                overflow: 'hidden',
                border: `1px solid ${BRAND.border}`,
                bgcolor: '#FBFCFE',
                backgroundImage: 'radial-gradient(rgba(20,38,66,0.05) 1px, transparent 0)',
                backgroundSize: '20px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                    {imageSource && (<img src={imageSource} alt={drawing.title ?? drawing.code ?? 'Drawing'} style={{ width: '100%', height: 'auto', display: 'block' }}/>)}
                    {!imageSource && (<Stack alignItems="center" spacing={0.5} sx={{ color: BRAND.muted, py: 4 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Plan preview unavailable</Typography>
                        <Typography sx={{ fontSize: 12 }}>{drawingSnags.length} pinned snag(s) on this level</Typography>
                      </Stack>)}

                    {drawingSnags.map((snag) => {
                const color = pinColorFor(snag, colorMode);
                const operational = snag.snag_type === 'operational';
                return (<Box key={snag.id} onClick={(event) => setPinPopover({ anchorEl: event.currentTarget, snag })} title={`${snag.reference} · ${formatStatusLabel(snag.status)}`} sx={{
                        position: 'absolute',
                        left: `${snag.pin_x * 100}%`,
                        top: `${snag.pin_y * 100}%`,
                        width: 22,
                        height: 22,
                        transform: 'translate(-50%, -50%)',
                        borderRadius: '50%',
                        background: color,
                        border: operational ? '2px dashed #FFFFFF' : '2px solid #FFFFFF',
                        boxShadow: '0 0 0 2px rgba(15,23,42,0.16)',
                        cursor: 'pointer',
                        transition: 'transform 120ms ease',
                        '&:hover': { transform: 'translate(-50%, -50%) scale(1.18)' },
                    }}/>);
            })}
                  </Box>
                </Paper>
              </Grid>);
        })}
        </Grid>)}

      <Popover open={Boolean(pinPopover)} anchorEl={pinPopover?.anchorEl ?? null} onClose={() => setPinPopover(null)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }} transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {pinPopover && (<Box sx={{ p: 1.8, maxWidth: 280 }}>
            <Stack spacing={1}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ fontFamily: FONT_MONO }}>
                {pinPopover.snag.reference}
              </Typography>
              <Typography variant="body2">{pinPopover.snag.title}</Typography>
              <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={formatStatusLabel(pinPopover.snag.status)} sx={{ background: `${statusPinColor(pinPopover.snag.status)}22`, color: statusPinColor(pinPopover.snag.status), fontWeight: 700 }}/>
                <Chip size="small" label={severityStyle(pinPopover.snag.severity).label} sx={{ background: severityStyle(pinPopover.snag.severity).tint, color: severityStyle(pinPopover.snag.severity).text, fontWeight: 700 }}/>
                {pinPopover.snag.snag_type === 'operational' && (<Chip size="small" variant="outlined" label="Operational"/>)}
              </Stack>
              {pinPopover.snag.source_organization && (<Typography variant="caption" color="text.secondary">
                  Raised by {pinPopover.snag.source_organization.name}
                </Typography>)}
              <Button size="small" variant="contained" onClick={() => { openInDrawing(pinPopover.snag); setPinPopover(null); }}>
                Open in drawing
              </Button>
            </Stack>
          </Box>)}
      </Popover>
    </Stack>);
};
