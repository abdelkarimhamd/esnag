import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Dialog, DialogActions, DialogContent, FormControl, IconButton, MenuItem, Select, Stack, Switch, TextField, Typography } from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { BRAND, FONT_MONO } from '../theme';
import { SectionLabel } from './ui/Mono';

// Field label above each input: mono, uppercase, letter-spaced (frame-1f spec).
const FieldLabel = ({ children }) => (
  <SectionLabel sx={{ fontSize: 10, letterSpacing: '0.1em', color: BRAND.muted, mb: '7px' }}>{children}</SectionLabel>
);

const selectSx = {
  borderRadius: '10px',
  fontSize: 13,
  '& .MuiOutlinedInput-notchedOutline': { borderColor: BRAND.borderStrong },
  '& .MuiSelect-select': { p: '10px 13px' },
};
const inputSx = {
  fontSize: 13,
  borderRadius: '10px',
  '& input': { p: '11px 13px' },
  '& fieldset': { borderColor: BRAND.borderStrong },
};

const PRIORITY_ORDER = ['low', 'medium', 'high', 'critical'];
const PRIORITY_LABEL = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };

// Severity axis (BR-FR-027 / OD-07) — configured separately from category.
const SEVERITY_ORDER = ['major', 'high', 'medium', 'low'];
const SEVERITY_LABEL = { major: 'Major', high: 'High', medium: 'Medium', low: 'Low' };

// Disciplines (Category) for the DLP tracker — maps to the snag `trade` column.
const DISCIPLINES = [
  'Civil',
  'Structural',
  'Architectural',
  'Finishing',
  'Mechanical (HVAC)',
  'Electrical',
  'Plumbing',
  'Fire Alarm',
  'Fire Fighting',
  'ELV / CCTV',
  'ELV / Access Control',
  'Landscaping / Irrigation',
  'Safety',
  'Other',
];

const DLP_MIN_DESCRIPTION = 30;

const initials = (name) => String(name ?? '')
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part.charAt(0).toUpperCase())
  .join('') || '?';

