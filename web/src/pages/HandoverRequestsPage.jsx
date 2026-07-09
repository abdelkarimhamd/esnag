import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Drawer, FormControl, IconButton, MenuItem, Select, Stack, TextField, Typography,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { normalizeApiError } from '../utils/apiError';
import { BRAND, FONT_MONO } from '../theme';
import { PageHero } from '../components/ui/PageHero';
import { Mono, SectionLabel } from '../components/ui/Mono';

const toError = (error, fallback) => normalizeApiError(error, fallback).message;

// Handover-request status → colour. Kept local (distinct from the snag lifecycle).
const STATUS_META = {
  draft: { label: 'Draft', dot: BRAND.muted, tint: '#EEF0F4', text: BRAND.inkSoft },
  in_progress: { label: 'In progress', dot: BRAND.navy, tint: 'rgba(36,72,143,0.10)', text: BRAND.navy },
  returned: { label: 'Returned', dot: BRAND.amber, tint: 'rgba(192,138,35,0.12)', text: '#8A6014' },
  revising: { label: 'Revising', dot: BRAND.amber, tint: 'rgba(192,138,35,0.12)', text: '#8A6014' },
  consolidating: { label: 'Consolidating', dot: BRAND.teal, tint: 'rgba(20,138,130,0.12)', text: '#0C6A63' },
  approved: { label: 'Approved', dot: BRAND.green, tint: 'rgba(43,138,62,0.12)', text: '#1F6B32' },
  closed: { label: 'Closed', dot: BRAND.green, tint: 'rgba(43,138,62,0.14)', text: '#1F6B32' },
  rejected: { label: 'Rejected', dot: BRAND.red, tint: 'transparent', text: BRAND.red },
};

const ACTION_META = {
  submit: { label: 'Submit', tone: 'primary', reason: false },
  forward: { label: 'Forward', tone: 'primary', reason: false, gated: true },
  approve: { label: 'Approve', tone: 'success', reason: false, gated: true },
  consolidate: { label: 'Consolidate', tone: 'teal', reason: false },
  comment: { label: 'Comment', tone: 'neutral', reason: 'optional' },
  return: { label: 'Return', tone: 'warning', reason: true },
  reject: { label: 'Reject', tone: 'danger', reason: true },
  revise: { label: 'Request revision', tone: 'warning', reason: true },
  close: { label: 'Close', tone: 'success', reason: 'optional' },
};
// Order in which action buttons render.
const ACTION_ORDER = ['submit', 'forward', 'approve', 'consolidate', 'comment', 'revise', 'return', 'reject', 'close'];

const SEVERITY_COLOR = { major: BRAND.red, high: BRAND.amber, medium: BRAND.navy, low: BRAND.muted };

const TONE_SX = {
  primary: { bg: BRAND.navy, fg: '#fff' },
  success: { bg: BRAND.green, fg: '#fff' },
  teal: { bg: BRAND.teal, fg: '#fff' },
  warning: { bg: 'rgba(192,138,35,0.14)', fg: '#8A6014' },
  danger: { bg: 'rgba(197,58,58,0.12)', fg: BRAND.red },
  neutral: { bg: '#EEF0F4', fg: BRAND.inkSoft },
};

const typeLabel = (t) => ({
  contractor: 'Contractor', consultant: 'Consultant', authority: 'Authority',
  owner: 'Owner', fmmp: 'FMMP', service_provider: 'Service Provider', other: 'Other',
}[t] ?? t ?? '—');

const fmtDate = (v) => {
  if (!v) return '';
  try { return new Date(v).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return v; }
};

const StatusChip = ({ status }) => {
  const meta = STATUS_META[status] ?? STATUS_META.draft;
  return (
    <Box component="span" sx={{
      display: 'inline-flex', alignItems: 'center', gap: 0.85, px: 1.35, py: 0.55, borderRadius: 999,
      fontSize: 11.5, fontWeight: 600, lineHeight: 1, color: meta.text,
      background: status === 'rejected' ? 'transparent' : meta.tint,
      border: status === 'rejected' ? `1px dashed ${meta.dot}66` : '1px solid transparent', whiteSpace: 'nowrap',
    }}>
      <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', background: meta.dot }} />
      {meta.label}
    </Box>
  );
};

const fieldSx = { '& .MuiOutlinedInput-notchedOutline': { borderColor: BRAND.borderStrong }, '& .MuiSelect-select': { p: '9px 12px', fontSize: 13 }, borderRadius: '10px' };

