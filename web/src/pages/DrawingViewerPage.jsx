import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, Divider, FormControl, Grid, InputLabel, MenuItem, Paper, Select, Stack, Switch, TextField, Typography, } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { CreateSnagDialog } from '../components/CreateSnagDialog';
import { SnagDrawer } from '../components/SnagDrawer';
import { PageHero } from '../components/ui/PageHero';
import { StatCard } from '../components/ui/StatCard';
import { useAuth } from '../hooks/useAuth';
import { useCoreTour } from '../hooks/useCoreTour';
import { useLocalization } from '../hooks/useLocalization';
import { subscribeOrganizationChannel } from '../realtime/echo';
import { formatPriorityLabel, formatStatusLabel, snagPriorityChipColor, snagStatusChipColor } from '../utils/ui';
import { normalizeApiError } from '../utils/apiError';
import { BRAND, FONT_MONO } from '../theme';

// Status legend for the drawing canvas overlay (frame-1f). Colours mirror the
// snag lifecycle status scale used by the pins.
const CANVAS_LEGEND = [
    { label: 'New', color: '#6B7A93' },
    { label: 'Assigned', color: '#24488F' },
    { label: 'In progress', color: '#2F8FBE' },
    { label: 'Review', color: '#C08A23' },
    { label: 'Closed', color: '#6E8C3A' },
];
const inlineError = (message, hint = null) => ({
    message,
    hint,
    action: null,
    code: null,
    fieldErrors: {},
    requestId: null,
    status: null,
});
const locationReasonLabel = (source) => {
    if (source === 'zone_inside') {
        return 'inside mapped zone';
    }
    if (source === 'zone_nearest') {
        return 'nearest mapped zone';
    }
    return 'floor fallback';
};
const statusPinColor = (status) => {
    if (status === 'closed') {
        return '#6E8C3A';
    }
    if (status === 'rejected') {
        return '#B23B3B';
    }
    if (status === 'ready_for_review') {
        return '#C08A23';
    }
    if (status === 'in_progress') {
        return '#2F8FBE';
    }
    if (status === 'assigned') {
        return '#24488F';
    }
    return '#6B7A93';
};
const isImageRevision = (revision) => Boolean(revision?.mime_type.startsWith('image/'));
const loadImageElement = (src) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image_load_failed'));
    image.src = src;
});
export const DrawingViewerPage = () => {
    const { projectId, drawingId } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const { permissions, activeOrganization, resolveProjectPermissions } = useAuth();
    const activeOrganizationId = activeOrganization?.id ?? null;
    const { t } = useLocalization();
    const [project, setProject] = useState(null);
    const [selectedDrawingId, setSelectedDrawingId] = useState(drawingId ? Number(drawingId) : null);
    const [drawing, setDrawing] = useState(null);
    const [revisions, setRevisions] = useState([]);
    const [selectedRevisionId, setSelectedRevisionId] = useState(null);
    const [compareRevisionId, setCompareRevisionId] = useState(null);
    const [compareMode, setCompareMode] = useState(false);
    const [highlightChanges, setHighlightChanges] = useState(false);
    const [compareData, setCompareData] = useState(null);
    const [compareLoading, setCompareLoading] = useState(false);
    const [diffOverlayUrl, setDiffOverlayUrl] = useState(null);
    const [snags, setSnags] = useState([]);
    const [members, setMembers] = useState([]);
    const [companies, setCompanies] = useState([]);
    const [teams, setTeams] = useState([]);
    const [rootCauseCategories, setRootCauseCategories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');
    const [locationFilter, setLocationFilter] = useState(searchParams.get('location_id') ?? '');
    const [barcodeInput, setBarcodeInput] = useState(searchParams.get('barcode') ?? '');
    const [resolvingBarcode, setResolvingBarcode] = useState(false);
    const [pinDraft, setPinDraft] = useState(null);
    const [zoom, setZoom] = useState(100);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [selectedSnagId, setSelectedSnagId] = useState(null);
    const [locationSuggestions, setLocationSuggestions] = useState([]);
    const [suggestedLocation, setSuggestedLocation] = useState(null);
    const [migrationPreview, setMigrationPreview] = useState(null);
    const [migrationLoading, setMigrationLoading] = useState(false);
    const [selectedSnagIds, setSelectedSnagIds] = useState([]);
    const [bulkAssigneeId, setBulkAssigneeId] = useState('');
    const [bulkDueDate, setBulkDueDate] = useState('');
    const [bulkExportType, setBulkExportType] = useState('csv');
    const [bulkBusy, setBulkBusy] = useState(false);
    const [bulkMessage, setBulkMessage] = useState(null);
    const [advancedToolsOpen, setAdvancedToolsOpen] = useState(false);
    const [advancedBulkOpen, setAdvancedBulkOpen] = useState(false);
    const [projectPermissions, setProjectPermissions] = useState(permissions);
    const canCreateSnag = projectPermissions.includes('snags.create');
    const canTransitionSnag = projectPermissions.includes('snags.transition');
    const canManageDrawing = projectPermissions.includes('drawings.manage');
    const canBulkAssign = projectPermissions.includes('snags.assign');
    const canBulkUpdateDueDate = projectPermissions.includes('snags.update');
    const canBulkExport = projectPermissions.includes('exports.request');
    useCoreTour({
        enabled: Boolean(drawing && project),
        includeCreate: canCreateSnag,
        includeTransition: canTransitionSnag,
    });
    const updateSearchParams = useCallback((updates) => {
        const next = new URLSearchParams(searchParams);
        for (const [key, value] of Object.entries(updates)) {
            if (!value) {
                next.delete(key);
                continue;
            }
            next.set(key, value);
        }
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams]);
    const loadProject = useCallback(async () => {
        if (!projectId) {
            throw new Error('Project id is required');
        }
        const response = await api.get(`/api/projects/${projectId}`);
        const loaded = response.data.data;
        setProject(loaded);
        const defaultDrawingId = selectedDrawingId ?? loaded.drawings[0]?.id ?? null;
        setSelectedDrawingId(defaultDrawingId);
        return loaded;
    }, [projectId, selectedDrawingId]);
    const loadMembers = useCallback(async (selectedProjectId) => {
        const response = await api.get('/api/organizations/members', {
            params: {
                project_id: selectedProjectId,
            },
        });
        setMembers(response.data.data);
    }, []);
    const loadStakeholders = useCallback(async (selectedProjectId) => {
        const [companiesResponse, teamsResponse] = await Promise.all([
            api.get('/api/stakeholders/companies', {
                params: {
                    project_id: selectedProjectId,
                },
            }),
            api.get('/api/stakeholders/teams', {
                params: {
                    project_id: selectedProjectId,
                },
            }),
        ]);
        setCompanies(companiesResponse.data.data);
        setTeams(teamsResponse.data.data);
    }, []);
    const loadRootCauseCategories = useCallback(async () => {
        try {
            const response = await api.get('/api/root-cause-categories');
            setRootCauseCategories(response.data.data);
        }
        catch {
            setRootCauseCategories([]);
        }
    }, []);
    const loadDrawing = useCallback(async (id) => {
        const response = await api.get(`/api/drawings/${id}`);
        const resolved = response.data.data;
        setDrawing(resolved);
        setRevisions(resolved.revisions ?? []);
        setMigrationPreview(null);
        const queryRevision = Number(searchParams.get('revision_id') ?? '');
        const currentRevision = resolved.currentRevision?.id ?? resolved.current_revision?.id ?? resolved.current_revision_id ?? null;
        const defaultRevision = resolved.revisions?.find((revision) => revision.id === queryRevision)?.id ?? currentRevision ?? resolved.revisions?.[0]?.id ?? null;
        setSelectedRevisionId(defaultRevision);
        const fallbackCompare = (resolved.revisions ?? []).find((revision) => revision.id !== defaultRevision)?.id ?? null;
        setCompareRevisionId(fallbackCompare);
    }, [searchParams]);
    const loadSnags = useCallback(async (id, revisionId) => {
        const response = await api.get('/api/snags', {
            params: {
                drawing_id: id,
                drawing_revision_id: revisionId ?? undefined,
                status: statusFilter || undefined,
                location_id: locationFilter ? Number(locationFilter) : undefined,
                search: search || undefined,
                per_page: 200,
            },
        });
        setSnags(response.data.data);
    }, [locationFilter, search, statusFilter]);
    useEffect(() => {
        setSelectedDrawingId(drawingId ? Number(drawingId) : null);
    }, [drawingId]);
    useEffect(() => {
        const queryLocation = searchParams.get('location_id') ?? '';
        if (queryLocation !== locationFilter) {
            setLocationFilter(queryLocation);
        }
        const queryBarcode = searchParams.get('barcode') ?? '';
        if (queryBarcode && queryBarcode !== barcodeInput) {
            setBarcodeInput(queryBarcode);
        }
    }, [barcodeInput, locationFilter, searchParams]);
    useEffect(() => {
        const run = async () => {
            setLoading(true);
            setError(null);
            try {
                const loadedProject = await loadProject();
                await Promise.all([loadMembers(loadedProject.id), loadStakeholders(loadedProject.id), loadRootCauseCategories()]);
            }
            catch (requestError) {
                setError(normalizeApiError(requestError, 'Unable to load project data.'));
            }
            finally {
                setLoading(false);
            }
        };
        void run();
    }, [loadMembers, loadProject, loadRootCauseCategories, loadStakeholders]);
    useEffect(() => {
        if (!selectedDrawingId) {
            return;
        }
        const run = async () => {
            setLoading(true);
            setError(null);
            try {
                await loadDrawing(selectedDrawingId);
            }
            catch (requestError) {
                setError(normalizeApiError(requestError, 'Unable to load drawing details.'));
            }
            finally {
                setLoading(false);
            }
        };
        void run();
    }, [loadDrawing, selectedDrawingId]);
    useEffect(() => {
        if (!selectedDrawingId) {
            return;
        }
        void loadSnags(selectedDrawingId, selectedRevisionId);
    }, [loadSnags, locationFilter, search, selectedDrawingId, selectedRevisionId, statusFilter]);
    useEffect(() => {
        const available = new Set(snags.map((snag) => snag.id));
        setSelectedSnagIds((current) => current.filter((id) => available.has(id)));
    }, [snags]);
    useEffect(() => {
        if (!projectId) {
            setProjectPermissions(permissions);
            return;
        }
        const run = async () => {
            try {
                const scoped = await resolveProjectPermissions(Number(projectId));
                setProjectPermissions(scoped.length > 0 ? scoped : permissions);
            }
            catch {
                setProjectPermissions(permissions);
            }
        };
        void run();
    }, [permissions, projectId, resolveProjectPermissions]);
    useEffect(() => {
        if (!activeOrganizationId || !selectedDrawingId) {
            return;
        }
        const unsubscribe = subscribeOrganizationChannel(activeOrganizationId, {
            onSnag: () => {
                void loadSnags(selectedDrawingId, selectedRevisionId);
            },
        });
        return () => {
            unsubscribe();
        };
    }, [activeOrganizationId, loadSnags, selectedDrawingId, selectedRevisionId]);
    useEffect(() => {
        if (!compareMode || !drawing || !selectedRevisionId || !compareRevisionId || selectedRevisionId === compareRevisionId) {
            setCompareData(null);
            return;
        }
        const run = async () => {
            setCompareLoading(true);
            try {
                const response = await api.get(`/api/drawings/${drawing.id}/compare`, {
                    params: {
                        left_revision_id: selectedRevisionId,
                        right_revision_id: compareRevisionId,
                    },
                });
                setCompareData(response.data.data);
            }
            catch {
                setCompareData(null);
            }
            finally {
                setCompareLoading(false);
            }
        };
        void run();
    }, [compareMode, compareRevisionId, drawing, selectedRevisionId]);
    useEffect(() => {
        if (!compareMode || !highlightChanges || !compareData?.can_highlight) {
            setDiffOverlayUrl(null);
            return;
        }
        let cancelled = false;
        const run = async () => {
            try {
                const leftImage = await loadImageElement(`${compareData.left_revision.file_url}?v=${compareData.left_revision.id}`);
                const rightImage = await loadImageElement(`${compareData.right_revision.file_url}?v=${compareData.right_revision.id}`);
                if (cancelled) {
                    return;
                }
                const width = Math.max(leftImage.naturalWidth, rightImage.naturalWidth);
                const height = Math.max(leftImage.naturalHeight, rightImage.naturalHeight);
                const baseline = document.createElement('canvas');
                baseline.width = width;
                baseline.height = height;
                const baselineContext = baseline.getContext('2d');
                const candidate = document.createElement('canvas');
                candidate.width = width;
                candidate.height = height;
                const candidateContext = candidate.getContext('2d');
                const diff = document.createElement('canvas');
                diff.width = width;
                diff.height = height;
                const diffContext = diff.getContext('2d');
                if (!baselineContext || !candidateContext || !diffContext) {
                    setDiffOverlayUrl(null);
                    return;
                }
                baselineContext.drawImage(leftImage, 0, 0, width, height);
                candidateContext.drawImage(rightImage, 0, 0, width, height);
                const baselineData = baselineContext.getImageData(0, 0, width, height);
                const candidateData = candidateContext.getImageData(0, 0, width, height);
                const output = diffContext.createImageData(width, height);
                for (let index = 0; index < baselineData.data.length; index += 4) {
                    const redDiff = Math.abs(baselineData.data[index] - candidateData.data[index]);
                    const greenDiff = Math.abs(baselineData.data[index + 1] - candidateData.data[index + 1]);
                    const blueDiff = Math.abs(baselineData.data[index + 2] - candidateData.data[index + 2]);
                    const delta = redDiff + greenDiff + blueDiff;
                    if (delta > 90) {
                        output.data[index] = 255;
                        output.data[index + 1] = 76;
                        output.data[index + 2] = 76;
                        output.data[index + 3] = Math.min(210, 70 + Math.round(delta / 6));
                    }
                    else {
                        output.data[index + 3] = 0;
                    }
                }
                diffContext.putImageData(output, 0, 0);
                if (!cancelled) {
                    setDiffOverlayUrl(diff.toDataURL('image/png'));
                }
            }
            catch {
                if (!cancelled) {
                    setDiffOverlayUrl(null);
                }
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [compareData, compareMode, highlightChanges]);
    const buildingOptions = useMemo(() => project?.buildings ?? [], [project]);
    const floorOptions = useMemo(() => {
        if (!project || !drawing?.building_id) {
            return [];
        }
        return project.buildings.find((building) => building.id === drawing.building_id)?.floors ?? [];
    }, [project, drawing?.building_id]);
    const locationOptions = useMemo(() => {
        if (!project || !drawing?.building_id || !drawing?.floor_id) {
            return [];
        }
        const floor = project.buildings
            .find((building) => building.id === drawing.building_id)
            ?.floors.find((item) => item.id === drawing.floor_id);
        return floor?.locations ?? [];
    }, [project, drawing?.building_id, drawing?.floor_id]);
    const selectedRevision = useMemo(() => revisions.find((revision) => revision.id === selectedRevisionId) ?? null, [revisions, selectedRevisionId]);
    const compareRevision = useMemo(() => revisions.find((revision) => revision.id === compareRevisionId) ?? null, [compareRevisionId, revisions]);
    const compareCandidates = useMemo(() => revisions.filter((revision) => revision.id !== selectedRevisionId), [revisions, selectedRevisionId]);
    const drawingSelectValue = useMemo(() => {
        const candidates = project?.drawings ?? [];
        if (!selectedDrawingId) {
            return '';
        }
        return candidates.some((entry) => entry.id === selectedDrawingId) ? selectedDrawingId : '';
    }, [project?.drawings, selectedDrawingId]);
    const buildingSelectValue = useMemo(() => {
        if (!drawing?.building_id) {
            return '';
        }
        return buildingOptions.some((building) => building.id === drawing.building_id) ? drawing.building_id : '';
    }, [buildingOptions, drawing?.building_id]);
    const floorSelectValue = useMemo(() => {
        if (!drawing?.floor_id) {
            return '';
        }
        return floorOptions.some((floor) => floor.id === drawing.floor_id) ? drawing.floor_id : '';
    }, [drawing?.floor_id, floorOptions]);
    const revisionSelectValue = useMemo(() => {
        if (!selectedRevisionId) {
            return '';
        }
        return revisions.some((revision) => revision.id === selectedRevisionId) ? selectedRevisionId : '';
    }, [revisions, selectedRevisionId]);
    const compareSelectValue = useMemo(() => {
        if (!compareRevisionId) {
            return '';
        }
        return compareCandidates.some((revision) => revision.id === compareRevisionId) ? compareRevisionId : '';
    }, [compareCandidates, compareRevisionId]);
    const locationSelectValue = useMemo(() => {
        if (!locationFilter) {
            return '';
        }
        const normalized = Number(locationFilter);
        if (!Number.isFinite(normalized)) {
            return '';
        }
        return locationOptions.some((location) => location.id === normalized) ? normalized : '';
    }, [locationFilter, locationOptions]);
    const drawingSource = useMemo(() => {
        if (!selectedRevision) {
            return null;
        }
        return `/api/drawing-revisions/${selectedRevision.id}/file`;
    }, [selectedRevision]);
    const compareSource = useMemo(() => {
        if (!compareRevision) {
            return null;
        }
        return `/api/drawing-revisions/${compareRevision.id}/file`;
    }, [compareRevision]);
    const gridColumns = useMemo(() => [
        { field: 'reference', headerName: 'Ref', width: 120 },
        { field: 'title', headerName: 'Title', flex: 1, minWidth: 200 },
        {
            field: 'status',
            headerName: 'Status',
            width: 170,
            renderCell: (params) => (<Chip size="small" color={snagStatusChipColor(params.row.status)} label={formatStatusLabel(params.row.status)}/>),
        },
        {
            field: 'priority',
            headerName: 'Priority',
            width: 140,
            renderCell: (params) => (<Chip size="small" variant="outlined" color={snagPriorityChipColor(params.row.priority)} label={formatPriorityLabel(params.row.priority)}/>),
        },
        {
            field: 'location',
            headerName: 'Location',
            width: 170,
            valueGetter: (_, row) => {
                const location = locationOptions.find((item) => item.id === row.location_id);
                return location ? `${location.code ?? '-'} ${location.name}` : '-';
            },
        },
        {
            field: 'assignee',
            headerName: 'Assignee',
            width: 160,
            valueGetter: (_, row) => row.assignee?.name ?? 'Unassigned',
        },
        {
            field: 'created_at',
            headerName: 'Created',
            width: 175,
            valueFormatter: (value) => new Date(value).toLocaleString(),
        },
    ], [locationOptions]);
    const suggestLocationForPin = useCallback(async (x, y) => {
        if (!drawing) {
            return;
        }
        try {
            const response = await api.get(`/api/drawings/${drawing.id}/location-suggestions`, {
                params: {
                    pin_x: x,
                    pin_y: y,
                    revision_id: selectedRevisionId ?? undefined,
                    limit: 5,
                },
            });
            const suggestions = response.data.data.suggestions;
            setLocationSuggestions(suggestions);
            const best = suggestions[0];
            setSuggestedLocation(best
                ? {
                    location_id: best.location_id,
                    reason: locationReasonLabel(best.source),
                    score: best.score,
                }
                : null);
        }
        catch {
            setLocationSuggestions([]);
            setSuggestedLocation(null);
        }
    }, [drawing, selectedRevisionId]);
    const onCanvasClick = (event) => {
        if (!canCreateSnag) {
            return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        const nextPin = { x: Number(x.toFixed(6)), y: Number(y.toFixed(6)) };
        setPinDraft(nextPin);
        setCreateDialogOpen(true);
        void suggestLocationForPin(nextPin.x, nextPin.y);
    };
    const createSnag = async (payload) => {
        if (!drawing || !project) {
            return;
        }
        try {
            const location = locationOptions.find((item) => item.id === payload.location_id);
            const floor = location ? floorOptions.find((item) => item.id === location.floor_id) : null;
            const response = await api.post('/api/snags', {
                project_id: project.id,
                drawing_id: drawing.id,
                drawing_revision_id: selectedRevisionId ?? drawing.current_revision_id,
                building_id: payload.building_id ?? drawing.building_id,
                area_id: payload.area_id,
                floor_id: floor?.id ?? drawing.floor_id,
                location_id: payload.location_id,
                location_text: payload.location_text,
                title: payload.title,
                description: payload.description,
                priority: payload.priority,
                severity: payload.severity,
                category_id: payload.category_id,
                trade: payload.trade,
                is_dlp: payload.is_dlp,
                cluster: payload.cluster,
                toc_reference: payload.toc_reference,
                taking_over_certificate_id: payload.taking_over_certificate_id,
                assigned_to: payload.assigned_to,
                assigned_company_id: payload.assigned_company_id,
                assigned_team_id: payload.assigned_team_id,
                root_cause_category_id: payload.root_cause_category_id,
                estimated_cost: payload.estimated_cost,
                estimated_hours: payload.estimated_hours,
                pin_x: payload.pin_x,
                pin_y: payload.pin_y,
            });
            // Upload the evidence photos captured in the dialog (required for DLP snags).
            const createdSnag = response.data?.data;
            const photos = Array.isArray(payload.photos) ? payload.photos : [];
            let photoUploadFailed = false;
            if (createdSnag?.id && photos.length > 0) {
                for (const file of photos) {
                    const form = new FormData();
                    form.append('type', 'photo');
                    form.append('file', file);
                    try {
                        await api.post(`/api/snags/${createdSnag.id}/attachments`, form);
                    }
                    catch {
                        photoUploadFailed = true;
                    }
                }
            }
            await loadSnags(drawing.id, selectedRevisionId);
            if (photoUploadFailed) {
                setError(inlineError('Snag created, but one or more photos failed to upload. You can add them from the snag.'));
            }
        }
        catch (requestError) {
            setError(normalizeApiError(requestError, 'Unable to create snag from the selected pin.'));
            throw requestError;
        }
    };
    const runBulkUpdate = useCallback(async () => {
        if (!drawing || selectedSnagIds.length === 0) {
            return;
        }
        const hasAssign = bulkAssigneeId !== '';
        const hasDueDate = bulkDueDate.trim() !== '';
        if (!hasAssign && !hasDueDate) {
            setError(inlineError('Choose assignee and/or due date before applying bulk update.'));
            return;
        }
        setBulkBusy(true);
        setBulkMessage(null);
        setError(null);
        try {
            await api.post('/api/snags/bulk-update', {
                snag_ids: selectedSnagIds,
                assigned_to: hasAssign ? bulkAssigneeId : undefined,
                due_date: hasDueDate ? bulkDueDate : undefined,
            });
            await loadSnags(drawing.id, selectedRevisionId);
            setBulkMessage(`Bulk update applied to ${selectedSnagIds.length} snags.`);
        }
        catch (requestError) {
            setError(normalizeApiError(requestError, 'Unable to apply bulk update for selected snags.'));
        }
        finally {
            setBulkBusy(false);
        }
    }, [bulkAssigneeId, bulkDueDate, drawing, loadSnags, selectedRevisionId, selectedSnagIds]);
    const runBulkExport = useCallback(async () => {
        if (selectedSnagIds.length === 0) {
            return;
        }
        setBulkBusy(true);
        setBulkMessage(null);
        setError(null);
        try {
            await api.post('/api/snags/bulk-export', {
                type: bulkExportType,
                snag_ids: selectedSnagIds,
            });
            setBulkMessage(`Bulk ${bulkExportType.toUpperCase()} export requested for ${selectedSnagIds.length} snags.`);
        }
        catch (requestError) {
            setError(normalizeApiError(requestError, 'Unable to queue bulk export for selected snags.'));
        }
        finally {
            setBulkBusy(false);
        }
    }, [bulkExportType, selectedSnagIds]);
    const runPinMigration = useCallback(async (apply) => {
        if (!drawing || !selectedRevisionId || !compareRevisionId || selectedRevisionId === compareRevisionId) {
            return;
        }
        setMigrationLoading(true);
        setError(null);
        try {
            const response = await api.post(`/api/drawings/${drawing.id}/migrate-pins`, {
                source_revision_id: selectedRevisionId,
                target_revision_id: compareRevisionId,
                apply,
                dry_run: !apply,
            });
            setMigrationPreview(response.data.data);
            if (apply) {
                setSelectedRevisionId(compareRevisionId);
                updateSearchParams({ revision_id: String(compareRevisionId) });
                await loadSnags(drawing.id, compareRevisionId);
            }
        }
        catch (requestError) {
            setError(normalizeApiError(requestError, 'Unable to migrate pins between selected revisions.'));
        }
        finally {
            setMigrationLoading(false);
        }
    }, [compareRevisionId, drawing, loadSnags, selectedRevisionId, updateSearchParams]);
    const resolveBarcode = useCallback(async () => {
        if (!barcodeInput.trim()) {
            return;
        }
        setResolvingBarcode(true);
        setError(null);
        try {
            const response = await api.get('/api/locations/resolve', {
                params: {
                    barcode: barcodeInput.trim(),
                },
            });
            const payload = response.data.data;
            const targetDrawingId = payload.drawing?.id;
            const targetLocationId = payload.filters.location_id;
            if (targetDrawingId) {
                const query = new URLSearchParams();
                query.set('location_id', String(targetLocationId));
                query.set('barcode', payload.barcode);
                navigate(`/projects/${payload.project.id}/drawings/${targetDrawingId}?${query.toString()}`);
            }
            else {
                navigate(`/projects/${payload.project.id}`);
            }
            setLocationFilter(String(targetLocationId));
        }
        catch (requestError) {
            setError(normalizeApiError(requestError, 'Barcode was not resolved to a project location in this organization.'));
        }
        finally {
            setResolvingBarcode(false);
        }
    }, [barcodeInput, navigate]);
    const openSnags = useMemo(() => snags.filter((snag) => snag.status !== 'closed').length, [snags]);
    const closedSnags = useMemo(() => snags.filter((snag) => snag.status === 'closed').length, [snags]);
    const activeRevisionLabel = selectedRevision?.revision_label ?? 'No revision';
    const guidedStep = useMemo(() => {
        if (!selectedRevisionId) {
            return 1;
        }
        if (!pinDraft && !createDialogOpen) {
            return 2;
        }
        if (createDialogOpen) {
            return 3;
        }
        return 4;
    }, [createDialogOpen, pinDraft, selectedRevisionId]);
    const guidedHint = useMemo(() => {
        if (guidedStep === 1) {
            return 'Step 1: Choose a drawing revision to start plotting snags.';
        }
        if (guidedStep === 2) {
            return canCreateSnag
                ? 'Step 2: Click anywhere on the drawing to drop a pin.'
                : 'You need snags.create permission to place a pin.';
        }
        if (guidedStep === 3) {
            return 'Step 3: Fill the quick snag form and save.';
        }
        return 'Step 4: Optionally assign, set due date, or use advanced tools.';
    }, [canCreateSnag, guidedStep]);
    return (<Stack spacing={2}>
      {error && (<Alert severity="error" action={<Button color="inherit" size="small" onClick={() => {
                if (selectedDrawingId) {
                    void loadDrawing(selectedDrawingId);
                    void loadSnags(selectedDrawingId, selectedRevisionId);
                }
            }}>
            Retry
          </Button>}>
          <Stack spacing={0.5}>
            <Typography variant="body2">{error.message}</Typography>
            {error.hint && (<Typography variant="caption" color="text.secondary">
                {error.hint}
              </Typography>)}
          </Stack>
        </Alert>)}
      {bulkMessage && <Alert severity="success">{bulkMessage}</Alert>}
      {project?.is_training && project.training_locked && <Alert severity="warning">{t('training.read_only')}</Alert>}

      <PageHero title="Drawing Viewer" description="Follow the guided steps to place a pin, create a snag, and then assign or transition work." actions={<Button component={RouterLink} to={`/projects/${projectId}`} variant="outlined">
            Project Dashboard
          </Button>} badges={<Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" variant="outlined" label={`Drawing ${drawing?.code ?? '-'}`}/>
            <Chip size="small" variant="outlined" label={`Revision ${activeRevisionLabel}`}/>
            <Chip size="small" variant="outlined" label={`Snags ${snags.length}`}/>
          </Stack>}/>

      <Paper sx={{ p: 1.5 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', md: 'center' }}>
          <Chip color={guidedStep === 1 ? 'primary' : 'default'} label="1. Select revision"/>
          <Chip color={guidedStep === 2 ? 'primary' : 'default'} label="2. Place pin"/>
          <Chip color={guidedStep === 3 ? 'primary' : 'default'} label="3. Create snag"/>
          <Chip color={guidedStep === 4 ? 'primary' : 'default'} label="4. Assign / follow up"/>
          <Typography variant="body2" color="text.secondary">
            {guidedHint}
          </Typography>
        </Stack>
      </Paper>

      <Grid container spacing={1.2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard label="Total Snags" value={snags.length} tone="primary"/>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard label="Open Snags" value={openSnags} tone="warning"/>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard label="Closed Snags" value={closedSnags} tone="success"/>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard label="Compare Mode" value={compareMode ? 'On' : 'Off'} tone="neutral"/>
        </Grid>
      </Grid>

      <Paper sx={{ p: 2 }}>

        <Grid container spacing={2} mt={0.5}>
          <Grid size={{ xs: 12, md: 3 }}>
            <FormControl fullWidth size="small" id="drawing-selector">
              <InputLabel id="drawing-select-label">Drawing</InputLabel>
              <Select labelId="drawing-select-label" value={drawingSelectValue} label="Drawing" onChange={(event) => {
            const nextId = Number(event.target.value);
            setSelectedDrawingId(nextId);
            navigate(`/projects/${projectId}/drawings/${nextId}`);
        }}>
                {(project?.drawings ?? []).map((entry) => (<MenuItem key={entry.id} value={entry.id}>
                    {entry.code} - {entry.title}
                  </MenuItem>))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, md: 3 }}>
            <FormControl fullWidth size="small" disabled={!drawing}>
              <InputLabel id="building-select-label">Building</InputLabel>
              <Select labelId="building-select-label" label="Building" value={buildingSelectValue} onChange={(event) => {
            const buildingId = Number(event.target.value);
            const floorId = project?.buildings
                .find((building) => building.id === buildingId)
                ?.floors.at(0)?.id ?? null;
            setDrawing((current) => current
                ? {
                    ...current,
                    building_id: buildingId,
                    floor_id: floorId,
                }
                : current);
        }}>
                {buildingOptions.map((building) => (<MenuItem key={building.id} value={building.id}>
                    {building.name}
                  </MenuItem>))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, md: 3 }}>
            <FormControl fullWidth size="small" disabled={!drawing}>
              <InputLabel id="floor-select-label">Floor</InputLabel>
              <Select labelId="floor-select-label" label="Floor" value={floorSelectValue} onChange={(event) => {
            const floorId = Number(event.target.value);
            setDrawing((current) => current
                ? {
                    ...current,
                    floor_id: floorId,
                }
                : current);
        }}>
                {floorOptions.map((floor) => (<MenuItem key={floor.id} value={floor.id}>
                    {floor.name}
                  </MenuItem>))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, md: 3 }}>
            <FormControl fullWidth size="small" disabled={revisions.length === 0}>
              <InputLabel id="revision-select-label">Revision</InputLabel>
              <Select labelId="revision-select-label" label="Revision" value={revisionSelectValue} onChange={(event) => {
            const nextRevisionId = Number(event.target.value);
            setSelectedRevisionId(nextRevisionId);
            setMigrationPreview(null);
            updateSearchParams({ revision_id: String(nextRevisionId) });
            if (compareRevisionId === nextRevisionId) {
                const fallback = revisions.find((revision) => revision.id !== nextRevisionId)?.id ?? null;
                setCompareRevisionId(fallback);
            }
        }}>
                {revisions.map((revision) => (<MenuItem key={revision.id} value={revision.id}>
                    {revision.revision_label} ({revision.file_name})
                  </MenuItem>))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12 }}>
            <Accordion expanded={advancedToolsOpen} onChange={(_, expanded) => setAdvancedToolsOpen(expanded)}>
              <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                <Typography fontWeight={700}>Advanced Tools (Compare, Migration, Barcode)</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={1.2}>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <FormControl fullWidth size="small" disabled={revisions.length < 2}>
                      <InputLabel id="compare-select-label">Compare With</InputLabel>
                      <Select labelId="compare-select-label" label="Compare With" value={compareSelectValue} onChange={(event) => {
            setCompareRevisionId(Number(event.target.value));
            setMigrationPreview(null);
        }}>
                        {compareCandidates.map((revision) => (<MenuItem key={revision.id} value={revision.id}>
                              {revision.revision_label} ({revision.file_name})
                            </MenuItem>))}
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid size={{ xs: 12, md: 4 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography variant="body2">Compare mode</Typography>
                      <Switch checked={compareMode} onChange={(event) => setCompareMode(event.target.checked)}/>
                    </Stack>
                  </Grid>

                  <Grid size={{ xs: 12, md: 4 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography variant="body2">Highlight changes</Typography>
                      <Switch checked={highlightChanges} disabled={!compareMode || !compareData?.can_highlight} onChange={(event) => setHighlightChanges(event.target.checked)}/>
                    </Stack>
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <TextField size="small" fullWidth label="Scan QR/Barcode" placeholder="e.g. BC-1-10-2" value={barcodeInput} onChange={(event) => setBarcodeInput(event.target.value)} onBlur={() => updateSearchParams({ barcode: barcodeInput || null })}/>
                      <Button variant="outlined" onClick={() => void resolveBarcode()} disabled={resolvingBarcode || !barcodeInput.trim()}>
                        {resolvingBarcode ? 'Resolving...' : 'Open'}
                      </Button>
                    </Stack>
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          </Grid>
        </Grid>
      </Paper>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper sx={{ p: 2 }}>
            <Alert severity={guidedStep === 2 ? 'info' : 'success'} sx={{ mb: 1.2 }}>
              {guidedHint}
            </Alert>
            {!compareMode && (<Box sx={{
                position: 'relative',
                width: '100%',
                minHeight: 540,
                maxHeight: 720,
                borderRadius: '16px',
                overflow: 'auto',
                border: `1px solid ${BRAND.border}`,
                bgcolor: '#FBFCFE',
                // subtle blueprint surface so the plan area always reads as a drawing canvas
                backgroundImage: 'radial-gradient(rgba(20,38,66,0.05) 1px, transparent 0)',
                backgroundSize: '22px 22px',
            }}>
                {/* Click surface + pins — width scales with the zoom control */}
                <Box id="drawing-canvas" onClick={onCanvasClick} sx={{
                position: 'relative',
                width: `${zoom}%`,
                margin: '0 auto',
                minHeight: 540,
                cursor: canCreateSnag ? 'crosshair' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'width 140ms ease',
            }}>
                {!drawingSource && (<Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, minHeight: 540, color: BRAND.muted }}>
                    <Box component="svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5a1 1 0 0 1 1-1h9l6 6v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M14 4v6h6"/></Box>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>No drawing revision to display</Typography>
                    <Typography sx={{ fontSize: 12 }}>{canManageDrawing ? 'Upload a revision to start plotting snags.' : 'Select a revision above.'}</Typography>
                  </Box>)}

                {drawingSource && isImageRevision(selectedRevision) && (<img src={drawingSource} alt={selectedRevision?.file_name} style={{ width: '100%', height: 'auto', display: 'block' }}/>)}

                {drawingSource && selectedRevision && !isImageRevision(selectedRevision) && (<iframe src={drawingSource} title={selectedRevision.file_name} style={{ width: '100%', height: 640, border: 0, backgroundColor: '#fff' }}/>)}

                {snags.map((snag, index) => (<Box key={snag.id} sx={{
                    position: 'absolute',
                    left: `${snag.pin_x * 100}%`,
                    top: `${snag.pin_y * 100}%`,
                    width: 32,
                    height: 32,
                    transform: 'translate(-50%, -50%)',
                    cursor: 'pointer',
                    transition: 'transform 120ms ease',
                    '&:hover': { transform: 'translate(-50%, -50%) scale(1.12)' },
                }} onClick={(event) => {
                    event.stopPropagation();
                    setSelectedSnagId(snag.id);
                }} title={`${snag.reference} - ${formatStatusLabel(snag.status)}`}>
                    <Box sx={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    background: snag.status === 'rejected' ? 'rgba(178,59,59,0.18)' : 'rgba(15,23,42,0.1)',
                }}/>
                    <Box sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: 27,
                    height: 27,
                    transform: 'translate(-50%, -50%)',
                    borderRadius: '50%',
                    background: statusPinColor(snag.status),
                    border: '2.5px solid #fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontFamily: FONT_MONO,
                    fontSize: 12,
                    fontWeight: 600,
                    lineHeight: 1,
                }}>
                      {index + 1}
                    </Box>
                  </Box>))}

                {pinDraft && (<Box sx={{
                    position: 'absolute',
                    left: `${pinDraft.x * 100}%`,
                    top: `${pinDraft.y * 100}%`,
                    width: 48,
                    height: 48,
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none',
                }}>
                    <Box sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: 48,
                    height: 48,
                    transform: 'translate(-50%, -50%)',
                    borderRadius: '50%',
                    border: `2px solid ${BRAND.teal}`,
                    opacity: 0.4,
                }}/>
                    <Box sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: 28,
                    height: 28,
                    transform: 'translate(-50%, -50%)',
                    borderRadius: '50%',
                    background: 'rgba(47,143,190,0.25)',
                    border: `2.5px dashed ${BRAND.teal}`,
                }}/>
                  </Box>)}
                </Box>

                {/* Breadcrumb chip (top-inline-start overlay) */}
                <Box sx={{
                position: 'absolute',
                top: 14,
                insetInlineStart: 14,
                zIndex: 2,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                p: '8px 12px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.94)',
                border: `1px solid ${BRAND.border}`,
                boxShadow: '0 4px 12px -6px rgba(20,38,66,0.3)',
                fontSize: 12,
                fontWeight: 600,
                color: BRAND.inkSoft,
            }}>
                  <Box component="span" sx={{ color: BRAND.navy }}>{buildingOptions.find((b) => b.id === drawing?.building_id)?.name ?? project?.name ?? 'Project'}</Box>
                  <Box component="span" sx={{ color: '#C4CCD8' }}>›</Box>
                  <Box component="span">{floorOptions.find((floor) => floor.id === drawing?.floor_id)?.name ?? 'All floors'}</Box>
                  <Box component="span" sx={{ color: '#C4CCD8' }}>›</Box>
                  <Box component="span">{drawing?.title ?? drawing?.code ?? 'Drawing'}</Box>
                </Box>

                {/* Zoom control (top-inline-end overlay) */}
                <Box sx={{
                position: 'absolute',
                top: 14,
                insetInlineEnd: 14,
                zIndex: 2,
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                p: '4px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.94)',
                border: `1px solid ${BRAND.border}`,
                boxShadow: '0 4px 12px -6px rgba(20,38,66,0.3)',
            }}>
                  <Box role="button" aria-label="Zoom out" tabIndex={0} onClick={() => setZoom((value) => Math.max(25, value - 10))} sx={{
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '7px',
                color: BRAND.inkSoft,
                fontSize: 16,
                cursor: 'pointer',
                userSelect: 'none',
            }}>−</Box>
                  <Box role="button" tabIndex={0} title="Reset zoom to 100%" onClick={() => setZoom(100)} sx={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600, color: BRAND.ink, px: '6px', cursor: 'pointer', direction: 'ltr', unicodeBidi: 'isolate' }}>{zoom}%</Box>
                  <Box role="button" aria-label="Zoom in" tabIndex={0} onClick={() => setZoom((value) => Math.min(400, value + 10))} sx={{
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '7px',
                color: BRAND.inkSoft,
                fontSize: 16,
                cursor: 'pointer',
                userSelect: 'none',
            }}>+</Box>
                </Box>

                {/* Legend (bottom-inline-start overlay) */}
                <Box sx={{
                position: 'absolute',
                bottom: 14,
                insetInlineStart: 14,
                zIndex: 2,
                display: 'flex',
                gap: '14px',
                p: '9px 14px',
                borderRadius: '11px',
                background: 'rgba(255,255,255,0.94)',
                border: `1px solid ${BRAND.border}`,
                boxShadow: '0 4px 12px -6px rgba(20,38,66,0.3)',
                flexWrap: 'wrap',
            }}>
                  {CANVAS_LEGEND.map((item) => (<Box key={item.label} sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 11, color: BRAND.inkSoft }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flex: 'none' }}/>
                      {item.label}
                    </Box>))}
                </Box>
              </Box>)}

            {compareMode && (<Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Typography variant="caption" color="text.secondary">
                    Left: {selectedRevision?.revision_label ?? '-'}
                  </Typography>
                  <Box sx={{
                position: 'relative',
                width: '100%',
                minHeight: 520,
                borderRadius: 2,
                overflow: 'hidden',
                backgroundColor: '#0F172A',
                mt: 0.5,
            }} onClick={onCanvasClick}>
                    {drawingSource && isImageRevision(selectedRevision) && (<img src={drawingSource} alt={selectedRevision?.file_name} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}/>)}

                    {drawingSource && selectedRevision && !isImageRevision(selectedRevision) && (<iframe src={drawingSource} title={selectedRevision.file_name} style={{ width: '100%', height: 620, border: 0, backgroundColor: '#fff' }}/>)}

                    {snags.map((snag) => (<Box key={snag.id} sx={{
                    position: 'absolute',
                    left: `${snag.pin_x * 100}%`,
                    top: `${snag.pin_y * 100}%`,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    transform: 'translate(-50%, -50%)',
                    border: '2px solid #FFF',
                    backgroundColor: statusPinColor(snag.status),
                    boxShadow: '0 0 0 3px rgba(15, 23, 42, 0.18)',
                    cursor: 'pointer',
                }} onClick={(event) => {
                    event.stopPropagation();
                    setSelectedSnagId(snag.id);
                }} title={`${snag.reference} - ${formatStatusLabel(snag.status)}`}/>))}

                    {pinDraft && (<Box sx={{
                    position: 'absolute',
                    left: `${pinDraft.x * 100}%`,
                    top: `${pinDraft.y * 100}%`,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    transform: 'translate(-50%, -50%)',
                    border: '2px dashed #F8FAFC',
                    backgroundColor: '#2F8FBE',
                    pointerEvents: 'none',
                }}/>)}
                  </Box>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <Typography variant="caption" color="text.secondary">
                    Right: {compareRevision?.revision_label ?? '-'}
                  </Typography>
                  <Box sx={{
                position: 'relative',
                width: '100%',
                minHeight: 520,
                borderRadius: 2,
                overflow: 'hidden',
                backgroundColor: '#0F172A',
                mt: 0.5,
            }}>
                    {compareSource && isImageRevision(compareRevision) && (<img src={compareSource} alt={compareRevision?.file_name} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}/>)}

                    {compareSource && compareRevision && !isImageRevision(compareRevision) && (<iframe src={compareSource} title={compareRevision.file_name} style={{ width: '100%', height: 620, border: 0, backgroundColor: '#fff' }}/>)}

                    {highlightChanges && diffOverlayUrl && isImageRevision(compareRevision) && (<img src={diffOverlayUrl} alt="Revision changes overlay" style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    opacity: 0.75,
                    pointerEvents: 'none',
                }}/>)}
                  </Box>
                </Grid>
              </Grid>)}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper sx={{ p: 2 }}>
            <Stack spacing={1}>
              <Typography variant="subtitle1" fontWeight={700}>
                Intelligence Panel
              </Typography>

              <Typography variant="body2" color="text.secondary">
                {!advancedToolsOpen
            ? 'Expand Advanced Tools to access comparison, pin migration, and barcode utilities.'
            : compareLoading
                ? 'Loading comparison metadata...'
                : 'Comparison, location suggestions, and migration actions.'}
              </Typography>

              {advancedToolsOpen && compareData?.mapping && (<Typography variant="caption" color="text.secondary">
                  Mapping: {compareData.mapping.direction} / {compareData.mapping.transform_type}
                </Typography>)}
            </Stack>

            {advancedToolsOpen && (<>
                <Divider sx={{ my: 2 }}/>

                <Stack spacing={1.2}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    Location Suggestions
                  </Typography>
                  {locationSuggestions.length === 0 && <Typography color="text.secondary">No pin suggestion yet.</Typography>}
                  {locationSuggestions.slice(0, 3).map((suggestion) => (<Paper key={`${suggestion.location_id}-${suggestion.source}`} variant="outlined" sx={{ p: 1 }}>
                      <Typography variant="body2" fontWeight={700}>
                        {suggestion.location_code ?? 'LOC'} - {suggestion.location_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {locationReasonLabel(suggestion.source)} | score {suggestion.score.toFixed(2)}
                      </Typography>
                    </Paper>))}
                </Stack>

                <Divider sx={{ my: 2 }}/>

                <Stack spacing={1}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    Pin Migration
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Source: {selectedRevision?.revision_label ?? '-'} | Target: {compareRevision?.revision_label ?? '-'}
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <Button variant="outlined" size="small" disabled={!selectedRevisionId || !compareRevisionId || migrationLoading} onClick={() => void runPinMigration(false)}>
                      Preview
                    </Button>
                    <Button variant="contained" size="small" disabled={!canManageDrawing || !selectedRevisionId || !compareRevisionId || migrationLoading} onClick={() => void runPinMigration(true)}>
                      Apply
                    </Button>
                  </Stack>

                  {migrationPreview && (<Paper variant="outlined" sx={{ p: 1 }}>
                      <Typography variant="body2">
                        {migrationPreview.processed_count}/{migrationPreview.total_candidates} pins processed
                        {migrationPreview.truncated ? ' (truncated)' : ''}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Transform {migrationPreview.mapping.transform_type} ({migrationPreview.mapping.direction})
                      </Typography>
                    </Paper>)}
                </Stack>
              </>)}
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} mb={2}>
          <TextField fullWidth size="small" label="Search snags" value={search} onChange={(event) => setSearch(event.target.value)}/>

          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="status-filter-label">Status</InputLabel>
            <Select labelId="status-filter-label" label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="new">{formatStatusLabel('new')}</MenuItem>
              <MenuItem value="assigned">{formatStatusLabel('assigned')}</MenuItem>
              <MenuItem value="in_progress">{formatStatusLabel('in_progress')}</MenuItem>
              <MenuItem value="ready_for_review">{formatStatusLabel('ready_for_review')}</MenuItem>
              <MenuItem value="closed">{formatStatusLabel('closed')}</MenuItem>
              <MenuItem value="rejected">{formatStatusLabel('rejected')}</MenuItem>
            </Select>
          </FormControl>

            <FormControl size="small" sx={{ minWidth: 260 }}>
              <InputLabel id="location-filter-label">Location</InputLabel>
            <Select labelId="location-filter-label" label="Location" value={locationSelectValue} onChange={(event) => {
            const value = String(event.target.value);
            setLocationFilter(value);
            updateSearchParams({ location_id: value || null });
        }}>
              <MenuItem value="">All locations</MenuItem>
              {locationOptions.map((location) => (<MenuItem key={location.id} value={location.id}>
                  {location.code} - {location.name}
                </MenuItem>))}
            </Select>
          </FormControl>
        </Stack>

        <Accordion expanded={advancedBulkOpen} onChange={(_, expanded) => setAdvancedBulkOpen(expanded)} sx={{ mb: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="subtitle2" fontWeight={700}>
                Advanced Snag Actions
              </Typography>
              <Chip size="small" color="primary" label={`${selectedSnagIds.length} ${t('bulk.selected')}`}/>
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={1.2}>
              <Grid size={{ xs: 12, md: 3 }}>
                <FormControl fullWidth size="small" disabled={!canBulkAssign}>
                  <InputLabel id="bulk-assignee-label">Assignee</InputLabel>
                  <Select labelId="bulk-assignee-label" label="Assignee" value={bulkAssigneeId} onChange={(event) => setBulkAssigneeId(event.target.value ? Number(event.target.value) : '')}>
                    <MenuItem value="">Keep current</MenuItem>
                    {members.map((member) => (<MenuItem key={member.id} value={member.id}>
                        {member.name}
                      </MenuItem>))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid size={{ xs: 12, md: 3 }}>
                <TextField size="small" fullWidth type="date" label="Due Date" InputLabelProps={{ shrink: true }} value={bulkDueDate} onChange={(event) => setBulkDueDate(event.target.value)} disabled={!canBulkUpdateDueDate}/>
              </Grid>

              <Grid size={{ xs: 12, md: 2 }}>
                <Button fullWidth variant="contained" onClick={() => void runBulkUpdate()} disabled={selectedSnagIds.length === 0 || bulkBusy || (!canBulkAssign && !canBulkUpdateDueDate)}>
                  {bulkBusy ? 'Working...' : t('bulk.assign')}
                </Button>
              </Grid>

              <Grid size={{ xs: 12, md: 2 }}>
                <FormControl fullWidth size="small">
                  <InputLabel id="bulk-export-type">Export</InputLabel>
                  <Select labelId="bulk-export-type" label="Export" value={bulkExportType} onChange={(event) => setBulkExportType(event.target.value)}>
                    <MenuItem value="csv">CSV</MenuItem>
                    <MenuItem value="xlsx">XLSX</MenuItem>
                    <MenuItem value="pdf">PDF</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid size={{ xs: 12, md: 2 }}>
                <Button fullWidth variant="outlined" onClick={() => void runBulkExport()} disabled={selectedSnagIds.length === 0 || bulkBusy || !canBulkExport}>
                  {t('bulk.export')}
                </Button>
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        <DataGrid autoHeight rows={snags} columns={gridColumns} loading={loading} checkboxSelection disableRowSelectionOnClick onRowSelectionModelChange={(selection) => setSelectedSnagIds(Array.from(selection.ids)
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value)))} pageSizeOptions={[10, 20, 50]} onRowClick={(params) => setSelectedSnagId(params.row.id)} sx={{ border: 0 }}/>
      </Paper>

      {drawing && (<CreateSnagDialog open={createDialogOpen} drawing={drawing} revision={selectedRevision} locationOptions={locationOptions} rootCauseCategories={rootCauseCategories} members={members} companies={companies} teams={teams} canAssign={projectPermissions.includes('snags.assign')} canManageToc={projectPermissions.includes('toc.manage')} pin={pinDraft} suggestedLocation={suggestedLocation} onClose={() => {
                setCreateDialogOpen(false);
                setPinDraft(null);
                setLocationSuggestions([]);
                setSuggestedLocation(null);
            }} onCreate={createSnag}/>)}

      <SnagDrawer snagId={selectedSnagId} members={members} companies={companies} teams={teams} canTransition={projectPermissions.includes('snags.transition')} canAssign={projectPermissions.includes('snags.assign')} canComment={projectPermissions.includes('snags.comment')} canAttach={projectPermissions.includes('snags.attach')} canCloseoutView={projectPermissions.includes('closeout.instances.view')} canCloseoutUpdate={projectPermissions.includes('closeout.instances.update')} canCloseoutReview={projectPermissions.includes('closeout.review')} onClose={() => setSelectedSnagId(null)} onChanged={async () => {
            if (selectedDrawingId) {
                await loadSnags(selectedDrawingId, selectedRevisionId);
            }
        }}/>
    </Stack>);
};