export const CreateSnagDialog = ({ open, drawing, revision, locationOptions, rootCauseCategories, members, companies, teams, canAssign, canManageToc = false, pin, suggestedLocation, onClose, onCreate }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [severity, setSeverity] = useState('medium');
  const [categoryId, setCategoryId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [locationText, setLocationText] = useState('');
  const [snagCategories, setSnagCategories] = useState([]);
  const [areaOptions, setAreaOptions] = useState([]);
  const [buildingOptions, setBuildingOptions] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [rootCauseCategoryId, setRootCauseCategoryId] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [trade, setTrade] = useState('');
  const [isDlp, setIsDlp] = useState(false);
  const [cluster, setCluster] = useState('');
  const [tocReference, setTocReference] = useState('');
  const [tocCertificateId, setTocCertificateId] = useState('');
  const [certificates, setCertificates] = useState([]);
  // Inline "create Taking-Over Certificate" mini-form, shown when the project has
  // no certificate yet (or the user wants a new one) so a DLP defect can be bound to
  // a real TOC without leaving the snag flow.
  const [tocCreating, setTocCreating] = useState(false);
  const [tocDraftTitle, setTocDraftTitle] = useState('');
  const [tocDraftScope, setTocDraftScope] = useState('project');
  const [tocDraftDate, setTocDraftDate] = useState('');
  const [tocDraftMonths, setTocDraftMonths] = useState('12');
  const [tocDraftReference, setTocDraftReference] = useState('');
  const [tocSaving, setTocSaving] = useState(false);
  const [tocError, setTocError] = useState('');
  const [photos, setPhotos] = useState([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setTitle('');
    setDescription('');
    setPriority('medium');
    setSeverity('medium');
    setCategoryId('');
    setAreaId('');
    setBuildingId('');
    setLocationText('');
    setLocationId('');
    setAssigneeId('');
    setCompanyId('');
    setTeamId('');
    setRootCauseCategoryId('');
    setEstimatedCost('');
    setEstimatedHours('');
    setTrade('');
    setIsDlp(false);
    setCluster('');
    setTocReference('');
    setTocCertificateId('');
    setCertificates([]);
    setTocCreating(false);
    setTocDraftTitle('');
    setTocDraftScope('project');
    setTocDraftDate('');
    setTocDraftMonths('12');
    setTocDraftReference('');
    setTocError('');
    setPhotos([]);
    setAdvancedOpen(false);
  }, [open]);

  // Load the project's active certificates the first time DLP is switched on, so
  // a DLP defect can be bound to a real Taking-Over Certificate (which the server
  // uses to enforce the DLP window and stamp the reference).
  useEffect(() => {
    if (!open || !isDlp || !drawing?.project_id) {
      return;
    }
    let cancelled = false;
    void api
      .get('/api/handover/certificates', { params: { project_id: drawing.project_id } })
      .then((response) => {
        if (!cancelled) {
          setCertificates((response.data.data ?? []).filter((cert) => cert.status !== 'closed'));
        }
      })
      .catch(() => {
        if (!cancelled) setCertificates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isDlp, drawing?.project_id]);

  // Seed the location from the async pin suggestion WITHOUT resetting the rest of
  // the form — the suggestion resolves after the dialog is already open, so it must
  // not clobber whatever the user has started typing. Only fills an empty selection.
  useEffect(() => {
    if (!open || !suggestedLocation?.location_id) {
      return;
    }
    setLocationId((current) => current || String(suggestedLocation.location_id));
  }, [open, suggestedLocation]);

  // Load configurable categories and the Area/Building master data for the project.
  useEffect(() => {
    if (!open || !drawing?.project_id) {
      return;
    }
    let cancelled = false;
    void api.get('/api/snag-categories').then((res) => {
      if (!cancelled) setSnagCategories((res.data.data ?? []).filter((c) => c.is_active));
    }).catch(() => { if (!cancelled) setSnagCategories([]); });
    void api.get('/api/areas', { params: { project_id: drawing.project_id } }).then((res) => {
      if (!cancelled) setAreaOptions(res.data.data ?? []);
    }).catch(() => { if (!cancelled) setAreaOptions([]); });
    return () => { cancelled = true; };
  }, [open, drawing?.project_id]);

  // Buildings depend on the selected area (all project buildings when none picked).
  useEffect(() => {
    if (!open || !drawing?.project_id) {
      return;
    }
    let cancelled = false;
    void api.get('/api/buildings', { params: { project_id: drawing.project_id, ...(areaId ? { area_id: Number(areaId) } : {}) } })
      .then((res) => { if (!cancelled) setBuildingOptions(res.data.data ?? []); })
      .catch(() => { if (!cancelled) setBuildingOptions([]); });
    return () => { cancelled = true; };
  }, [open, drawing?.project_id, areaId]);

  const pinLabel = useMemo(() => {
    if (!pin) {
      return 'N/A';
    }
    return `${Math.round(pin.x * 100)}%, ${Math.round(pin.y * 100)}%`;
  }, [pin]);
  const availableTeams = useMemo(() => {
    if (!companyId) {
      return teams;
    }
    return teams.filter((team) => !team.company_id || team.company_id === Number(companyId));
  }, [teams, companyId]);
  const suggestedLocationEntry = useMemo(() => {
    if (!suggestedLocation?.location_id) {
      return null;
    }
    return locationOptions.find((item) => item.id === suggestedLocation.location_id) ?? null;
  }, [locationOptions, suggestedLocation]);
  const zoneLine = useMemo(() => {
    if (suggestedLocationEntry) {
      return `${suggestedLocationEntry.code ?? 'LOC'} · ${suggestedLocationEntry.name}`;
    }
    return pin ? `Pin at ${pinLabel}` : 'Awaiting pin';
  }, [pin, pinLabel, suggestedLocationEntry]);

  const photoPreviews = useMemo(() => photos.map((file) => URL.createObjectURL(file)), [photos]);
  useEffect(() => () => photoPreviews.forEach((url) => URL.revokeObjectURL(url)), [photoPreviews]);

  const addPhotos = (fileList) => {
    const picked = Array.from(fileList ?? []).filter((file) => file && file.size > 0);
    if (picked.length > 0) {
      setPhotos((current) => [...current, ...picked]);
    }
  };
  const removePhoto = (index) => setPhotos((current) => current.filter((_, position) => position !== index));

  const openTocCreate = () => {
    setTocError('');
    setTocDraftTitle('');
    setTocDraftScope('project');
    setTocDraftDate('');
    setTocDraftMonths('12');
    setTocDraftReference('');
    setTocCreating(true);
    // Prefill a suggested reference (the server still mints one if left blank).
    void api.get('/api/handover/next-reference').then((response) => {
      setTocDraftReference(response.data?.data?.reference ?? '');
    }).catch(() => {});
  };

  const createCertificate = async () => {
    if (!drawing?.project_id || !tocDraftTitle.trim()) {
      return;
    }
    setTocSaving(true);
    setTocError('');
    try {
      const response = await api.post('/api/handover/certificates', {
        project_id: drawing.project_id,
        title: tocDraftTitle.trim(),
        scope_type: tocDraftScope,
        taking_over_date: tocDraftDate || undefined,
        dlp_months: tocDraftMonths ? Number(tocDraftMonths) : undefined,
        reference: tocDraftReference.trim() || undefined,
      });
      const cert = response.data.data;
      setCertificates((current) => [cert, ...current]);
      setTocCertificateId(cert.id);
      setTocReference(cert.reference);
      setTocCreating(false);
    }
    catch (error) {
      setTocError(error?.response?.data?.message ?? 'Unable to create the certificate. You may need Taking-Over Certificate permission.');
    }
    finally {
      setTocSaving(false);
    }
  };

  // DLP snags require Cluster, TOC, a discipline, a ≥30-char description and a photo.
  const descriptionLength = description.trim().length;
  const dlpBlocked = isDlp && (
    !cluster.trim()
    // When certificates exist for the project a bound selection is required;
    // the free-text reference is only the fallback when there are none.
    || (certificates.length > 0 ? !tocCertificateId : !tocReference.trim())
    || !trade
    || descriptionLength < DLP_MIN_DESCRIPTION
    || photos.length === 0
  );
  const canSubmit = Boolean(title.trim()) && Boolean(pin) && !submitting && !dlpBlocked;

  const submit = async () => {
    if (!pin || !canSubmit) {
      return;
    }
    setSubmitting(true);
    try {
      await onCreate({
        title,
        description,
        priority,
        severity: severity || undefined,
        category_id: categoryId ? Number(categoryId) : undefined,
        area_id: areaId ? Number(areaId) : undefined,
        building_id: buildingId ? Number(buildingId) : undefined,
        location_text: locationText.trim() || undefined,
        trade: trade || undefined,
        is_dlp: isDlp,
        cluster: isDlp ? cluster.trim() : undefined,
        toc_reference: isDlp ? tocReference.trim() : undefined,
        taking_over_certificate_id: isDlp && tocCertificateId ? Number(tocCertificateId) : undefined,
        location_id: locationId ? Number(locationId) : undefined,
        assigned_to: canAssign && assigneeId ? Number(assigneeId) : undefined,
        assigned_company_id: canAssign && companyId ? Number(companyId) : undefined,
        assigned_team_id: canAssign && teamId ? Number(teamId) : undefined,
        root_cause_category_id: rootCauseCategoryId ? Number(rootCauseCategoryId) : undefined,
        estimated_cost: estimatedCost ? Number(estimatedCost) : undefined,
        estimated_hours: estimatedHours ? Number(estimatedHours) : undefined,
        photos,
        pin_x: pin.x,
        pin_y: pin.y,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{
        sx: {
          width: 400,
          maxWidth: '100%',
          m: 2,
          maxHeight: '92vh',
          borderRadius: '16px',
          border: `1px solid ${BRAND.border}`,
          bgcolor: BRAND.panel,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        },
      }}
    >
      {/* Header (fixed) */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, p: '18px 20px 14px', borderBottom: `1px solid ${BRAND.border}`, flex: 'none' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="div" sx={{ fontSize: 16, fontWeight: 700, color: BRAND.ink, lineHeight: 1.2 }}>
            New snag
          </Typography>
          <Box sx={{ fontFamily: FONT_MONO, fontSize: 11, color: BRAND.muted, mt: '2px', direction: 'ltr', unicodeBidi: 'isolate' }}>
            Pin on {drawing.code} · {revision?.revision_label ?? 'Current'} · {pinLabel}
          </Box>
        </Box>
        <IconButton aria-label="Close" onClick={onClose} sx={{ width: 28, height: 28, borderRadius: '8px', border: `1px solid ${BRAND.borderStrong}`, color: BRAND.muted, p: 0, flex: 'none' }}>
          <CloseRoundedIcon sx={{ fontSize: 15 }} />
        </IconButton>
      </Box>

      {/* Scrollable body */}
      <DialogContent sx={{ p: '16px 20px', overflowY: 'auto', flex: 1 }}>
        {suggestedLocation && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px', mb: '16px', p: '10px 12px', borderRadius: '10px', background: 'rgba(47,143,190,0.10)', border: '1px solid rgba(47,143,190,0.28)' }}>
            <PlaceRoundedIcon sx={{ fontSize: 16, color: '#2276A0', flex: 'none' }} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Box sx={{ fontSize: 12.5, fontWeight: 600, color: '#1E5E80', lineHeight: 1.3 }}>{zoneLine}</Box>
              <Box sx={{ fontSize: 11, color: '#4E8AA8', lineHeight: 1.3 }}>Auto-located — {suggestedLocation.reason}</Box>
            </Box>
            <CheckRoundedIcon sx={{ fontSize: 16, color: BRAND.teal, flex: 'none' }} />
          </Box>
        )}

        {/* DLP toggle — marks this as a Defects Liability Period tracker item */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            mb: '15px',
            p: '11px 12px',
            borderRadius: '10px',
            border: `1px solid ${isDlp ? 'rgba(192,138,35,0.4)' : BRAND.borderStrong}`,
            background: isDlp ? 'rgba(192,138,35,0.08)' : BRAND.panel,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ fontSize: 13, fontWeight: 700, color: BRAND.ink }}>DLP snag</Box>
            <Box sx={{ fontSize: 11, color: BRAND.muted, lineHeight: 1.4, mt: '2px' }}>
              Defects Liability Period item — requires Cluster, TOC, a discipline, a photo and a description of at least {DLP_MIN_DESCRIPTION} characters.
            </Box>
          </Box>
          <Switch checked={isDlp} onChange={(event) => setIsDlp(event.target.checked)} inputProps={{ 'aria-label': 'DLP snag' }} />
        </Box>

        {isDlp && (
          <Box sx={{ mb: '15px' }}>
            <Box sx={{ display: 'flex', gap: '10px' }}>
              <Box sx={{ flex: 1 }}>
                <FieldLabel>Cluster *</FieldLabel>
                <TextField value={cluster} onChange={(event) => setCluster(event.target.value)} fullWidth placeholder="North Cluster" InputProps={{ sx: { ...inputSx, color: BRAND.ink } }} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <FieldLabel>TOC *</FieldLabel>
                {certificates.length > 0 ? (
                  <FormControl fullWidth>
                    <Select
                      value={tocCertificateId}
                      displayEmpty
                      onChange={(event) => {
                        const id = event.target.value;
                        setTocCertificateId(id);
                        const cert = certificates.find((item) => String(item.id) === String(id));
                        setTocReference(cert ? cert.reference : '');
                      }}
                      sx={{ ...selectSx, color: BRAND.ink }}
                      renderValue={(value) => {
                        if (!value) return <Box component="span" sx={{ color: BRAND.muted }}>Select certificate</Box>;
                        const cert = certificates.find((item) => String(item.id) === String(value));
                        return cert ? `${cert.reference} · ${cert.title}` : value;
                      }}
                    >
                      {certificates.map((cert) => (
                        <MenuItem key={cert.id} value={cert.id} sx={{ fontSize: 13 }}>
                          {cert.reference} · {cert.title}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                ) : canManageToc ? (
                  <Button type="button" onClick={openTocCreate} disabled={tocCreating} fullWidth variant="outlined" sx={{ height: 42, borderRadius: '10px', textTransform: 'none', fontSize: 13, fontWeight: 600, borderColor: BRAND.borderStrong, color: BRAND.navy, justifyContent: 'flex-start' }}>
                    + Create certificate
                  </Button>
                ) : (
                  <TextField value={tocReference} onChange={(event) => setTocReference(event.target.value)} fullWidth placeholder="TOC-001" InputProps={{ sx: { ...inputSx, color: BRAND.ink } }} />
                )}
                {certificates.length > 0 && canManageToc && !tocCreating && (
                  <Box component="button" type="button" onClick={openTocCreate} sx={{ mt: '6px', background: 'none', border: 'none', p: 0, cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: BRAND.navy }}>
                    + New certificate
                  </Box>
                )}
              </Box>
            </Box>

            {tocCreating && (
              <Box sx={{ mt: '12px', p: '13px', borderRadius: '11px', border: `1px solid ${BRAND.border}`, background: BRAND.screen }}>
                <Box sx={{ fontSize: 12.5, fontWeight: 700, color: BRAND.ink, mb: '10px' }}>New Taking-Over Certificate</Box>
                <Box sx={{ display: 'flex', gap: '10px', mb: '10px' }}>
                  <Box sx={{ flex: 2 }}>
                    <FieldLabel>Title *</FieldLabel>
                    <TextField value={tocDraftTitle} onChange={(event) => setTocDraftTitle(event.target.value)} fullWidth placeholder="Section A — Energy Centre" InputProps={{ sx: { ...inputSx, color: BRAND.ink } }} />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <FieldLabel>Reference</FieldLabel>
                    <TextField value={tocDraftReference} onChange={(event) => setTocDraftReference(event.target.value)} fullWidth placeholder="auto" InputProps={{ sx: { ...inputSx, color: BRAND.ink } }} />
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: '10px', mb: '10px' }}>
                  <Box sx={{ flex: 1 }}>
                    <FieldLabel>Scope</FieldLabel>
                    <FormControl fullWidth>
                      <Select value={tocDraftScope} onChange={(event) => setTocDraftScope(event.target.value)} sx={{ ...selectSx, color: BRAND.ink }}>
                        <MenuItem value="project" sx={{ fontSize: 13 }}>Whole project</MenuItem>
                        <MenuItem value="section" sx={{ fontSize: 13 }}>Section</MenuItem>
                      </Select>
                    </FormControl>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <FieldLabel>Taking-over date</FieldLabel>
                    <TextField type="date" value={tocDraftDate} onChange={(event) => setTocDraftDate(event.target.value)} fullWidth InputProps={{ sx: { ...inputSx, color: BRAND.ink } }} />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <FieldLabel>DLP months</FieldLabel>
                    <TextField type="number" value={tocDraftMonths} onChange={(event) => setTocDraftMonths(event.target.value)} fullWidth InputProps={{ sx: { ...inputSx, color: BRAND.ink } }} />
                  </Box>
                </Box>
                {tocError && <Box sx={{ fontSize: 11.5, color: BRAND.red, mb: '9px' }}>{tocError}</Box>}
                <Box sx={{ display: 'flex', gap: '8px' }}>
                  <Button type="button" onClick={() => void createCertificate()} disabled={!tocDraftTitle.trim() || tocSaving} variant="contained" sx={{ borderRadius: '9px', textTransform: 'none', fontSize: 12.5, fontWeight: 600, boxShadow: 'none' }}>
                    {tocSaving ? 'Creating…' : 'Create & select'}
                  </Button>
                  <Button type="button" onClick={() => { setTocCreating(false); setTocError(''); }} variant="text" sx={{ textTransform: 'none', fontSize: 12.5, color: BRAND.muted }}>
                    Cancel
                  </Button>
                </Box>
                <Box sx={{ fontSize: 10.5, color: BRAND.muted, mt: '8px' }}>
                  Creates a draft certificate. The Defects-Liability window is measured from the taking-over date over the DLP months.
                </Box>
              </Box>
            )}
          </Box>
        )}

        <Box sx={{ mb: '15px' }}>
          <FieldLabel>Title</FieldLabel>
          <TextField value={title} onChange={(event) => setTitle(event.target.value)} required fullWidth placeholder="Cracked floor tile at lift entrance" InputProps={{ sx: { ...inputSx, color: BRAND.ink } }} />
        </Box>

        <Box sx={{ mb: '15px' }}>
          <FieldLabel>{isDlp ? 'Description *' : 'Description'}</FieldLabel>
          <TextField value={description} onChange={(event) => setDescription(event.target.value)} multiline minRows={3} fullWidth placeholder="Describe the defect, condition and any risk…" InputProps={{ sx: { fontSize: 13, color: BRAND.inkSoft, lineHeight: 1.5, borderRadius: '10px', p: '11px 13px', '& fieldset': { borderColor: BRAND.borderStrong } } }} />
          {isDlp && (
            <Box sx={{ fontSize: 11, color: descriptionLength < DLP_MIN_DESCRIPTION ? BRAND.amber : BRAND.muted, mt: '5px' }}>
              {descriptionLength}/{DLP_MIN_DESCRIPTION} characters minimum
            </Box>
          )}
        </Box>

        <Box sx={{ mb: '15px' }}>
          <FieldLabel>Priority</FieldLabel>
          <Box sx={{ display: 'flex', gap: '6px' }}>
            {PRIORITY_ORDER.map((value) => {
              const selected = priority === value;
              const critical = value === 'critical';
              return (
                <Box
                  key={value}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  onClick={() => setPriority(value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setPriority(value);
                    }
                  }}
                  sx={{
                    flex: 1,
                    textAlign: 'center',
                    p: '8px 0',
                    borderRadius: '8px',
                    fontSize: 12,
                    cursor: 'pointer',
                    userSelect: 'none',
                    fontWeight: selected ? 700 : 600,
                    background: selected ? (critical ? BRAND.red : 'rgba(36,72,143,0.10)') : '#F1F3F8',
                    color: selected ? (critical ? '#fff' : BRAND.navy) : BRAND.muted,
                  }}
                >
                  {PRIORITY_LABEL[value]}
                </Box>
              );
            })}
          </Box>
        </Box>

        <Box sx={{ mb: '15px' }}>
          <FieldLabel>Severity</FieldLabel>
          <Box sx={{ display: 'flex', gap: '6px' }}>
            {SEVERITY_ORDER.map((value) => {
              const selected = severity === value;
              const major = value === 'major';
              return (
                <Box
                  key={value}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  onClick={() => setSeverity(value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSeverity(value);
                    }
                  }}
                  sx={{
                    flex: 1,
                    textAlign: 'center',
                    p: '8px 0',
                    borderRadius: '8px',
                    fontSize: 12,
                    cursor: 'pointer',
                    userSelect: 'none',
                    fontWeight: selected ? 700 : 600,
                    background: selected ? (major ? BRAND.red : 'rgba(36,72,143,0.10)') : '#F1F3F8',
                    color: selected ? (major ? '#fff' : BRAND.navy) : BRAND.muted,
                  }}
                >
                  {SEVERITY_LABEL[value]}
                </Box>
              );
            })}
          </Box>
        </Box>

        <Box sx={{ mb: '15px' }}>
          <FieldLabel>Category</FieldLabel>
          <FormControl fullWidth>
            <Select displayEmpty value={categoryId} onChange={(event) => setCategoryId(String(event.target.value))} sx={selectSx}>
              <MenuItem value="">No category</MenuItem>
              {snagCategories.map((category) => (
                <MenuItem key={category.id} value={category.id}>{category.code ? `${category.code} - ` : ''}{category.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Box sx={{ mb: '15px' }}>
          <FieldLabel>{isDlp ? 'Discipline (Category) *' : 'Discipline'}</FieldLabel>
          <FormControl fullWidth>
            <Select displayEmpty value={trade} onChange={(event) => setTrade(String(event.target.value))} sx={selectSx}>
              <MenuItem value="">No discipline</MenuItem>
              {DISCIPLINES.map((item) => (
                <MenuItem key={item} value={item}>{item}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {canAssign && (
          <Box sx={{ mb: '15px' }}>
            <FieldLabel>Assign to</FieldLabel>
            <FormControl fullWidth>
              <Select
                displayEmpty
                value={assigneeId}
                onChange={(event) => setAssigneeId(String(event.target.value))}
                renderValue={(value) => {
                  const member = members.find((item) => item.id === Number(value));
                  if (!member) {
                    return <Box sx={{ fontSize: 13, color: BRAND.muted }}>Unassigned</Box>;
                  }
                  return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Box sx={{ width: 26, height: 26, borderRadius: '50%', background: BRAND.green, color: '#fff', fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                        {initials(member.name)}
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Box sx={{ fontSize: 13, fontWeight: 600, color: BRAND.ink, lineHeight: 1.2 }}>{member.name}</Box>
                        {member.company_name && (
                          <Box sx={{ fontSize: 10.5, color: BRAND.muted, lineHeight: 1.2 }}>{member.company_name}</Box>
                        )}
                      </Box>
                    </Box>
                  );
                }}
                sx={{ ...selectSx, '& .MuiSelect-select': { p: '8px 12px' } }}
              >
                <MenuItem value="">Unassigned</MenuItem>
                {members.map((member) => (
                  <MenuItem key={member.id} value={member.id}>{member.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        )}

        <Box sx={{ mb: '15px', display: 'flex', gap: '10px' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <FieldLabel>Area</FieldLabel>
            <FormControl fullWidth>
              <Select
                displayEmpty
                value={areaId}
                onChange={(event) => {
                  setAreaId(String(event.target.value));
                  setBuildingId('');
                }}
                sx={selectSx}
              >
                <MenuItem value="">No area</MenuItem>
                {areaOptions.map((area) => (
                  <MenuItem key={area.id} value={area.id}>{area.code ? `${area.code} - ` : ''}{area.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <FieldLabel>Building</FieldLabel>
            <FormControl fullWidth>
              <Select displayEmpty value={buildingId} onChange={(event) => setBuildingId(String(event.target.value))} sx={selectSx}>
                <MenuItem value="">No building</MenuItem>
                {buildingOptions.map((building) => (
                  <MenuItem key={building.id} value={building.id}>{building.code ? `${building.code} - ` : ''}{building.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Box>

        <Box sx={{ mb: '15px' }}>
          <FieldLabel>Location</FieldLabel>
          <FormControl fullWidth>
            <Select displayEmpty value={locationId} onChange={(event) => setLocationId(String(event.target.value))} sx={selectSx}>
              <MenuItem value="">No specific location</MenuItem>
              {locationOptions.map((location) => (
                <MenuItem key={location.id} value={location.id}>{location.code} - {location.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            value={locationText}
            onChange={(event) => setLocationText(event.target.value)}
            fullWidth
            placeholder="Or type a specific location…"
            InputProps={{ sx: { ...inputSx, color: BRAND.ink } }}
            sx={{ mt: '8px' }}
          />
        </Box>

        <Accordion expanded={advancedOpen} onChange={(_, expanded) => setAdvancedOpen(expanded)} disableGutters sx={{ boxShadow: 'none', border: 'none', '&:before': { display: 'none' }, bgcolor: 'transparent' }}>
          <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} sx={{ p: 0, minHeight: 0, '& .MuiAccordionSummary-content': { m: '4px 0' } }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: BRAND.inkSoft }}>More options</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: '10px 0 0' }}>
            <Stack spacing={1.75}>
              <Box>
                <FieldLabel>Root cause</FieldLabel>
                <FormControl fullWidth>
                  <Select displayEmpty value={rootCauseCategoryId} onChange={(event) => setRootCauseCategoryId(String(event.target.value))} sx={selectSx}>
                    <MenuItem value="">Unclassified</MenuItem>
                    {rootCauseCategories.map((category) => (
                      <MenuItem key={category.id} value={category.id}>{category.code ? `${category.code} - ` : ''}{category.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              <Box sx={{ display: 'flex', gap: '10px' }}>
                <Box sx={{ flex: 1 }}>
                  <FieldLabel>Est. cost</FieldLabel>
                  <TextField type="number" value={estimatedCost} onChange={(event) => setEstimatedCost(event.target.value)} fullWidth placeholder="0.00" inputProps={{ min: 0, step: '0.01' }} InputProps={{ sx: inputSx }} />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <FieldLabel>Est. hours</FieldLabel>
                  <TextField type="number" value={estimatedHours} onChange={(event) => setEstimatedHours(event.target.value)} fullWidth placeholder="0.0" inputProps={{ min: 0, step: '0.01' }} InputProps={{ sx: inputSx }} />
                </Box>
              </Box>

              {canAssign && (
                <>
                  <Box>
                    <FieldLabel>Company</FieldLabel>
                    <FormControl fullWidth>
                      <Select
                        displayEmpty
                        value={companyId}
                        onChange={(event) => {
                          const value = String(event.target.value);
                          setCompanyId(value);
                          if (teamId) {
                            const selectedTeam = teams.find((team) => team.id === Number(teamId));
                            if (selectedTeam?.company_id && selectedTeam.company_id !== Number(value || 0)) {
                              setTeamId('');
                            }
                          }
                        }}
                        sx={selectSx}
                      >
                        <MenuItem value="">No company</MenuItem>
                        {companies.map((company) => (
                          <MenuItem key={company.id} value={company.id}>{company.name}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>

                  <Box>
                    <FieldLabel>Team</FieldLabel>
                    <FormControl fullWidth>
                      <Select displayEmpty value={teamId} onChange={(event) => setTeamId(String(event.target.value))} sx={selectSx}>
                        <MenuItem value="">No team</MenuItem>
                        {availableTeams.map((team) => (
                          <MenuItem key={team.id} value={team.id}>{team.name}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                </>
              )}
            </Stack>
          </AccordionDetails>
        </Accordion>

        <Box sx={{ mt: '14px' }}>
          <FieldLabel>{isDlp ? 'Photos *' : 'Photos'}</FieldLabel>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <Box
              component="label"
              role="button"
              aria-label="Add photo"
              sx={{
                width: 56,
                height: 56,
                borderRadius: '10px',
                border: `1.5px dashed ${isDlp && photos.length === 0 ? BRAND.amber : 'rgba(20,38,66,0.2)'}`,
                color: isDlp && photos.length === 0 ? BRAND.amber : '#A6B0BF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 'none',
                cursor: 'pointer',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <input
                type="file"
                accept="image/*,.pdf"
                multiple
                hidden
                onChange={(event) => {
                  addPhotos(event.target.files);
                  event.target.value = '';
                }}
              />
            </Box>
            {photos.map((file, index) => {
              const url = photoPreviews[index];
              const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '');
              return (
                <Box key={url ?? index} sx={{ position: 'relative', width: 56, height: 56, flex: 'none' }}>
                  {isPdf ? (
                    <Box sx={{ width: 56, height: 56, borderRadius: '10px', border: `1px solid ${BRAND.borderStrong}`, background: '#F1F3F8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, color: BRAND.inkSoft }}>
                      PDF
                    </Box>
                  ) : (
                    <Box component="img" src={url} alt={file.name ?? 'photo'} sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: '10px', border: `1px solid ${BRAND.borderStrong}`, background: '#F1F3F8' }} />
                  )}
                  <IconButton
                    aria-label="Remove photo"
                    onClick={() => removePhoto(index)}
                    sx={{ position: 'absolute', top: -7, right: -7, width: 18, height: 18, p: 0, bgcolor: BRAND.ink, color: '#fff', '&:hover': { bgcolor: BRAND.red } }}
                  >
                    <CloseRoundedIcon sx={{ fontSize: 12 }} />
                  </IconButton>
                </Box>
              );
            })}
          </Box>
          <Box sx={{ fontSize: 11.5, color: isDlp && photos.length === 0 ? BRAND.amber : BRAND.muted, lineHeight: 1.4, mt: '7px' }}>
            {photos.length > 0
              ? `${photos.length} photo${photos.length > 1 ? 's' : ''} will be attached after the snag is created.`
              : isDlp
                ? 'At least one photo is required for a DLP snag.'
                : 'Attach evidence photos now, or add them from the snag later.'}
          </Box>
        </Box>
      </DialogContent>

      {/* Footer (fixed) */}
      <DialogActions sx={{ p: '12px 20px', borderTop: `1px solid ${BRAND.border}`, gap: '10px', flex: 'none' }}>
        <Button onClick={onClose} sx={{ p: '10px 16px', borderRadius: '10px', border: `1px solid ${BRAND.borderStrong}`, fontSize: 13, fontWeight: 600, color: BRAND.inkSoft, bgcolor: BRAND.panel, boxShadow: 'none', '&:hover': { bgcolor: '#F1F3F8', boxShadow: 'none' } }}>
          Cancel
        </Button>
        <Button onClick={() => void submit()} variant="contained" disabled={!canSubmit} id="create-snag-btn" sx={{ flex: 1, p: '10px', borderRadius: '10px', fontSize: 13, fontWeight: 600, boxShadow: '0 10px 20px -10px rgba(36,72,143,0.7)' }}>
          {submitting ? 'Creating…' : 'Create snag'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
