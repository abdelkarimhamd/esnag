import { Alert, Box, Button, Chip, CircularProgress, Grid, Paper, Stack, Typography } from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { SnagForm } from '../components/SnagForm';
import { PageHero } from '../components/ui/PageHero';
import { useAuth } from '../hooks/useAuth';
import { normalizeApiError } from '../utils/apiError';
import { BRAND, FONT_MONO } from '../theme';

const isImageRevision = (revision) => Boolean(revision?.mime_type?.startsWith('image/'));
const locationReasonLabel = (source) => {
  if (source === 'zone_inside') return 'inside mapped zone';
  if (source === 'zone_nearest') return 'nearest mapped zone';
  return 'floor fallback';
};

// Full-page "New snag" flow (replaces the old modal). Reached from the drawing
// canvas (?drawing_id&revision_id&pin_x&pin_y): shows the plan with the pin on the
// left and the SnagForm on the right. The pin can be repositioned by clicking the
// plan. On submit it POSTs the snag + uploads photos, then returns to the viewer.
export const CreateSnagPage = () => {
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { permissions, resolveProjectPermissions } = useAuth();

  const drawingId = Number(searchParams.get('drawing_id') || '') || null;
  const revisionId = Number(searchParams.get('revision_id') || '') || null;

  const [project, setProject] = useState(null);
  const [drawing, setDrawing] = useState(null);
  const [members, setMembers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [teams, setTeams] = useState([]);
  const [rootCauseCategories, setRootCauseCategories] = useState([]);
  const [projectPermissions, setProjectPermissions] = useState(permissions);
  const [pin, setPin] = useState(() => {
    const x = Number(searchParams.get('pin_x'));
    const y = Number(searchParams.get('pin_y'));
    return Number.isFinite(x) && Number.isFinite(y) && searchParams.get('pin_x') ? { x, y } : null;
  });
  const [suggestedLocation, setSuggestedLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const canCreateSnag = projectPermissions.includes('snags.create');
  const canAssign = projectPermissions.includes('snags.assign');
  const canManageToc = projectPermissions.includes('toc.manage');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!projectId) {
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const [projectResponse, drawingResponse] = await Promise.all([
          api.get(`/api/projects/${projectId}`),
          drawingId ? api.get(`/api/drawings/${drawingId}`) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setProject(projectResponse.data.data);
        setDrawing(drawingResponse ? drawingResponse.data.data : null);
        const [membersResponse, companiesResponse, teamsResponse] = await Promise.all([
          api.get('/api/organizations/members', { params: { project_id: projectId } }),
          api.get('/api/stakeholders/companies', { params: { project_id: projectId } }),
          api.get('/api/stakeholders/teams', { params: { project_id: projectId } }),
        ]);
        if (cancelled) return;
        setMembers(membersResponse.data.data ?? []);
        setCompanies(companiesResponse.data.data ?? []);
        setTeams(teamsResponse.data.data ?? []);
        try {
          const rcc = await api.get('/api/root-cause-categories');
          if (!cancelled) setRootCauseCategories(rcc.data.data ?? []);
        }
        catch { if (!cancelled) setRootCauseCategories([]); }
      }
      catch (requestError) {
        if (!cancelled) setError(normalizeApiError(requestError, 'Unable to load the snag form.'));
      }
      finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [projectId, drawingId]);

  // Project-scoped permissions (snags.create / snags.assign / toc.manage).
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const scoped = await resolveProjectPermissions(Number(projectId));
        if (!cancelled) setProjectPermissions(scoped.length > 0 ? scoped : permissions);
      }
      catch { if (!cancelled) setProjectPermissions(permissions); }
    };
    void run();
    return () => { cancelled = true; };
  }, [projectId, permissions, resolveProjectPermissions]);

  const selectedRevision = useMemo(() => {
    const revisions = drawing?.revisions ?? [];
    return revisions.find((rev) => rev.id === revisionId)
      ?? revisions.find((rev) => rev.id === drawing?.current_revision_id)
      ?? revisions[0]
      ?? null;
  }, [drawing, revisionId]);

  const locationOptions = useMemo(() => {
    if (!project || !drawing?.building_id || !drawing?.floor_id) {
      return [];
    }
    const floor = project.buildings
      ?.find((building) => building.id === drawing.building_id)
      ?.floors?.find((item) => item.id === drawing.floor_id);
    return floor?.locations ?? [];
  }, [project, drawing?.building_id, drawing?.floor_id]);

  const drawingSource = selectedRevision ? `/api/drawing-revisions/${selectedRevision.id}/file` : null;

  // Ask the server which mapped location the pin falls in (zone → location).
  const suggestForPin = useCallback(async (nextPin) => {
    if (!drawing || !nextPin) {
      setSuggestedLocation(null);
      return;
    }
    try {
      const response = await api.get(`/api/drawings/${drawing.id}/location-suggestions`, {
        params: { pin_x: nextPin.x, pin_y: nextPin.y, revision_id: selectedRevision?.id ?? undefined, limit: 5 },
      });
      const best = response.data.data.suggestions?.[0];
      setSuggestedLocation(best ? { location_id: best.location_id, reason: locationReasonLabel(best.source) } : null);
    }
    catch {
      setSuggestedLocation(null);
    }
  }, [drawing, selectedRevision?.id]);

  useEffect(() => {
    if (drawing && pin) {
      void suggestForPin(pin);
    }
    // Only re-run when the drawing loads; pin changes trigger suggestForPin directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing?.id]);

  const onPlanClick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Number(((event.clientX - rect.left) / rect.width).toFixed(6));
    const y = Number(((event.clientY - rect.top) / rect.height).toFixed(6));
    const nextPin = { x, y };
    setPin(nextPin);
    void suggestForPin(nextPin);
  };

  const backToViewer = useCallback(() => {
    if (drawingId) {
      const query = selectedRevision ? `?revision_id=${selectedRevision.id}` : '';
      navigate(`/projects/${projectId}/drawings/${drawingId}${query}`);
    }
    else {
      navigate(`/projects/${projectId}`);
    }
  }, [drawingId, navigate, projectId, selectedRevision]);

  const submitSnag = useCallback(async (payload) => {
    if (!drawing || !project) {
      return;
    }
    const location = locationOptions.find((item) => item.id === payload.location_id);
    const floor = project.buildings
      ?.find((building) => building.id === (payload.building_id ?? drawing.building_id))
      ?.floors?.find((item) => item.id === (location?.floor_id ?? drawing.floor_id));
    const response = await api.post('/api/snags', {
      project_id: project.id,
      drawing_id: drawing.id,
      drawing_revision_id: selectedRevision?.id ?? drawing.current_revision_id,
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
    const createdSnag = response.data?.data;
    const photos = Array.isArray(payload.photos) ? payload.photos : [];
    if (createdSnag?.id && photos.length > 0) {
      for (const file of photos) {
        const form = new FormData();
        form.append('type', 'photo');
        form.append('file', file);
        try { await api.post(`/api/snags/${createdSnag.id}/attachments`, form); }
        catch { /* photo upload best-effort; the snag is already created */ }
      }
    }
    backToViewer();
  }, [backToViewer, drawing, locationOptions, project, selectedRevision]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Stack spacing={2}>
        <Alert severity="error">{error.message}</Alert>
        <Button variant="outlined" onClick={backToViewer} sx={{ alignSelf: 'flex-start' }}>Back</Button>
      </Stack>
    );
  }

  if (!drawing) {
    return (
      <Stack spacing={2}>
        <Alert severity="info">Open a drawing and click on the plan to raise a snag at that point.</Alert>
        <Button component={RouterLink} to={`/projects/${projectId}`} variant="outlined" sx={{ alignSelf: 'flex-start' }}>Go to project</Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <PageHero
        title="New snag"
        description="Confirm the pin location on the plan, then complete the snag details."
        badges={(
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" variant="outlined" label={`Drawing ${drawing.code ?? drawing.title ?? '-'}`} />
            <Chip size="small" variant="outlined" label={`Revision ${selectedRevision?.revision_label ?? 'Current'}`} />
            <Chip size="small" variant="outlined" sx={{ fontFamily: FONT_MONO }} label={pin ? `Pin ${Math.round(pin.x * 100)}%, ${Math.round(pin.y * 100)}%` : 'No pin'} />
          </Stack>
        )}
        actions={<Button variant="outlined" onClick={backToViewer}>Back to drawing</Button>}
      />

      {!canCreateSnag && <Alert severity="warning">You need the snags.create permission to raise a snag on this project.</Alert>}

      <Grid container spacing={2}>
        {/* Plan preview with the pin */}
        <Grid size={{ xs: 12, lg: 7 }}>
          <Paper sx={{ p: 1.5, position: 'sticky', top: 8 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.04em' }}>
              CLICK THE PLAN TO MOVE THE PIN
            </Typography>
            <Box
              onClick={onPlanClick}
              sx={{
                position: 'relative',
                mt: 1,
                width: '100%',
                minHeight: 420,
                maxHeight: 640,
                overflow: 'auto',
                borderRadius: '14px',
                border: `1px solid ${BRAND.border}`,
                bgcolor: '#FBFCFE',
                backgroundImage: 'radial-gradient(rgba(20,38,66,0.05) 1px, transparent 0)',
                backgroundSize: '22px 22px',
                cursor: 'crosshair',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {drawingSource && isImageRevision(selectedRevision) && (
                <Box component="img" src={drawingSource} alt={selectedRevision?.file_name ?? drawing.code} sx={{ width: '100%', height: 'auto', display: 'block' }} />
              )}
              {drawingSource && selectedRevision && !isImageRevision(selectedRevision) && (
                <Box component="iframe" src={drawingSource} title={selectedRevision.file_name} sx={{ width: '100%', height: 620, border: 0, backgroundColor: '#fff' }} />
              )}
              {!drawingSource && (
                <Typography sx={{ color: BRAND.muted, fontSize: 13, py: 6 }}>No revision to display — you can still fill the form.</Typography>
              )}
              {pin && (
                <Box sx={{ position: 'absolute', left: `${pin.x * 100}%`, top: `${pin.y * 100}%`, width: 30, height: 30, transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>
                  <Box sx={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2.5px solid #fff`, background: BRAND.teal, boxShadow: '0 0 0 3px rgba(47,143,190,0.35)' }} />
                </Box>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Form */}
        <Grid size={{ xs: 12, lg: 5 }}>
          <Paper sx={{ p: 2 }}>
            <SnagForm
              drawing={drawing}
              locationOptions={locationOptions}
              rootCauseCategories={rootCauseCategories}
              members={members}
              companies={companies}
              teams={teams}
              canAssign={canAssign}
              canManageToc={canManageToc}
              pin={pin}
              suggestedLocation={suggestedLocation}
              onSubmit={submitSnag}
              onCancel={backToViewer}
            />
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
};