export const HandoverRequestsPage = () => {
  const { permissions } = useAuth();
  const canCreate = permissions.includes('handover.create');

  const [projects, setProjects] = useState([]);
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMode, setViewMode] = useState('list');
  const [boardStages, setBoardStages] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentBody, setCommentBody] = useState('');
  const [commentInternal, setCommentInternal] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ project_id: '', title: '', description: '' });
  const [reasonDialog, setReasonDialog] = useState(null); // { action }
  const [reasonText, setReasonText] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [projectSnags, setProjectSnags] = useState([]);
  const [pickedSnagIds, setPickedSnagIds] = useState([]);

  useEffect(() => {
    void api.get('/api/projects', { params: { per_page: 100 } })
      .then((r) => setProjects(r.data.data ?? []))
      .catch((e) => setError(toError(e, 'Unable to load projects.')));
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/api/handovers/requests', {
        params: { project_id: projectFilter || undefined, status: statusFilter || undefined, per_page: 50 },
      });
      setRows(r.data.data ?? []);
    } catch (e) {
      setError(toError(e, 'Unable to load handover requests.'));
    } finally {
      setLoading(false);
    }
  }, [projectFilter, statusFilter]);

  useEffect(() => { void loadRows(); }, [loadRows]);

  // Board columns come from the selected project's resolved workflow definition.
  useEffect(() => {
    if (viewMode !== 'board' || !projectFilter) { setBoardStages([]); return; }
    void api.get('/api/handovers/workflows/resolve', { params: { project_id: projectFilter } })
      .then((r) => setBoardStages([...(r.data.data?.stages ?? [])].sort((a, b) => a.stage_order - b.stage_order)))
      .catch(() => setBoardStages([]));
  }, [viewMode, projectFilter]);

  const loadComments = useCallback(async (id) => {
    try {
      const r = await api.get(`/api/handovers/requests/${id}/comments`);
      setComments(r.data.data ?? []);
    } catch {
      setComments([]);
    }
  }, []);

  const loadDetail = useCallback(async (id) => {
    setDetailBusy(true);
    try {
      const r = await api.get(`/api/handovers/requests/${id}`);
      setDetail(r.data.data);
      void loadComments(id);
    } catch (e) {
      setError(toError(e, 'Unable to load the request.'));
    } finally {
      setDetailBusy(false);
    }
  }, [loadComments]);

  const openDetail = (id) => { setSelectedId(id); void loadDetail(id); };
  const closeDetail = () => { setSelectedId(null); setDetail(null); setComments([]); };

  const postComment = async () => {
    if (!detail || !commentBody.trim()) return;
    setCommentBusy(true);
    try {
      await api.post(`/api/handovers/requests/${detail.id}/comments`, {
        body: commentBody.trim(),
        is_internal: commentInternal,
      });
      setCommentBody('');
      setCommentInternal(false);
      await loadComments(detail.id);
    } catch (e) {
      setError(toError(e, 'Unable to post the comment.'));
    } finally {
      setCommentBusy(false);
    }
  };

  const uploadDocument = async (file) => {
    if (!detail || !file) return;
    setUploadBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.post(`/api/handovers/requests/${detail.id}/attachments`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await loadDetail(detail.id);
    } catch (e) {
      setError(toError(e, 'Unable to upload the document.'));
    } finally {
      setUploadBusy(false);
    }
  };

  const downloadDocument = async (att) => {
    if (!detail) return;
    try {
      const r = await api.get(`/api/handovers/requests/${detail.id}/attachments/${att.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.original_name || 'document';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(toError(e, 'Unable to download the document.'));
    }
  };

  const createRequest = async () => {
    try {
      const r = await api.post('/api/handovers/requests', {
        project_id: Number(createForm.project_id),
        title: createForm.title.trim(),
        description: createForm.description.trim() || undefined,
      });
      setCreateOpen(false);
      setCreateForm({ project_id: '', title: '', description: '' });
      setNotice(`Created ${r.data.data.reference}.`);
      await loadRows();
      openDetail(r.data.data.id);
    } catch (e) {
      setError(toError(e, 'Unable to create the request.'));
    }
  };

  const performAction = async (action, reason) => {
    if (!detail) return;
    setDetailBusy(true);
    setError(null);
    try {
      const base = `/api/handovers/requests/${detail.id}`;
      if (action === 'submit') await api.post(`${base}/submit`);
      else if (action === 'close') await api.post(`${base}/close`, { reason: reason || undefined });
      else await api.post(`${base}/act`, { action, reason: reason || undefined });
      setNotice(`${ACTION_META[action]?.label ?? action} applied.`);
      await Promise.all([loadDetail(detail.id), loadRows()]);
    } catch (e) {
      setError(toError(e, `Unable to ${action} the request.`));
    } finally {
      setDetailBusy(false);
    }
  };

  const handleAction = (action) => {
    const meta = ACTION_META[action];
    if (meta?.reason === true || meta?.reason === 'optional') {
      setReasonText('');
      setReasonDialog({ action, required: meta.reason === true });
    } else {
      void performAction(action, null);
    }
  };

  const openLinkSnags = async () => {
    if (!detail) return;
    setPickedSnagIds([]);
    setLinkOpen(true);
    try {
      const r = await api.get('/api/snags', { params: { project_id: detail.project_id, per_page: 100 } });
      const linkedIds = new Set((detail.snags ?? []).map((s) => s.id));
      setProjectSnags((r.data.data ?? []).filter((s) => !linkedIds.has(s.id)));
    } catch {
      setProjectSnags([]);
    }
  };

  const attachSnags = async () => {
    if (!detail || pickedSnagIds.length === 0) return;
    try {
      await api.post(`/api/handovers/requests/${detail.id}/snags`, { snag_ids: pickedSnagIds, is_mandatory: true });
      setLinkOpen(false);
      setNotice('Snags linked to the handover.');
      await loadDetail(detail.id);
    } catch (e) {
      setError(toError(e, 'Unable to link snags.'));
    }
  };

  const exportAudit = async () => {
    if (!detail) return;
    try {
      const r = await api.get(`/api/handovers/requests/${detail.id}/audit-export`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `handover-${detail.reference}-audit.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(toError(e, 'Unable to export the audit trail.'));
    }
  };

  const groupedSnags = useMemo(() => {
    const groups = new Map();
    for (const s of detail?.snags ?? []) {
      const key = s.source_organization?.id ?? 'none';
      const name = s.source_organization?.name ?? typeLabel(s.source_organization?.type) ?? 'Unattributed';
      if (!groups.has(key)) groups.set(key, { key, name, snags: [] });
      groups.get(key).snags.push(s);
    }
    return [...groups.values()];
  }, [detail]);

  const summary = detail?.summary ?? null;
  const permitted = summary?.viewer_permitted_actions ?? [];
  const gateReady = summary?.gate_ready ?? true;
  const gateMissing = summary?.gate_missing ?? [];

  const snapshot = useMemo(
    () => [...(detail?.stage_graph_snapshot ?? [])].sort((a, b) => a.stage_order - b.stage_order),
    [detail],
  );

  return (
    <Box sx={{ p: { xs: '18px', md: '26px 30px' }, maxWidth: 1180, mx: 'auto' }}>
      <PageHero
        title="Handover requests"
        description="Cross-party handover requests routed through the configurable multi-stage review cycle."
        actions={canCreate && (
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setCreateOpen(true)}
            sx={{ borderRadius: '10px', fontSize: 13, fontWeight: 600, boxShadow: 'none' }}>
            New request
          </Button>
        )}
      />

      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mt: 2, borderRadius: '12px' }}>{error}</Alert>}
      {notice && <Alert severity="success" onClose={() => setNotice(null)} sx={{ mt: 2, borderRadius: '12px' }}>{notice}</Alert>}

      <Stack direction="row" spacing={1.25} sx={{ mt: 2.5, mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <FormControl sx={{ minWidth: 220 }}>
          <Select value={projectFilter} displayEmpty onChange={(e) => setProjectFilter(String(e.target.value))} sx={fieldSx}>
            <MenuItem value="">All projects</MenuItem>
            {projects.map((p) => <MenuItem key={p.id} value={String(p.id)}>{p.code ? `${p.code} · ` : ''}{p.name}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl sx={{ minWidth: 160 }}>
          <Select value={statusFilter} displayEmpty onChange={(e) => setStatusFilter(String(e.target.value))} sx={fieldSx}>
            <MenuItem value="">Any status</MenuItem>
            {Object.entries(STATUS_META).map(([k, m]) => <MenuItem key={k} value={k}>{m.label}</MenuItem>)}
          </Select>
        </FormControl>

        <Box sx={{ ml: { md: 'auto' }, display: 'inline-flex', p: '3px', borderRadius: '10px', border: `1px solid ${BRAND.borderStrong}`, background: BRAND.panel }}>
          {['list', 'board'].map((mode) => (
            <Box key={mode} role="button" tabIndex={0}
              onClick={() => setViewMode(mode)}
              onKeyDown={(e) => { if (e.key === 'Enter') setViewMode(mode); }}
              sx={{
                px: 1.6, py: 0.6, borderRadius: '8px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
                color: viewMode === mode ? '#fff' : BRAND.muted, background: viewMode === mode ? BRAND.navy : 'transparent',
              }}>
              {mode === 'board' ? 'Board' : 'List'}
            </Box>
          ))}
        </Box>
      </Stack>

      {/* Register / Board */}
      {viewMode === 'list' ? (
      <Box sx={{ border: `1px solid ${BRAND.border}`, borderRadius: '14px', overflow: 'hidden', background: BRAND.panel }}>
        {loading ? (
          <Box sx={{ p: 5, textAlign: 'center' }}><CircularProgress size={22} /></Box>
        ) : rows.length === 0 ? (
          <Box sx={{ p: 5, textAlign: 'center', color: BRAND.muted, fontSize: 13.5 }}>No handover requests yet.</Box>
        ) : rows.map((row, i) => (
          <Box key={row.id} role="button" tabIndex={0}
            onClick={() => openDetail(row.id)}
            onKeyDown={(e) => { if (e.key === 'Enter') openDetail(row.id); }}
            sx={{
              display: 'grid', gridTemplateColumns: { xs: '1fr', md: '110px 1fr 150px 130px 120px' }, gap: 1.5,
              alignItems: 'center', p: '13px 16px', cursor: 'pointer',
              borderTop: i === 0 ? 'none' : `1px solid ${BRAND.borderHair}`,
              '&:hover': { background: '#F6F7FA' },
            }}>
            <Mono sx={{ fontSize: 12.5, color: BRAND.navy, fontWeight: 600 }}>{row.reference}</Mono>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ fontSize: 13.5, fontWeight: 600, color: BRAND.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.title}</Box>
              <Box sx={{ fontSize: 11.5, color: BRAND.muted }}>{row.project?.name}</Box>
            </Box>
            <Box sx={{ fontSize: 12, color: BRAND.inkSoft }}>
              {row.responsible_company?.name ?? typeLabel(row.responsible_company?.type)}
              {row.current_stage_order != null && <Box component="span" sx={{ color: BRAND.faint }}> · stage {row.current_stage_order}</Box>}
            </Box>
            <StatusChip status={row.status} />
            <Box sx={{ fontSize: 11.5, color: BRAND.muted, textAlign: { md: 'right' } }}>
              {row.cycle_number > 1 && <Box component="span" sx={{ fontFamily: FONT_MONO, mr: 1 }}>cycle {row.cycle_number}</Box>}
              {fmtDate(row.updated_at)}
            </Box>
          </Box>
        ))}
      </Box>
      ) : !projectFilter ? (
        <Box sx={{ p: 5, textAlign: 'center', color: BRAND.muted, fontSize: 13.5, border: `1px solid ${BRAND.border}`, borderRadius: '14px', background: BRAND.panel }}>
          Select a project above to view its 12-stage routing board.
        </Box>
      ) : (
        <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 1.5 }}>
          {[...boardStages, { stage_order: null, name: 'Closed', responsible_type: null }].map((stage) => {
            const cards = rows.filter((r) => (stage.stage_order === null ? r.current_stage_order == null : r.current_stage_order === stage.stage_order));
            return (
              <Box key={stage.stage_order ?? 'closed'} sx={{ flex: '0 0 236px', minWidth: 236, background: '#F3F5F8', border: `1px solid ${BRAND.border}`, borderRadius: '12px', p: '10px', display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ px: 0.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <Box sx={{ fontSize: 12.5, fontWeight: 700, color: BRAND.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {stage.stage_order != null && <Box component="span" sx={{ fontFamily: FONT_MONO, color: BRAND.faint, mr: 0.5 }}>{stage.stage_order}</Box>}
                      {stage.name}
                    </Box>
                    <Mono sx={{ fontSize: 11, color: BRAND.muted, ml: 0.5 }}>{cards.length}</Mono>
                  </Box>
                  {stage.responsible_type && <Box sx={{ fontSize: 10.5, color: BRAND.faint, fontFamily: FONT_MONO }}>{typeLabel(stage.responsible_type)}</Box>}
                </Box>
                {cards.map((card) => (
                  <Box key={card.id} role="button" tabIndex={0} onClick={() => openDetail(card.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') openDetail(card.id); }}
                    sx={{ background: BRAND.panel, border: `1px solid ${BRAND.border}`, borderRadius: '10px', p: '9px 11px', cursor: 'pointer', '&:hover': { borderColor: BRAND.navy } }}>
                    <Mono sx={{ fontSize: 11, color: BRAND.navy, fontWeight: 600 }}>{card.reference}</Mono>
                    <Box sx={{ fontSize: 12.5, fontWeight: 600, color: BRAND.ink, mt: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.title}</Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.75 }}>
                      <StatusChip status={card.status} />
                      {card.cycle_number > 1 && <Mono sx={{ fontSize: 10, color: BRAND.faint }}>cycle {card.cycle_number}</Mono>}
                    </Box>
                  </Box>
                ))}
              </Box>
            );
          })}
        </Box>
      )}

      {/* Detail drawer */}
      <Drawer anchor="right" open={Boolean(selectedId)} onClose={closeDetail}
        PaperProps={{ sx: { width: { xs: '100%', sm: 480 }, maxWidth: '100%', bgcolor: BRAND.canvas ?? '#F7F8FB' } }}>
        {detail ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box sx={{ p: '16px 18px', borderBottom: `1px solid ${BRAND.border}`, background: BRAND.panel, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
              <Box sx={{ minWidth: 0 }}>
                <Mono sx={{ fontSize: 12, color: BRAND.navy, fontWeight: 600 }}>{detail.reference}</Mono>
                <Typography sx={{ fontSize: 16, fontWeight: 700, color: BRAND.ink, lineHeight: 1.25, mt: '2px' }}>{detail.title}</Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center' }}>
                  <StatusChip status={detail.status} />
                  <Box sx={{ fontSize: 11.5, color: BRAND.muted }}>{detail.project?.name}</Box>
                </Stack>
              </Box>
              <IconButton onClick={closeDetail} sx={{ border: `1px solid ${BRAND.borderStrong}`, borderRadius: '8px', width: 30, height: 30 }}>
                <CloseRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>

            <Box sx={{ flex: 1, overflowY: 'auto', p: '16px 18px' }}>
              {/* Overview */}
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                <Box><SectionLabel sx={{ fontSize: 9.5 }}>RESPONSIBLE PARTY</SectionLabel>
                  <Box sx={{ fontSize: 13, fontWeight: 600, color: BRAND.ink }}>{detail.responsible_company?.name ?? typeLabel(detail.responsible_company?.type)}</Box></Box>
                <Box><SectionLabel sx={{ fontSize: 9.5 }}>CYCLE</SectionLabel>
                  <Mono sx={{ fontSize: 13, color: BRAND.ink }}>{detail.cycle_number}</Mono></Box>
                {detail.assignee && <Box><SectionLabel sx={{ fontSize: 9.5 }}>ASSIGNEE</SectionLabel>
                  <Box sx={{ fontSize: 13, color: BRAND.ink }}>{detail.assignee.name}</Box></Box>}
              </Box>

              {/* Take-action */}
              {permitted.length > 0 && (
                <Box sx={{ mb: 2, p: '12px 14px', borderRadius: '12px', border: `1px solid ${BRAND.border}`, background: BRAND.panel }}>
                  <SectionLabel sx={{ fontSize: 10 }}>TAKE ACTION</SectionLabel>
                  {!gateReady && gateMissing.length > 0 && (
                    <Box sx={{ fontSize: 11.5, color: '#8A6014', mt: 0.5, mb: 0.5 }}>
                      Blocked — outstanding: {gateMissing.join(', ')}.
                    </Box>
                  )}
                  <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
                    {ACTION_ORDER.filter((a) => permitted.includes(a)).map((a) => {
                      const meta = ACTION_META[a]; const tone = TONE_SX[meta.tone];
                      const disabled = detailBusy || (meta.gated && !gateReady);
                      return (
                        <Button key={a} onClick={() => handleAction(a)} disabled={disabled}
                          sx={{ borderRadius: '9px', fontSize: 12.5, fontWeight: 600, px: 1.6, py: 0.7, textTransform: 'none',
                            background: tone.bg, color: tone.fg, boxShadow: 'none', '&:hover': { background: tone.bg, filter: 'brightness(0.96)', boxShadow: 'none' } }}>
                          {meta.label}
                        </Button>
                      );
                    })}
                  </Stack>
                </Box>
              )}

              {/* Stage tracker */}
              <SectionLabel sx={{ fontSize: 10, mb: 1 }}>ROUTING · STAGE {detail.current_stage_order ?? '—'} OF {snapshot.length}</SectionLabel>
              <Box sx={{ mb: 2 }}>
                {snapshot.map((s) => {
                  const current = s.stage_order === detail.current_stage_order;
                  const done = detail.current_stage_order != null && s.stage_order < detail.current_stage_order;
                  const closed = detail.status === 'closed';
                  const dot = current ? BRAND.navy : (done || closed) ? BRAND.green : BRAND.borderStrong;
                  return (
                    <Box key={s.stage_order} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', py: 0.5 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: '3px' }}>
                        <Box sx={{ width: 11, height: 11, borderRadius: '50%', background: dot, flex: 'none', border: current ? `3px solid ${BRAND.navy}22` : 'none' }} />
                        {s.stage_order < snapshot.length && <Box sx={{ width: 2, flex: 1, minHeight: 16, background: BRAND.borderHair, mt: '2px' }} />}
                      </Box>
                      <Box sx={{ pb: 0.5 }}>
                        <Box sx={{ fontSize: 12.5, fontWeight: current ? 700 : 500, color: current ? BRAND.ink : done ? BRAND.inkSoft : BRAND.muted }}>
                          <Box component="span" sx={{ fontFamily: FONT_MONO, color: BRAND.faint, mr: 0.75 }}>{s.stage_order}</Box>
                          {s.name}
                        </Box>
                        <Box sx={{ fontSize: 10.5, color: BRAND.faint, fontFamily: FONT_MONO }}>
                          {typeLabel(s.responsible_type)}{s.is_final_authority ? ' · final authority' : ''}{s.is_loop_back ? ' · loop-back' : ''}
                        </Box>
                      </Box>
                    </Box>
                  );
                })}
              </Box>

              {/* Snags grouped by source organization (never merged — BR-BR-009) */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <SectionLabel sx={{ fontSize: 10 }}>SNAGS · BY SOURCE</SectionLabel>
                <Box role="button" tabIndex={0} onClick={() => void openLinkSnags()}
                  onKeyDown={(e) => { if (e.key === 'Enter') void openLinkSnags(); }}
                  sx={{ px: 1.1, py: 0.4, borderRadius: '8px', border: `1px solid ${BRAND.borderStrong}`, fontSize: 11.5, fontWeight: 600, color: BRAND.navy, cursor: 'pointer' }}>
                  + Link snags
                </Box>
              </Box>
              <Box sx={{ mb: 2 }}>
                {groupedSnags.length === 0 ? (
                  <Box sx={{ fontSize: 12, color: BRAND.muted, py: 0.5 }}>No snags linked to this handover yet.</Box>
                ) : groupedSnags.map((group) => (
                  <Box key={group.key} sx={{ mb: 1.25 }}>
                    <Box sx={{ fontSize: 11.5, fontWeight: 700, color: BRAND.inkSoft, mb: '5px' }}>
                      {group.name} <Box component="span" sx={{ fontFamily: FONT_MONO, color: BRAND.faint, fontWeight: 400 }}>({group.snags.length})</Box>
                    </Box>
                    {group.snags.map((s) => (
                      <Box key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: '7px 10px', mb: '4px', borderRadius: '9px', background: '#F6F7FA', border: `1px solid ${BRAND.borderHair}` }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: SEVERITY_COLOR[s.severity] ?? BRAND.muted, flex: 'none' }} title={s.severity} />
                        <Mono sx={{ fontSize: 10.5, color: BRAND.muted, flex: 'none' }}>{s.reference}</Mono>
                        <Box sx={{ fontSize: 12, color: BRAND.ink, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</Box>
                        {s.snag_type === 'operational' && <Mono sx={{ fontSize: 9.5, color: BRAND.teal, flex: 'none' }}>OP</Mono>}
                        <Mono sx={{ fontSize: 9.5, color: BRAND.faint, flex: 'none', textTransform: 'uppercase' }}>{String(s.status).replace(/_/g, ' ')}</Mono>
                      </Box>
                    ))}
                  </Box>
                ))}
              </Box>

              {/* Audit timeline */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <SectionLabel sx={{ fontSize: 10 }}>ACTIVITY &amp; AUDIT</SectionLabel>
                <Box role="button" tabIndex={0} onClick={() => void exportAudit()}
                  onKeyDown={(e) => { if (e.key === 'Enter') void exportAudit(); }}
                  sx={{ px: 1.1, py: 0.4, borderRadius: '8px', border: `1px solid ${BRAND.borderStrong}`, fontSize: 11.5, fontWeight: 600, color: BRAND.teal, cursor: 'pointer' }}>
                  Export CSV
                </Box>
              </Box>
              <Box>
                {(detail.events ?? []).map((ev) => (
                  <Box key={ev.id} sx={{ display: 'flex', gap: 1, py: 0.75, borderTop: `1px solid ${BRAND.borderHair}` }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Box sx={{ fontSize: 12.5, color: BRAND.ink }}>
                        <b style={{ textTransform: 'capitalize' }}>{String(ev.action).replace('_', ' ')}</b>
                        {ev.actor?.name && <Box component="span" sx={{ color: BRAND.muted }}> · {ev.actor.name}</Box>}
                      </Box>
                      {ev.reason && <Box sx={{ fontSize: 11.5, color: BRAND.inkSoft, mt: '2px' }}>“{ev.reason}”</Box>}
                      <Box sx={{ fontSize: 10.5, color: BRAND.faint, fontFamily: FONT_MONO, mt: '2px' }}>
                        {ev.prior_stage_order != null && ev.new_stage_order != null && ev.prior_stage_order !== ev.new_stage_order
                          ? `stage ${ev.prior_stage_order} → ${ev.new_stage_order} · ` : ''}
                        {fmtDate(ev.created_at)}
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>

              {/* Documents (C3) — versioned supporting documents with uploader + cycle */}
              <Box sx={{ mt: 2.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <SectionLabel sx={{ fontSize: 10 }}>DOCUMENTS</SectionLabel>
                <Box component="label" sx={{ px: 1.1, py: 0.4, borderRadius: '8px', border: `1px solid ${BRAND.borderStrong}`, fontSize: 11.5, fontWeight: 600, color: BRAND.navy, cursor: uploadBusy ? 'default' : 'pointer' }}>
                  {uploadBusy ? 'Uploading…' : '+ Upload'}
                  <input type="file" hidden disabled={uploadBusy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void uploadDocument(f); }} />
                </Box>
              </Box>
              <Box sx={{ mb: 2 }}>
                {(detail.attachments ?? []).length === 0 ? (
                  <Box sx={{ fontSize: 12, color: BRAND.muted, py: 0.5 }}>No documents uploaded yet.</Box>
                ) : (detail.attachments ?? []).map((att) => (
                  <Box key={att.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: '7px 10px', mb: '4px', borderRadius: '9px', background: '#F6F7FA', border: `1px solid ${BRAND.borderHair}` }}>
                    <Box sx={{ fontSize: 12, color: BRAND.ink, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.original_name}</Box>
                    <Mono sx={{ fontSize: 9.5, color: BRAND.faint, flex: 'none' }}>cyc {att.cycle_number}</Mono>
                    {att.uploader?.name && <Box component="span" sx={{ fontSize: 10.5, color: BRAND.muted, flex: 'none' }}>{att.uploader.name}</Box>}
                    <Box role="button" tabIndex={0} onClick={() => void downloadDocument(att)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void downloadDocument(att); }}
                      sx={{ fontSize: 11, fontWeight: 600, color: BRAND.teal, cursor: 'pointer', flex: 'none' }}>Download</Box>
                  </Box>
                ))}
              </Box>

              {/* Comments by stage / org (F2) — distinct from the immutable audit timeline */}
              <Box sx={{ mb: 1 }}>
                <SectionLabel sx={{ fontSize: 10 }}>DISCUSSION · BY STAGE</SectionLabel>
              </Box>
              <Box sx={{ mb: 1.25 }}>
                {comments.length === 0 ? (
                  <Box sx={{ fontSize: 12, color: BRAND.muted, py: 0.5 }}>No comments yet.</Box>
                ) : comments.map((c) => (
                  <Box key={c.id} sx={{ py: 0.75, borderTop: `1px solid ${BRAND.borderHair}` }}>
                    <Box sx={{ fontSize: 12.5, color: BRAND.ink }}>
                      <b>{c.user?.name ?? 'User'}</b>
                      {c.source_company?.name && <Box component="span" sx={{ color: BRAND.muted }}> · {c.source_company.name}</Box>}
                      {c.is_internal && <Mono sx={{ fontSize: 9, color: BRAND.amber, ml: 0.75 }}>INTERNAL</Mono>}
                    </Box>
                    <Box sx={{ fontSize: 12.5, color: BRAND.inkSoft, mt: '2px' }}>{c.body}</Box>
                    <Box sx={{ fontSize: 10.5, color: BRAND.faint, fontFamily: FONT_MONO, mt: '2px' }}>
                      {c.stage_order != null ? `stage ${c.stage_order} · ` : ''}{fmtDate(c.created_at)}
                    </Box>
                  </Box>
                ))}
              </Box>
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <TextField value={commentBody} onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Add a comment…" size="small" fullWidth multiline maxRows={4} />
                <Button variant="contained" size="small" disabled={commentBusy || !commentBody.trim()}
                  onClick={() => void postComment()} sx={{ flex: 'none' }}>Post</Button>
              </Stack>
              <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.75, fontSize: 11.5, color: BRAND.muted, cursor: 'pointer' }}>
                <input type="checkbox" checked={commentInternal} onChange={(e) => setCommentInternal(e.target.checked)} />
                Internal to my party only
              </Box>
            </Box>
          </Box>
        ) : (
          <Box sx={{ p: 5, textAlign: 'center' }}><CircularProgress size={22} /></Box>
        )}
      </Drawer>

      {/* Create dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="xs"
        PaperProps={{ sx: { borderRadius: '14px' } }}>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>New handover request</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <FormControl fullWidth>
              <SectionLabel sx={{ fontSize: 10, mb: 0.5 }}>PROJECT</SectionLabel>
              <Select value={createForm.project_id} displayEmpty onChange={(e) => setCreateForm((f) => ({ ...f, project_id: String(e.target.value) }))} sx={fieldSx}>
                <MenuItem value="">Select project</MenuItem>
                {projects.map((p) => <MenuItem key={p.id} value={String(p.id)}>{p.code ? `${p.code} · ` : ''}{p.name}</MenuItem>)}
              </Select>
            </FormControl>
            <Box>
              <SectionLabel sx={{ fontSize: 10, mb: 0.5 }}>TITLE</SectionLabel>
              <TextField fullWidth value={createForm.title} onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Energy centre handover" InputProps={{ sx: { borderRadius: '10px', fontSize: 13.5 } }} />
            </Box>
            <Box>
              <SectionLabel sx={{ fontSize: 10, mb: 0.5 }}>DESCRIPTION</SectionLabel>
              <TextField fullWidth multiline minRows={3} value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Scope of the handover…" InputProps={{ sx: { borderRadius: '10px', fontSize: 13 } }} />
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: '12px 20px' }}>
          <Button onClick={() => setCreateOpen(false)} sx={{ textTransform: 'none', color: BRAND.inkSoft }}>Cancel</Button>
          <Button variant="contained" disabled={!createForm.project_id || !createForm.title.trim()} onClick={() => void createRequest()}
            sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 600, boxShadow: 'none' }}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Reason dialog (return / reject / revise / comment / close) */}
      <Dialog open={Boolean(reasonDialog)} onClose={() => setReasonDialog(null)} fullWidth maxWidth="xs"
        PaperProps={{ sx: { borderRadius: '14px' } }}>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>{reasonDialog ? ACTION_META[reasonDialog.action]?.label : ''}</DialogTitle>
        <DialogContent>
          <SectionLabel sx={{ fontSize: 10, mb: 0.5 }}>{reasonDialog?.required ? 'REASON (REQUIRED)' : 'NOTE'}</SectionLabel>
          <TextField fullWidth multiline minRows={3} autoFocus value={reasonText} onChange={(e) => setReasonText(e.target.value)}
            placeholder="Explain the decision…" InputProps={{ sx: { borderRadius: '10px', fontSize: 13 } }} />
        </DialogContent>
        <DialogActions sx={{ p: '12px 20px' }}>
          <Button onClick={() => setReasonDialog(null)} sx={{ textTransform: 'none', color: BRAND.inkSoft }}>Cancel</Button>
          <Button variant="contained" disabled={reasonDialog?.required && !reasonText.trim()}
            onClick={() => { const a = reasonDialog.action; setReasonDialog(null); void performAction(a, reasonText.trim() || null); }}
            sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 600, boxShadow: 'none' }}>Confirm</Button>
        </DialogActions>
      </Dialog>

      {/* Link snags dialog */}
      <Dialog open={linkOpen} onClose={() => setLinkOpen(false)} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: '14px' } }}>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>Link snags to the handover</DialogTitle>
        <DialogContent>
          {projectSnags.length === 0 ? (
            <Box sx={{ py: 2, color: BRAND.muted, fontSize: 13 }}>No unlinked snags in this project.</Box>
          ) : (
            <Box sx={{ maxHeight: 340, overflowY: 'auto' }}>
              {projectSnags.map((s) => {
                const on = pickedSnagIds.includes(s.id);
                return (
                  <Box key={s.id} role="button" tabIndex={0}
                    onClick={() => setPickedSnagIds((p) => (on ? p.filter((id) => id !== s.id) : [...p, s.id]))}
                    onKeyDown={(e) => { if (e.key === 'Enter') setPickedSnagIds((p) => (on ? p.filter((id) => id !== s.id) : [...p, s.id])); }}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, p: '8px 10px', borderRadius: '9px', cursor: 'pointer', mb: '5px', border: `1px solid ${on ? BRAND.navy : BRAND.borderHair}`, background: on ? 'rgba(36,72,143,0.06)' : 'transparent' }}>
                    <Box sx={{ width: 16, height: 16, borderRadius: '5px', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${on ? BRAND.navy : BRAND.borderStrong}`, background: on ? BRAND.navy : 'transparent' }}>
                      {on && <Box component="span" sx={{ color: '#fff', fontSize: 11, lineHeight: 1 }}>✓</Box>}
                    </Box>
                    <Mono sx={{ fontSize: 10.5, color: BRAND.muted }}>{s.reference}</Mono>
                    <Box sx={{ fontSize: 12.5, color: BRAND.ink, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</Box>
                  </Box>
                );
              })}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: '12px 20px' }}>
          <Button onClick={() => setLinkOpen(false)} sx={{ textTransform: 'none', color: BRAND.inkSoft }}>Cancel</Button>
          <Button variant="contained" disabled={pickedSnagIds.length === 0} onClick={() => void attachSnags()}
            sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 600, boxShadow: 'none' }}>
            Link{pickedSnagIds.length > 0 ? ` (${pickedSnagIds.length})` : ''}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
