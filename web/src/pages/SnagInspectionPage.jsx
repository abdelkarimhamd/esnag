import { Alert, Autocomplete, Box, Button, Chip, CircularProgress, Divider, FormControl, Grid, IconButton, InputLabel, MenuItem, Paper, Select, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { PageHero } from '../components/ui/PageHero';
import { useAuth } from '../hooks/useAuth';
import { formatStatusLabel, snagStatusChipColor } from '../utils/ui';
import { normalizeApiError } from '../utils/apiError';
import { BRAND, FONT_MONO, severityStyle } from '../theme';

const CONDITION_OPTIONS = [
  { value: 'pending', label: 'Pending inspection' },
  { value: 'operational', label: 'Operational' },
  { value: 'needs_maintenance', label: 'Needs maintenance' },
  { value: 'under_maintenance', label: 'Under maintenance' },
  { value: 'out_of_service', label: 'Out of service' },
  { value: 'resolved', label: 'Resolved' },
];
const conditionLabel = (value) => CONDITION_OPTIONS.find((c) => c.value === value)?.label ?? value ?? '—';
const InfoRow = ({ label, children }) => (
  <Box sx={{ display: 'flex', gap: 1, py: 0.4 }}>
    <Box sx={{ width: 120, flex: 'none', fontSize: 11.5, color: BRAND.muted, fontWeight: 700, letterSpacing: '0.02em', pt: '2px' }}>{label}</Box>
    <Box sx={{ fontSize: 13, color: BRAND.ink, minWidth: 0 }}>{children ?? '—'}</Box>
  </Box>
);

// "Inspect the snag" (BR-FR-019/023): shows the snag + request-to-inspect context and
// records a snag inspection — asset (Equipment select-or-create), condition status,
// maintenance owner and multi photo/document evidence.
export const SnagInspectionPage = () => {
  const { snagId } = useParams();
  const navigate = useNavigate();
  const { permissions, resolveProjectPermissions } = useAuth();

  const [snag, setSnag] = useState(null);
  const [equipment, setEquipment] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [teams, setTeams] = useState([]);
  const [members, setMembers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [projectPermissions, setProjectPermissions] = useState(permissions);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  // Form state
  const [status, setStatus] = useState('operational');
  const [assetValue, setAssetValue] = useState(null); // Equipment object or typed string
  const [ownerType, setOwnerType] = useState('none'); // none | company | team | user
  const [ownerId, setOwnerId] = useState('');
  const [notes, setNotes] = useState('');
  const [requestId, setRequestId] = useState('');
  const [photos, setPhotos] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  // Request-an-inspection form (assign a responsible team/person)
  const [reqTitle, setReqTitle] = useState('');
  const [reqTeamId, setReqTeamId] = useState('');
  const [reqUserId, setReqUserId] = useState('');
  const [requesting, setRequesting] = useState(false);

  const canInspect = projectPermissions.includes('snags.comment');
  const projectId = snag?.project_id ?? null;

  const loadRequests = useCallback(async () => {
    if (!snagId) return;
    try {
      const response = await api.get(`/api/snags/${snagId}/inspection-requests`);
      setRequests(response.data.data ?? []);
    }
    catch { setRequests([]); }
  }, [snagId]);

  const createRequest = async () => {
    if (!reqTeamId && !reqUserId) {
      setError({ message: 'Assign the inspection request to a team or a person.' });
      return;
    }
    setRequesting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await api.post(`/api/snags/${snagId}/inspection-requests`, {
        title: reqTitle.trim() || undefined,
        stakeholder_team_id: reqTeamId ? Number(reqTeamId) : undefined,
        assigned_to: reqUserId ? Number(reqUserId) : undefined,
      });
      setReqTitle('');
      setReqTeamId('');
      setReqUserId('');
      await loadRequests();
      setMessage(`Inspection requested (${response.data.data.reference}) — the assigned team can now inspect.`);
    }
    catch (requestError) {
      setError(normalizeApiError(requestError, 'Unable to request the inspection.'));
    }
    finally {
      setRequesting(false);
    }
  };

  const loadInspections = useCallback(async () => {
    if (!snagId) return;
    try {
      const response = await api.get(`/api/snags/${snagId}/inspections`);
      setInspections(response.data.data ?? []);
    }
    catch { setInspections([]); }
  }, [snagId]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const snagResponse = await api.get(`/api/snags/${snagId}`);
        if (cancelled) return;
        const loadedSnag = snagResponse.data.data;
        setSnag(loadedSnag);
        const pid = loadedSnag.project_id;
        const [eq, comp, tm, mem] = await Promise.all([
          api.get('/api/equipment', { params: { project_id: pid, per_page: 200 } }).catch(() => ({ data: { data: [] } })),
          api.get('/api/stakeholders/companies', { params: { project_id: pid } }).catch(() => ({ data: { data: [] } })),
          api.get('/api/stakeholders/teams', { params: { project_id: pid } }).catch(() => ({ data: { data: [] } })),
          api.get('/api/organizations/members', { params: { project_id: pid } }).catch(() => ({ data: { data: [] } })),
        ]);
        if (cancelled) return;
        setEquipment(eq.data.data ?? []);
        setCompanies(comp.data.data ?? []);
        setTeams(tm.data.data ?? []);
        setMembers(mem.data.data ?? []);
        await loadRequests();
        await loadInspections();
      }
      catch (requestError) {
        if (!cancelled) setError(normalizeApiError(requestError, 'Unable to load the snag inspection.'));
      }
      finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [snagId, loadInspections, loadRequests]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void resolveProjectPermissions(Number(projectId))
      .then((scoped) => { if (!cancelled) setProjectPermissions(scoped.length > 0 ? scoped : permissions); })
      .catch(() => { if (!cancelled) setProjectPermissions(permissions); });
    return () => { cancelled = true; };
  }, [projectId, permissions, resolveProjectPermissions]);

  const ownerOptions = useMemo(() => {
    if (ownerType === 'company') return companies.map((c) => ({ id: c.id, label: c.name }));
    if (ownerType === 'team') return teams.map((t) => ({ id: t.id, label: t.name }));
    if (ownerType === 'user') return members.map((m) => ({ id: m.id, label: m.name }));
    return [];
  }, [ownerType, companies, teams, members]);

  const selectedRequest = useMemo(() => requests.find((r) => String(r.id) === String(requestId)) ?? null, [requests, requestId]);

  const resetForm = () => {
    setStatus('operational');
    setAssetValue(null);
    setOwnerType('none');
    setOwnerId('');
    setNotes('');
    setRequestId('');
    setPhotos([]);
    setDocuments([]);
  };

  const submit = async () => {
    if (!snag || !canInspect) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const payload = { status, notes: notes.trim() || undefined };
      if (assetValue && typeof assetValue === 'object') {
        payload.equipment_id = assetValue.id;
      }
      else if (typeof assetValue === 'string' && assetValue.trim()) {
        payload.asset_name = assetValue.trim();
        payload.create_asset = true;
      }
      if (ownerType === 'company' && ownerId) payload.maintenance_company_id = Number(ownerId);
      if (ownerType === 'team' && ownerId) payload.maintenance_team_id = Number(ownerId);
      if (ownerType === 'user' && ownerId) payload.maintenance_user_id = Number(ownerId);
      if (requestId) payload.inspection_request_id = Number(requestId);

      const response = await api.post(`/api/snags/${snag.id}/inspections`, payload);
      const created = response.data.data;

      const files = [...photos.map((f) => ({ file: f, type: 'photo' })), ...documents.map((f) => ({ file: f, type: 'document' }))];
      let uploadFailed = false;
      for (const { file, type } of files) {
        const form = new FormData();
        form.append('type', type);
        form.append('file', file);
        try { await api.post(`/api/snag-inspections/${created.id}/attachments`, form); }
        catch { uploadFailed = true; }
      }
      await loadInspections();
      await loadRequests();
      resetForm();
      setMessage(uploadFailed
        ? `Inspection ${created.reference} recorded, but one or more files failed to upload.`
        : `Inspection ${created.reference} recorded.`);
    }
    catch (requestError) {
      setError(normalizeApiError(requestError, 'Unable to record the inspection.'));
    }
    finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;
  }
  if (error && !snag) {
    return (
      <Stack spacing={2}>
        <Alert severity="error">{error.message}</Alert>
        <Button variant="outlined" onClick={() => navigate(-1)} sx={{ alignSelf: 'flex-start' }}>Back</Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error.message}</Alert>}
      {message && <Alert severity="success" onClose={() => setMessage(null)}>{message}</Alert>}

      <PageHero
        title="Inspect snag"
        description="Record an on-site inspection of the asset behind this snag — condition, responsible maintainer and evidence."
        badges={snag && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" variant="outlined" sx={{ fontFamily: FONT_MONO }} label={snag.reference} />
            <Chip size="small" color={snagStatusChipColor(snag.status)} label={formatStatusLabel(snag.status)} />
          </Stack>
        )}
        actions={<Button variant="outlined" onClick={() => navigate(-1)}>Back</Button>}
      />

      <Grid container spacing={2}>
        {/* Context: snag + request */}
        <Grid size={{ xs: 12, lg: 5 }}>
          <Stack spacing={2}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Snag information</Typography>
              <InfoRow label="Reference"><Box component="span" sx={{ fontFamily: FONT_MONO }}>{snag.reference}</Box></InfoRow>
              <InfoRow label="Title">{snag.title}</InfoRow>
              <InfoRow label="Status"><Chip size="small" color={snagStatusChipColor(snag.status)} label={formatStatusLabel(snag.status)} /></InfoRow>
              <InfoRow label="Severity"><Chip size="small" label={severityStyle(snag.severity).label} sx={{ background: severityStyle(snag.severity).tint, color: severityStyle(snag.severity).text, fontWeight: 700 }} /></InfoRow>
              <InfoRow label="Type">{snag.snag_type === 'operational' ? 'Operational' : 'Construction'}</InfoRow>
              <InfoRow label="Location">{[snag.building?.name, snag.floor?.name, snag.location?.name].filter(Boolean).join(' · ') || snag.location_text || '—'}</InfoRow>
              <InfoRow label="Assignee">{snag.assignee?.name ?? snag.assigned_company?.name ?? 'Unassigned'}</InfoRow>
              {snag.equipment && <InfoRow label="Linked asset">{snag.equipment.name}</InfoRow>}
              {snag.description && <InfoRow label="Description">{snag.description}</InfoRow>}
            </Paper>

            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Request an inspection</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                Assign a responsible team or person; they receive the request, then record the inspection below.
              </Typography>
              <Stack spacing={1.5}>
                <TextField size="small" label="What to inspect (optional)" value={reqTitle} onChange={(e) => setReqTitle(e.target.value)} placeholder="e.g. Rooftop AHU condition" fullWidth />
                <FormControl size="small" fullWidth>
                  <InputLabel id="req-team">Assign team</InputLabel>
                  <Select labelId="req-team" label="Assign team" value={reqTeamId} onChange={(e) => setReqTeamId(e.target.value)}>
                    <MenuItem value="">None</MenuItem>
                    {teams.map((t) => <MenuItem key={t.id} value={String(t.id)}>{t.name}</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel id="req-user">Assign person</InputLabel>
                  <Select labelId="req-user" label="Assign person" value={reqUserId} onChange={(e) => setReqUserId(e.target.value)}>
                    <MenuItem value="">None</MenuItem>
                    {members.map((m) => <MenuItem key={m.id} value={String(m.id)}>{m.name}</MenuItem>)}
                  </Select>
                </FormControl>
                <Button variant="outlined" size="small" onClick={() => void createRequest()} disabled={requesting || !canInspect || (!reqTeamId && !reqUserId)} sx={{ alignSelf: 'flex-start' }}>
                  {requesting ? 'Requesting…' : 'Request inspection'}
                </Button>
              </Stack>

              <Divider sx={{ my: 1.75 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Received requests ({requests.length})</Typography>
              {requests.length === 0 ? (
                <Typography variant="caption" color="text.secondary">No inspection requested yet.</Typography>
              ) : (
                <Stack spacing={1} divider={<Divider flexItem />}>
                  {requests.map((r) => {
                    const done = r.status === 'completed' || r.status === 'cancelled';
                    const answering = String(requestId) === String(r.id);
                    return (
                      <Box key={r.id}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                          <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700, color: BRAND.navy }}>{r.reference}</Box>
                          <Chip size="small" variant="outlined" label={formatStatusLabel(r.status)} color={r.status === 'completed' ? 'success' : 'default'} />
                          <Box sx={{ flex: 1 }} />
                          {!done && (
                            <Button size="small" variant={answering ? 'contained' : 'text'} onClick={() => setRequestId(answering ? '' : String(r.id))}>
                              {answering ? 'Answering ✓' : 'Do this inspection'}
                            </Button>
                          )}
                        </Stack>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.3 }}>
                          {r.title} · assigned to {r.team?.name ?? r.assignee?.name ?? 'unassigned'}
                          {r.requester?.name ? ` · by ${r.requester.name}` : ''}
                        </Typography>
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </Paper>
          </Stack>
        </Grid>

        {/* Inspection form */}
        <Grid size={{ xs: 12, lg: 7 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>New inspection</Typography>
            {!canInspect && <Alert severity="warning" sx={{ mb: 2 }}>You need snag comment permission on this project to record an inspection.</Alert>}

            <Stack spacing={2}>
              {selectedRequest && (
                <Alert severity="info" sx={{ py: 0.5 }} onClose={() => setRequestId('')}>
                  Answering request <b>{selectedRequest.reference}</b>
                  {selectedRequest.team?.name || selectedRequest.assignee?.name ? ` (assigned to ${selectedRequest.team?.name ?? selectedRequest.assignee?.name})` : ''} — recording will complete it.
                </Alert>
              )}
              <FormControl fullWidth size="small">
                <InputLabel id="status-label">Status / condition</InputLabel>
                <Select labelId="status-label" label="Status / condition" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {CONDITION_OPTIONS.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
                </Select>
              </FormControl>

              <Autocomplete
                freeSolo
                size="small"
                options={equipment}
                value={assetValue}
                getOptionLabel={(option) => (typeof option === 'string' ? option : (option?.name ?? ''))}
                isOptionEqualToValue={(option, value) => option?.id === value?.id}
                onChange={(_, value) => setAssetValue(value)}
                onInputChange={(_, value, reason) => { if (reason === 'input') setAssetValue(value); }}
                renderOption={(props, option) => (
                  <li {...props} key={option.id}>{option.code ? `${option.code} · ` : ''}{option.name}</li>
                )}
                renderInput={(params) => (
                  <TextField {...params} label="Asset name" placeholder="Select an asset or type a new name" helperText="Pick an existing asset, or type a new name to register it." />
                )}
              />

              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.04em' }}>MAINTENANCE RESPONSIBLE</Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 0.5 }}>
                  <ToggleButtonGroup exclusive size="small" value={ownerType} onChange={(_, v) => { if (v) { setOwnerType(v); setOwnerId(''); } }}>
                    <ToggleButton value="none">None</ToggleButton>
                    <ToggleButton value="company">Company</ToggleButton>
                    <ToggleButton value="team">Team</ToggleButton>
                    <ToggleButton value="user">Person</ToggleButton>
                  </ToggleButtonGroup>
                  {ownerType !== 'none' && (
                    <FormControl size="small" sx={{ minWidth: 200, flex: 1 }}>
                      <InputLabel id="owner-label">{ownerType === 'company' ? 'Company' : ownerType === 'team' ? 'Team' : 'Person'}</InputLabel>
                      <Select labelId="owner-label" label={ownerType} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                        <MenuItem value="">Select…</MenuItem>
                        {ownerOptions.map((o) => <MenuItem key={o.id} value={String(o.id)}>{o.label}</MenuItem>)}
                      </Select>
                    </FormControl>
                  )}
                </Stack>
              </Box>

              <TextField label="Notes / findings" value={notes} onChange={(e) => setNotes(e.target.value)} multiline minRows={3} fullWidth size="small" placeholder="What was found on inspection…" />

              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.04em' }}>PHOTOS &amp; DOCUMENTS</Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap' }} useFlexGap>
                  <Button component="label" variant="outlined" size="small" sx={{ textTransform: 'none' }}>
                    Add photos
                    <input type="file" accept="image/*" multiple hidden onChange={(e) => { setPhotos((p) => [...p, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} />
                  </Button>
                  <Button component="label" variant="outlined" size="small" sx={{ textTransform: 'none' }}>
                    Add documents
                    <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" multiple hidden onChange={(e) => { setDocuments((d) => [...d, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} />
                  </Button>
                </Stack>
                {(photos.length > 0 || documents.length > 0) && (
                  <Stack spacing={0.5} sx={{ mt: 1 }}>
                    {[...photos.map((f) => ({ f, kind: 'photo' })), ...documents.map((f) => ({ f, kind: 'document' }))].map((entry, index) => (
                      <Box key={`${entry.kind}-${index}-${entry.f.name}`} sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 12.5 }}>
                        <Chip size="small" label={entry.kind} variant="outlined" />
                        <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.f.name}</Box>
                        <IconButton size="small" onClick={() => { if (entry.kind === 'photo') setPhotos((p) => p.filter((_, i) => i !== index)); else setDocuments((d) => d.filter((_, i) => i !== (index - photos.length))); }}>
                          <CloseRoundedIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Box>
                    ))}
                  </Stack>
                )}
              </Box>

              <Button variant="contained" onClick={() => void submit()} disabled={!canInspect || submitting} sx={{ alignSelf: 'flex-start' }}>
                {submitting ? 'Recording…' : 'Record inspection'}
              </Button>
            </Stack>
          </Paper>

          {/* Past inspections */}
          <Paper sx={{ p: 2, mt: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Inspection history ({inspections.length})</Typography>
            {inspections.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No inspections recorded yet.</Typography>
            ) : (
              <Stack spacing={1.5} divider={<Divider flexItem />}>
                {inspections.map((inspection) => (
                  <Box key={inspection.id}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Box component="span" sx={{ fontFamily: FONT_MONO, fontSize: 12, color: BRAND.navy, fontWeight: 700 }}>{inspection.reference}</Box>
                      <Chip size="small" variant="outlined" label={conditionLabel(inspection.status)} />
                      {inspection.equipment?.name && <Chip size="small" label={inspection.equipment.name} />}
                      <Box sx={{ flex: 1 }} />
                      <Typography variant="caption" color="text.secondary">{inspection.inspector?.name} · {new Date(inspection.inspected_at ?? inspection.created_at).toLocaleString()}</Typography>
                    </Stack>
                    {inspection.asset_name && !inspection.equipment && <Typography variant="body2" sx={{ mt: 0.5 }}>Asset: {inspection.asset_name}</Typography>}
                    {(inspection.maintenance_company?.name || inspection.maintenance_team?.name || inspection.maintenance_user?.name) && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.3 }}>
                        Maintenance: {inspection.maintenance_company?.name ?? inspection.maintenance_team?.name ?? inspection.maintenance_user?.name}
                      </Typography>
                    )}
                    {inspection.notes && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{inspection.notes}</Typography>}
                    {(inspection.attachments ?? []).length > 0 && (
                      <Stack direction="row" spacing={1} sx={{ mt: 0.8, flexWrap: 'wrap' }} useFlexGap>
                        {inspection.attachments.map((att) => (
                          <Chip key={att.id} size="small" variant="outlined" label={`${att.type === 'photo' ? '🖼' : '📄'} ${att.file_name}`} component="a" href={`/api/snag-inspection-attachments/${att.id}/download`} target="_blank" clickable />
                        ))}
                      </Stack>
                    )}
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
};
