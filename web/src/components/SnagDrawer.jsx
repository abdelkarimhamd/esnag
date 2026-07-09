import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useFeatureTour } from '../hooks/useFeatureTour';
import { normalizeApiError } from '../utils/apiError';
import { formatStatusLabel } from '../utils/ui';
import { BRAND, FONT_MONO, STATUS } from '../theme';
import { Mono, SectionLabel } from './ui/Mono';
import { StatusPill } from './ui/StatusPill';
import { dueMeta } from '../utils/status';

const transitionMap = {
  new: ['assigned', 'rejected'],
  assigned: ['in_progress', 'rejected'],
  in_progress: ['ready_for_review', 'rejected'],
  ready_for_review: ['closed', 'in_progress', 'rejected'],
  closed: [],
  rejected: ['assigned'],
};

// The lifecycle stepper order (frame-1g §3.2). ready_for_review maps to "Review".
const LIFECYCLE_STEPS = [
  { status: 'new', label: 'New' },
  { status: 'assigned', label: 'Assigned' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'ready_for_review', label: 'Review' },
  { status: 'closed', label: 'Closed' },
];

const errorMessage = (error, fallback) => normalizeApiError(error, fallback).message;

// Card chrome shared by the stepper, metadata and closeout surfaces.
const CARD_SX = {
  bgcolor: BRAND.panel,
  border: `1px solid rgba(20,38,66,0.08)`,
  borderRadius: '16px',
  boxShadow: '0 1px 2px rgba(20,38,66,0.03)',
};

// Latin/numeric values (references, dates, currency) stay LTR under RTL.
const LTR_ISOLATE = { direction: 'ltr', unicodeBidi: 'isolate' };

const shortDate = (value) => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const initialsOf = (name) => {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const MapPinIcon = () => (
  <Box
    component="svg"
    width={15}
    height={15}
    viewBox="0 0 24 24"
    fill="none"
    stroke={BRAND.muted}
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    sx={{ flex: 'none' }}
  >
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
    <circle cx="12" cy="10" r="2.6" />
  </Box>
);

const CameraIcon = () => (
  <Box
    component="svg"
    width={26}
    height={26}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#9AA6B8"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="6" width="18" height="14" rx="2" />
    <circle cx="12" cy="13" r="3.4" />
  </Box>
);

const CheckIcon = ({ size = 14, strokeWidth = 3, color = '#fff' }) => (
  <Box component="svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="m5 12 5 5 9-10" />
  </Box>
);

const SendIcon = ({ active }) => (
  <Box
    component="svg"
    width={17}
    height={17}
    viewBox="0 0 24 24"
    fill="none"
    stroke={active ? BRAND.navy : BRAND.muted}
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </Box>
);

const Avatar = ({ initials, bg, size = 30, fontSize = 10 }) => (
  <Box
    sx={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: bg,
      color: '#fff',
      fontFamily: FONT_MONO,
      fontSize,
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 'none',
      ...LTR_ISOLATE,
    }}
  >
    {initials}
  </Box>
);

export const SnagDrawer = ({
  snagId,
  members,
  companies,
  teams,
  canTransition,
  canAssign,
  canComment,
  canAttach,
  canCloseoutView = false,
  canCloseoutUpdate = false,
  canCloseoutReview = false,
  onClose,
  onChanged,
}) => {
  const navigate = useNavigate();
  const [snag, setSnag] = useState(null);
  const [error, setError] = useState(null);
  const [transitionTo, setTransitionTo] = useState('');
  const [transitionNote, setTransitionNote] = useState('');
  const [transitionAssigneeId, setTransitionAssigneeId] = useState('');
  const [transitionCompanyId, setTransitionCompanyId] = useState('');
  const [transitionTeamId, setTransitionTeamId] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [commentParentId, setCommentParentId] = useState(null);
  const [mentionUserIds, setMentionUserIds] = useState([]);
  const [mentionTeamIds, setMentionTeamIds] = useState([]);
  const [commentFiles, setCommentFiles] = useState([]);
  const [watcherUserId, setWatcherUserId] = useState('');
  const [attachmentType, setAttachmentType] = useState('photo');
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [closeout, setCloseout] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [itemNotes, setItemNotes] = useState({});
  const [evidenceFiles, setEvidenceFiles] = useState({});
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [commentsExpanded, setCommentsExpanded] = useState(true);
  const [watchersExpanded, setWatchersExpanded] = useState(false);
  const open = Boolean(snagId);
  const closeoutTourSteps = useMemo(
    () => [
      {
        id: 'closeout_panel',
        title: 'Closeout Tab',
        text: 'Each snag can run through a closeout checklist before closure.',
        attachTo: { element: '#closeout-panel', on: 'left' },
      },
      {
        id: 'closeout_template',
        title: 'Template Selection',
        text: 'Pick project or trade template defaults to seed checklist items.',
        attachTo: { element: '#closeout-template', on: 'left' },
      },
      {
        id: 'closeout_checklist',
        title: 'Checklist and Evidence',
        text: 'Mark required items and upload evidence to reach full completion.',
        attachTo: { element: '#closeout-checklist', on: 'left' },
      },
      {
        id: 'closeout_completion',
        title: 'Completion Guard',
        text: 'Snag closure is blocked until required closeout is fully satisfied.',
        attachTo: { element: '#closeout-completion', on: 'left' },
      },
    ],
    [],
  );
  useFeatureTour({
    tourKey: 'closeout',
    enabled: open && canCloseoutView && Boolean(snag) && activeTab === 'closeout',
    steps: closeoutTourSteps,
  });
  const loadSnag = useCallback(async () => {
    if (!snagId) {
      setSnag(null);
      return;
    }
    try {
      const response = await api.get(`/api/snags/${snagId}`);
      const loaded = response.data.data;
      setSnag(loaded);
      setTransitionTo('');
      setTransitionNote('');
      setTransitionAssigneeId(loaded.assigned_to ? String(loaded.assigned_to) : '');
      setTransitionCompanyId(loaded.assigned_company_id ? String(loaded.assigned_company_id) : '');
      setTransitionTeamId(loaded.assigned_team_id ? String(loaded.assigned_team_id) : '');
      setCommentParentId(null);
      setMentionUserIds([]);
      setMentionTeamIds([]);
      setCommentFiles([]);
      setWatcherUserId('');
      setCommentsExpanded(true);
      setWatchersExpanded(false);
      setError(null);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to load snag details.'));
    }
  }, [snagId]);
  const loadCloseout = useCallback(async () => {
    if (!snagId || !canCloseoutView) {
      setCloseout(null);
      setTemplates([]);
      return;
    }
    try {
      const response = await api.get(`/api/snags/${snagId}/closeout`);
      const loaded = response.data.data;
      const availableTemplates = response.data.meta?.templates ?? [];
      setCloseout(loaded);
      setTemplates(availableTemplates);
      setSelectedTemplateId(String(loaded?.closeout_template_id ?? availableTemplates.find((item) => item.is_default)?.id ?? ''));
      const seededNotes = {};
      (loaded?.items ?? []).forEach((item) => {
        seededNotes[item.id] = item.notes ?? '';
      });
      setItemNotes(seededNotes);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to load closeout data.'));
    }
  }, [canCloseoutView, snagId]);
  useEffect(() => {
    void Promise.all([loadSnag(), loadCloseout()]);
  }, [loadCloseout, loadSnag]);
  const workflow = snag?.workflow ?? null;
  const availableTransitions = useMemo(() => {
    if (!snag) {
      return [];
    }
    const fromApi = Array.isArray(workflow?.available_transitions) ? workflow.available_transitions : [];
    if (fromApi.length > 0) {
      return fromApi;
    }
    return transitionMap[snag.status];
  }, [snag, workflow?.available_transitions]);
  const recommendedTransition = useMemo(() => {
    if (!snag) {
      return null;
    }
    if (workflow?.recommended_next_status) {
      return workflow.recommended_next_status;
    }
    return availableTransitions[0] ?? null;
  }, [availableTransitions, snag, workflow?.recommended_next_status]);
  const nextActions = useMemo(() => {
    const fromApi = Array.isArray(workflow?.next_actions) ? workflow.next_actions : [];
    if (fromApi.length > 0) {
      return fromApi;
    }
    return availableTransitions.map((status) => ({
      action_key: `transition.${status}`,
      to_status: status,
      label: formatStatusLabel(status),
      allowed: true,
      reason: null,
    }));
  }, [availableTransitions, workflow?.next_actions]);
  const availableTeams = useMemo(() => {
    if (!transitionCompanyId) {
      return teams;
    }
    return teams.filter((team) => !team.company_id || team.company_id === Number(transitionCompanyId));
  }, [teams, transitionCompanyId]);
  const watcherUsers = useMemo(() => {
    if (!snag) {
      return [];
    }
    const direct = snag.watcherUsers ?? snag.watcher_users ?? [];
    if (direct.length > 0) {
      return direct;
    }
    return (snag.watchers ?? []).map((watcher) => watcher.user).filter((user) => Boolean(user));
  }, [snag]);
  const availableTabs = useMemo(() => {
    const tabs = [{ key: 'overview', label: 'Summary' }];
    if (canTransition || canAssign || canAttach) {
      tabs.push({ key: 'actions', label: 'Take Action' });
    }
    if (canComment) {
      tabs.push({ key: 'comments', label: 'Comments' });
    }
    tabs.push({ key: 'history', label: 'History' });
    if (canCloseoutView) {
      tabs.push({ key: 'closeout', label: 'Closeout' });
    }
    return tabs;
  }, [canAssign, canAttach, canCloseoutView, canComment, canTransition]);
  useEffect(() => {
    if (snagId) {
      setActiveTab('overview');
    }
  }, [snagId]);
  useEffect(() => {
    if (!availableTabs.some((tab) => tab.key === activeTab)) {
      setActiveTab(availableTabs[0]?.key ?? 'overview');
    }
  }, [activeTab, availableTabs]);
  const isDlpSnag = Boolean(snag?.is_dlp);
  const dlpReopenPending = isDlpSnag && transitionTo === 'rejected';
  const dlpReopenNoteTooShort = dlpReopenPending && transitionNote.trim().length < 30;
  const applyTransition = async () => {
    if (!snag || !transitionTo) {
      return;
    }
    if (dlpReopenPending && transitionNote.trim().length < 30) {
      setError('A comment of at least 30 characters is required to reopen a DLP snag for rework.');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/snags/${snag.id}/transition`, {
        to_status: transitionTo,
        note: transitionNote || undefined,
        assigned_to: canAssign && transitionAssigneeId ? Number(transitionAssigneeId) : undefined,
      });
      await Promise.all([loadSnag(), loadCloseout(), onChanged()]);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Transition failed.'));
    } finally {
      setBusy(false);
    }
  };
  const saveAssignment = async () => {
    if (!snag || !canAssign) {
      return;
    }
    setBusy(true);
    try {
      await api.put(`/api/snags/${snag.id}`, {
        assigned_to: transitionAssigneeId ? Number(transitionAssigneeId) : null,
        assigned_company_id: transitionCompanyId ? Number(transitionCompanyId) : null,
        assigned_team_id: transitionTeamId ? Number(transitionTeamId) : null,
      });
      await Promise.all([loadSnag(), onChanged()]);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to update stakeholder assignment.'));
    } finally {
      setBusy(false);
    }
  };
  const dispatchToPerson = async () => {
    if (!snag || !canAssign || !transitionAssigneeId) {
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/snags/${snag.id}/dispatch`, {
        assigned_to: Number(transitionAssigneeId),
        note: transitionNote || undefined,
      });
      await Promise.all([loadSnag(), onChanged()]);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to dispatch snag to person.'));
    } finally {
      setBusy(false);
    }
  };
  const addComment = async () => {
    if (!snag || !commentBody.trim()) {
      return;
    }
    setBusy(true);
    try {
      const payloadUsesMultipart = commentFiles.length > 0;
      if (payloadUsesMultipart) {
        const payload = new FormData();
        payload.append('body', commentBody);
        if (commentParentId) {
          payload.append('parent_id', String(commentParentId));
        }
        mentionUserIds.forEach((id) => payload.append('mention_user_ids[]', id));
        mentionTeamIds.forEach((id) => payload.append('mention_team_ids[]', id));
        commentFiles.forEach((file) => payload.append('attachments[]', file));
        await api.post(`/api/snags/${snag.id}/comments`, payload, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
      } else {
        await api.post(`/api/snags/${snag.id}/comments`, {
          body: commentBody,
          parent_id: commentParentId ?? undefined,
          mention_user_ids: mentionUserIds.length > 0 ? mentionUserIds.map((id) => Number(id)) : undefined,
          mention_team_ids: mentionTeamIds.length > 0 ? mentionTeamIds.map((id) => Number(id)) : undefined,
        });
      }
      setCommentBody('');
      setCommentParentId(null);
      setMentionUserIds([]);
      setMentionTeamIds([]);
      setCommentFiles([]);
      await Promise.all([loadSnag(), onChanged()]);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to add comment.'));
    } finally {
      setBusy(false);
    }
  };
  const addWatcher = async () => {
    if (!snag || !watcherUserId) {
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/snags/${snag.id}/watchers`, {
        user_id: Number(watcherUserId),
      });
      setWatcherUserId('');
      await Promise.all([loadSnag(), onChanged()]);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to add watcher.'));
    } finally {
      setBusy(false);
    }
  };
  const removeWatcher = async (userId) => {
    if (!snag) {
      return;
    }
    setBusy(true);
    try {
      await api.delete(`/api/snags/${snag.id}/watchers/${userId}`);
      await Promise.all([loadSnag(), onChanged()]);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to remove watcher.'));
    } finally {
      setBusy(false);
    }
  };
  const renderCommentThread = (comment, depth = 0) => {
    const authorName = comment.user?.name ?? 'User';
    return (
      <Box key={comment.id} sx={{ ml: depth * 2 }}>
        <Stack direction="row" spacing="11px">
          <Avatar initials={initialsOf(authorName)} bg={depth % 2 === 0 ? BRAND.teal : BRAND.navy} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ fontSize: 13, color: BRAND.ink }}>
              <Box component="strong" sx={{ fontWeight: 600 }}>
                {authorName}
              </Box>
              <Box component="span" sx={{ color: BRAND.muted }}>
                {' · '}
                <Box component="span" sx={{ ...LTR_ISOLATE }}>
                  {new Date(comment.created_at).toLocaleString()}
                </Box>
              </Box>
            </Box>
            <Box sx={{ fontSize: 13, color: BRAND.inkSoft, mt: '3px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{comment.body}</Box>

            {(comment.mentions ?? []).length > 0 && (
              <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap sx={{ mt: 0.8 }}>
                {(comment.mentions ?? []).map((mention) => (
                  <Chip
                    key={mention.id}
                    size="small"
                    variant="outlined"
                    label={
                      mention.mentionedUser?.name ??
                      mention.mentioned_user?.name ??
                      mention.mentionedTeam?.name ??
                      mention.mentioned_team?.name ??
                      mention.token ??
                      '@mention'
                    }
                  />
                ))}
              </Stack>
            )}

            {(comment.attachments ?? []).length > 0 && (
              <List dense sx={{ py: 0 }}>
                {(comment.attachments ?? []).map((attachment) => (
                  <ListItem key={attachment.id} sx={{ px: 0 }}>
                    <ListItemText
                      primary={attachment.file_name}
                      secondary={
                        <a href={`/api/snag-comment-attachments/${attachment.id}/download`} target="_blank" rel="noreferrer">
                          Download attachment
                        </a>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            )}

            {canComment && (
              <Button
                size="small"
                variant={commentParentId === comment.id ? 'contained' : 'text'}
                onClick={() => setCommentParentId(commentParentId === comment.id ? null : comment.id)}
                sx={{ alignSelf: 'flex-start', mt: 0.4 }}
              >
                {commentParentId === comment.id ? 'Cancel Reply' : 'Reply'}
              </Button>
            )}

            {(comment.replies ?? []).length > 0 && (
              <Stack spacing="14px" sx={{ mt: 1 }}>
                {(comment.replies ?? []).map((reply) => renderCommentThread(reply, depth + 1))}
              </Stack>
            )}
          </Box>
        </Stack>
      </Box>
    );
  };
  const uploadAttachment = async () => {
    if (!snag) {
      return;
    }
    const payload = new FormData();
    payload.append('type', attachmentType);
    if (attachmentType === 'markup') {
      payload.append('markup_data', JSON.stringify({ strokes: [], source: 'web' }));
    }
    if (attachmentFile) {
      payload.append('file', attachmentFile);
    }
    setBusy(true);
    try {
      await api.post(`/api/snags/${snag.id}/attachments`, payload, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setAttachmentFile(null);
      await Promise.all([loadSnag(), onChanged()]);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Attachment upload failed.'));
    } finally {
      setBusy(false);
    }
  };
  const initializeCloseout = async () => {
    if (!snag || !canCloseoutUpdate) {
      return;
    }
    setBusy(true);
    try {
      await api.put(`/api/snags/${snag.id}/closeout`, {
        template_id: selectedTemplateId ? Number(selectedTemplateId) : undefined,
      });
      await Promise.all([loadCloseout(), loadSnag(), onChanged()]);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to initialize closeout.'));
    } finally {
      setBusy(false);
    }
  };
  const updateCloseoutItem = async (item, isCompleted) => {
    if (!canCloseoutUpdate) {
      return;
    }
    setBusy(true);
    try {
      const response = await api.patch(`/api/closeout/items/${item.id}`, {
        is_completed: isCompleted,
        notes: itemNotes[item.id] ?? null,
      });
      setCloseout(response.data.data);
      await Promise.all([loadSnag(), onChanged()]);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to update closeout item.'));
    } finally {
      setBusy(false);
    }
  };
  const uploadCloseoutEvidence = async (item) => {
    if (!canCloseoutUpdate) {
      return;
    }
    const file = evidenceFiles[item.id];
    if (!file) {
      return;
    }
    const payload = new FormData();
    payload.append('file', file);
    setBusy(true);
    try {
      await api.post(`/api/closeout/items/${item.id}/evidence`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setEvidenceFiles((current) => ({ ...current, [item.id]: null }));
      await Promise.all([loadCloseout(), loadSnag(), onChanged()]);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to upload closeout evidence.'));
    } finally {
      setBusy(false);
    }
  };
  const reviewCloseout = async () => {
    if (!snag || !canCloseoutReview) {
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/snags/${snag.id}/closeout/review`);
      await Promise.all([loadCloseout(), loadSnag(), onChanged()]);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to review closeout.'));
    } finally {
      setBusy(false);
    }
  };

  // --- Derived presentation values (frame-1g mapping) ---------------------
  const rejected = snag?.status === 'rejected';
  const priority = snag?.priority ?? null;
  const priorityCritical = priority === 'critical' || priority === 'high';
  const priorityTint = priorityCritical ? 'rgba(178,59,59,0.12)' : STATUS.new.tint;
  const priorityText = priorityCritical ? BRAND.red : BRAND.inkSoft;
  const priorityDot = priorityCritical ? BRAND.red : STATUS.new.dot;
  const reporterName = snag?.reporter?.name ?? snag?.raisedBy?.name ?? snag?.raised_by?.name ?? null;
  const raisedDate = shortDate(snag?.created_at);
  const locationParts = snag
    ? [snag.location, snag.zone, snag.zone?.name, snag.drawing?.reference && `drawing ${snag.drawing.reference}`]
        .map((part) => (typeof part === 'object' && part ? part.name : part))
        .filter(Boolean)
    : [];
  const assignee = snag?.assignee ?? null;
  const assignedCompany = snag?.assignedCompany ?? snag?.assigned_company ?? null;
  const rootCause = snag?.rootCauseCategory ?? snag?.root_cause_category ?? null;
  const due = snag ? dueMeta(snag.due_date, snag.status) : null;
  const dueColor = due?.tone === 'overdue' ? BRAND.red : due?.tone === 'today' ? BRAND.amber : BRAND.ink;
  const closeoutPct = closeout?.completion_percentage ?? 0;
  const statusHistory = snag?.statusHistory ?? snag?.status_history ?? [];
  const attachments = snag?.attachments ?? [];

  // Stepper geometry: index of current status; active teal node + navy fill.
  const currentStepIndex = snag ? LIFECYCLE_STEPS.findIndex((step) => step.status === snag.status) : -1;
  const stepDate = (status) => {
    const entry = statusHistory.find((h) => h.to_status === status);
    return entry ? shortDate(entry.created_at) : null;
  };
  const fillPct = currentStepIndex <= 0 ? 0 : (currentStepIndex / (LIFECYCLE_STEPS.length - 1)) * 100;

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { border: 'none', boxShadow: '0 0 0 1px rgba(20,38,66,0.09)' } }}>
      <Box sx={{ width: { xs: '100vw', sm: 720, md: 860 }, maxWidth: '100vw', bgcolor: BRAND.screen, minHeight: '100%', p: { xs: '18px', sm: '24px 26px' } }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {snag && (
          <Stack spacing="20px">
            {/* 3.1 Snag header block */}
            <Box>
              <Stack direction="row" alignItems="center" spacing="10px" flexWrap="wrap" useFlexGap sx={{ mb: '10px' }}>
                <Mono sx={{ fontSize: 16.5, fontWeight: 700, letterSpacing: '-0.01em', color: BRAND.ink, ...LTR_ISOLATE }}>
                  {snag.reference}
                </Mono>
                <StatusPill status={snag.status} size="small" />
                {priority && (
                  <Box
                    component="span"
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '7px',
                      px: '12px',
                      py: '5px',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      lineHeight: 1,
                      bgcolor: priorityTint,
                      color: priorityText,
                    }}
                  >
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: priorityDot, flex: 'none' }} />
                    {formatStatusLabel(priority)}
                  </Box>
                )}
                {(raisedDate || reporterName) && (
                  <Mono sx={{ fontSize: 12, color: BRAND.muted }}>
                    Raised{raisedDate ? ` ${raisedDate}` : ''}
                    {reporterName ? ` by ${reporterName}` : ''}
                  </Mono>
                )}
                <Box sx={{ flex: 1 }} />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => { onClose(); navigate(`/snags/${snag.id}/inspect`); }}
                  sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
                >
                  Inspect
                </Button>
              </Stack>

              <Typography
                variant="h1"
                sx={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15, color: BRAND.ink }}
              >
                {snag.title}
              </Typography>

              {(locationParts.length > 0 || snag.description) && (
                <Box sx={{ mt: '9px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: 13.5, color: '#5B6B85' }}>
                  <MapPinIcon />
                  <Box component="span">{locationParts.length > 0 ? locationParts.join(' · ') : snag.description}</Box>
                </Box>
              )}
            </Box>

            {/* 3.2 Lifecycle stepper card */}
            <Box sx={{ ...CARD_SX, p: '22px 24px 18px' }}>
              <Box sx={{ position: 'relative', display: 'flex', justifyContent: 'space-between', mx: '12px' }}>
                <Box
                  sx={{
                    position: 'absolute',
                    top: '13px',
                    insetInlineStart: '26px',
                    insetInlineEnd: '26px',
                    height: '2px',
                    background: '#E1E6EE',
                  }}
                />
                <Box
                  sx={{
                    position: 'absolute',
                    top: '13px',
                    insetInlineStart: '26px',
                    width: `${fillPct}%`,
                    height: '2px',
                    background: rejected ? BRAND.red : BRAND.navy,
                  }}
                />
                {LIFECYCLE_STEPS.map((step, index) => {
                  const done = index < currentStepIndex;
                  const active = index === currentStepIndex;
                  const isRejectedNode = active && rejected;
                  const date = stepDate(step.status);
                  return (
                    <Box key={step.status} sx={{ width: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', position: 'relative' }}>
                      <Box
                        sx={{
                          width: 27,
                          height: 27,
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flex: 'none',
                          ...(isRejectedNode
                            ? { bgcolor: '#fff', border: `2px dashed ${BRAND.red}` }
                            : done
                            ? { bgcolor: BRAND.navy }
                            : active
                            ? { bgcolor: BRAND.teal, boxShadow: '0 0 0 4px rgba(47,143,190,0.2)' }
                            : { bgcolor: '#fff', border: '2px solid #D3DAE4' }),
                        }}
                      >
                        {done && <CheckIcon size={14} strokeWidth={3} />}
                        {active && !isRejectedNode && <Box sx={{ width: 9, height: 9, borderRadius: '50%', background: '#fff' }} />}
                      </Box>
                      <Box
                        sx={{
                          fontSize: 12,
                          fontWeight: active ? 700 : 600,
                          color: active ? (rejected ? BRAND.red : '#2276A0') : done ? BRAND.inkSoft : '#A6B0BF',
                          textAlign: 'center',
                          lineHeight: 1.15,
                        }}
                      >
                        {step.label}
                      </Box>
                      <Mono sx={{ fontSize: 9.5, color: '#A6B0BF', ...LTR_ISOLATE }}>{date ?? '—'}</Mono>
                    </Box>
                  );
                })}
              </Box>
            </Box>

            {/* Tabs preserve every section + drive the onboarding tour gating. */}
            <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value)} variant="scrollable" allowScrollButtonsMobile sx={{ minHeight: 40, '& .MuiTab-root': { minHeight: 40, textTransform: 'none', fontWeight: 600, fontSize: 13 } }}>
              {availableTabs.map((tab) => (
                <Tab key={tab.key} value={tab.key} label={tab.label} />
              ))}
            </Tabs>

            {/* Summary tab: evidence gallery + metadata + closeout snapshot */}
            <Box sx={{ display: activeTab === 'overview' ? 'block' : 'none' }}>
              <Stack spacing="20px">
                {/* 3.3 Evidence gallery */}
                <Box>
                  <Box sx={{ fontSize: 14, fontWeight: 700, color: BRAND.ink, mb: '12px' }}>Evidence</Box>
                  <Box sx={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {attachments.length === 0 && (
                      <Box sx={{ width: 148, height: 108, borderRadius: '12px', bgcolor: '#DFE5EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CameraIcon />
                      </Box>
                    )}
                    {attachments.map((attachment, index) => {
                      const badge = (attachment.type ?? 'photo').toUpperCase();
                      return (
                        <Box
                          key={attachment.id}
                          sx={{ position: 'relative', width: 148, height: 108, borderRadius: '12px', bgcolor: '#DFE5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
                        >
                          <CameraIcon />
                          <Mono
                            sx={{
                              position: 'absolute',
                              bottom: '7px',
                              insetInlineStart: '7px',
                              fontSize: 9.5,
                              fontWeight: 600,
                              color: '#fff',
                              bgcolor: 'rgba(20,38,66,0.7)',
                              px: '7px',
                              py: '2px',
                              borderRadius: '5px',
                            }}
                          >
                            {index === 0 && attachment.type === 'photo' ? 'BEFORE' : badge}
                          </Mono>
                        </Box>
                      );
                    })}
                    {canAttach && (
                      <Box
                        component="label"
                        sx={{
                          width: 108,
                          height: 108,
                          borderRadius: '12px',
                          border: '1.5px dashed rgba(20,38,66,0.2)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          color: '#A6B0BF',
                          cursor: busy ? 'default' : 'pointer',
                          transition: 'border-color .15s, color .15s',
                          '&:hover': { borderColor: BRAND.navy, color: BRAND.navy },
                        }}
                      >
                        <Box component="svg" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round">
                          <path d="M12 5v14M5 12h14" />
                        </Box>
                        <Box sx={{ fontSize: 11, fontWeight: 600 }}>Add after</Box>
                        <input
                          hidden
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            if (file) {
                              setAttachmentType('photo');
                              setAttachmentFile(file);
                            }
                          }}
                        />
                      </Box>
                    )}
                  </Box>
                  {canAttach && attachmentFile && (
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.2 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ ...LTR_ISOLATE }}>
                        {attachmentFile.name}
                      </Typography>
                      <Button size="small" variant="contained" onClick={() => void uploadAttachment()} disabled={busy}>
                        Upload
                      </Button>
                      <Button size="small" onClick={() => setAttachmentFile(null)} disabled={busy}>
                        Cancel
                      </Button>
                    </Stack>
                  )}
                </Box>

                {/* 3.5 Metadata card */}
                <Box sx={{ ...CARD_SX, p: '16px 18px' }}>
                  <MetaRow first label="Assignee">
                    {assignee ? (
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                        <Avatar initials={initialsOf(assignee.name)} bg={BRAND.green} size={22} fontSize={9} />
                        <Box component="span" sx={{ fontSize: 13, fontWeight: 600, color: BRAND.ink }}>
                          {assignee.name}
                        </Box>
                      </Box>
                    ) : (
                      <MetaValue>Unassigned</MetaValue>
                    )}
                  </MetaRow>
                  <MetaRow label="Company">
                    <MetaValue>{assignedCompany?.name ?? '—'}</MetaValue>
                  </MetaRow>
                  {snag.trade && (
                    <MetaRow label="Discipline">
                      <MetaValue>{snag.trade}</MetaValue>
                    </MetaRow>
                  )}
                  {isDlpSnag && (
                    <>
                      <MetaRow label="DLP">
                        <MetaValue>Defects Liability Period</MetaValue>
                      </MetaRow>
                      <MetaRow label="Cluster">
                        <MetaValue>{snag.cluster ?? '—'}</MetaValue>
                      </MetaRow>
                      <MetaRow label="TOC">
                        <Mono sx={{ fontSize: 13, fontWeight: 600, color: BRAND.ink, ...LTR_ISOLATE }}>{snag.toc_reference ?? '—'}</Mono>
                      </MetaRow>
                    </>
                  )}
                  <MetaRow label="Due date">
                    <MetaValue sx={{ color: dueColor, ...LTR_ISOLATE }}>
                      {snag.due_date ? new Date(snag.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Not set'}
                      {due?.tone === 'overdue' ? ' · overdue' : due?.tone === 'today' ? ' · today' : ''}
                    </MetaValue>
                  </MetaRow>
                  <MetaRow label="Root cause">
                    <MetaValue>{rootCause?.name ?? '—'}</MetaValue>
                  </MetaRow>
                  <MetaRow label="Est. cost">
                    <Mono sx={{ fontSize: 13, fontWeight: 600, color: BRAND.ink, ...LTR_ISOLATE }}>
                      {typeof snag.estimated_cost === 'number' ? `SAR ${snag.estimated_cost.toFixed(0)}` : '—'}
                    </Mono>
                  </MetaRow>
                </Box>

                <Box sx={{ fontSize: 12.5, color: BRAND.muted }}>
                  Comments: {(snag.comments ?? []).length} · Attachments: {attachments.length}
                  {canCloseoutView ? ` · Closeout ${closeoutPct}%` : ''}
                </Box>
              </Stack>
            </Box>

            {/* Take Action tab: status/transition panel + assignment + attachments */}
            <Box sx={{ display: activeTab === 'actions' ? 'block' : 'none' }}>
              {canTransition && (
                <Stack spacing={1.5} id="status-panel">
                  {recommendedTransition && (
                    <Box sx={{ ...CARD_SX, p: '14px 16px' }}>
                      <SectionLabel sx={{ mb: 1 }}>Recommended next step</SectionLabel>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <StatusPill status={recommendedTransition} label={formatStatusLabel(recommendedTransition)} size="small" />
                        <Button
                          variant="contained"
                          onClick={() => setTransitionTo(recommendedTransition)}
                          disabled={busy}
                          sx={{ px: '16px', py: '8px', borderRadius: '11px', fontSize: 13, fontWeight: 600 }}
                        >
                          Use Recommended
                        </Button>
                      </Stack>
                      {workflow?.blocked?.closed && (
                        <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>
                          {workflow.blocked.closed}
                        </Typography>
                      )}
                    </Box>
                  )}

                  {nextActions.length > 0 && (
                    <Stack spacing={0.8}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        Available Next Actions
                      </Typography>
                      {nextActions.map((action) => (
                        <Box key={action.action_key} sx={{ ...CARD_SX, p: '12px 14px' }}>
                          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                            <StatusPill status={action.to_status} label={action.label ?? formatStatusLabel(action.to_status)} size="small" />
                            <Button variant="outlined" disabled={busy || !action.allowed} onClick={() => setTransitionTo(action.to_status)} sx={{ borderRadius: '11px' }}>
                              Select
                            </Button>
                          </Stack>
                          {!action.allowed && action.reason && (
                            <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.6 }}>
                              {action.reason}
                            </Typography>
                          )}
                        </Box>
                      ))}
                    </Stack>
                  )}

                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Change Status
                  </Typography>
                  <FormControl size="small">
                    <InputLabel id="transition-select-label">To status</InputLabel>
                    <Select labelId="transition-select-label" value={transitionTo} label="To status" onChange={(event) => setTransitionTo(event.target.value)}>
                      {availableTransitions.map((status) => (
                        <MenuItem key={status} value={status}>
                          {formatStatusLabel(status)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {canAssign && (
                    <>
                      <FormControl size="small">
                        <InputLabel id="company-transition-label">Company</InputLabel>
                        <Select
                          labelId="company-transition-label"
                          value={transitionCompanyId}
                          label="Company"
                          onChange={(event) => {
                            const value = String(event.target.value);
                            setTransitionCompanyId(value);
                            if (transitionTeamId) {
                              const team = teams.find((item) => item.id === Number(transitionTeamId));
                              if (team?.company_id && team.company_id !== Number(value || 0)) {
                                setTransitionTeamId('');
                              }
                            }
                          }}
                        >
                          <MenuItem value="">No company</MenuItem>
                          {companies.map((company) => (
                            <MenuItem key={company.id} value={company.id}>
                              {company.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <FormControl size="small">
                        <InputLabel id="team-transition-label">Team</InputLabel>
                        <Select labelId="team-transition-label" value={transitionTeamId} label="Team" onChange={(event) => setTransitionTeamId(String(event.target.value))}>
                          <MenuItem value="">No team</MenuItem>
                          {availableTeams.map((team) => (
                            <MenuItem key={team.id} value={team.id}>
                              {team.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <FormControl size="small">
                        <InputLabel id="assignee-transition-label">Assignee</InputLabel>
                        <Select labelId="assignee-transition-label" value={transitionAssigneeId} label="Assignee" onChange={(event) => setTransitionAssigneeId(String(event.target.value))}>
                          <MenuItem value="">Unassigned</MenuItem>
                          {members.map((member) => (
                            <MenuItem key={member.id} value={member.id}>
                              {member.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </>
                  )}

                  <TextField
                    size="small"
                    label={dlpReopenPending ? 'Rework comment (required, min 30 chars)' : 'Transition note'}
                    value={transitionNote}
                    onChange={(event) => setTransitionNote(event.target.value)}
                    required={dlpReopenPending}
                    error={dlpReopenNoteTooShort}
                    helperText={dlpReopenPending ? `${transitionNote.trim().length}/30 characters — explain the rework required` : undefined}
                    multiline={dlpReopenPending}
                    minRows={dlpReopenPending ? 2 : 1}
                  />

                  <Button
                    onClick={() => void applyTransition()}
                    variant="contained"
                    disabled={!transitionTo || busy || dlpReopenNoteTooShort}
                    sx={{ py: '12px', borderRadius: '11px', fontSize: 13.5, fontWeight: 600 }}
                  >
                    Apply Transition
                  </Button>

                  {canAssign && (
                    <Stack direction="row" spacing="9px">
                      <Button onClick={() => void saveAssignment()} variant="outlined" disabled={busy} sx={{ flex: 1, py: '10px', borderRadius: '11px', color: BRAND.inkSoft, borderColor: 'rgba(20,38,66,0.14)' }}>
                        Reassign
                      </Button>
                      <Button
                        onClick={() => void dispatchToPerson()}
                        variant="outlined"
                        disabled={busy || !transitionAssigneeId || (!transitionCompanyId && !transitionTeamId)}
                        sx={{ flex: 1, py: '10px', borderRadius: '11px', color: BRAND.inkSoft, borderColor: 'rgba(20,38,66,0.14)' }}
                      >
                        Dispatch
                      </Button>
                    </Stack>
                  )}

                  {availableTransitions.includes('rejected') && (
                    <Button
                      onClick={() => setTransitionTo('rejected')}
                      variant="outlined"
                      disabled={busy}
                      sx={{ py: '10px', borderRadius: '11px', color: BRAND.red, borderColor: 'rgba(178,59,59,0.3)', '&:hover': { borderColor: BRAND.red, bgcolor: 'rgba(178,59,59,0.06)' } }}
                    >
                      {isDlpSnag ? 'Reopen for rework' : 'Reject'}
                    </Button>
                  )}
                </Stack>
              )}

              {canAttach && (
                <Stack spacing={1} sx={{ mt: 2 }}>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Attachments
                  </Typography>
                  <FormControl size="small">
                    <InputLabel id="attachment-type-label">Type</InputLabel>
                    <Select labelId="attachment-type-label" value={attachmentType} label="Type" onChange={(event) => setAttachmentType(event.target.value)}>
                      <MenuItem value="photo">Photo</MenuItem>
                      <MenuItem value="video">Video</MenuItem>
                      <MenuItem value="markup">Markup</MenuItem>
                    </Select>
                  </FormControl>

                  <Button variant="outlined" component="label" disabled={attachmentType === 'markup'} sx={{ borderRadius: '11px' }}>
                    {attachmentFile ? attachmentFile.name : 'Choose file'}
                    <input hidden type="file" accept={attachmentType === 'video' ? 'video/*' : 'image/*,.pdf'} onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)} />
                  </Button>

                  <Button variant="contained" onClick={() => void uploadAttachment()} disabled={(attachmentType !== 'markup' && !attachmentFile) || busy} sx={{ borderRadius: '11px' }}>
                    Upload Attachment
                  </Button>

                  <List dense>
                    {attachments.map((attachment) => (
                      <ListItem key={attachment.id}>
                        <ListItemText
                          primary={`${attachment.type.toUpperCase()} - ${attachment.file_name ?? 'markup json'}`}
                          secondary={attachment.file_path ? `Path: ${attachment.file_path}` : JSON.stringify(attachment.markup_data ?? {})}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Stack>
              )}
            </Box>

            {/* 3.6 Closeout card */}
            <Box sx={{ display: activeTab === 'closeout' ? 'block' : 'none' }}>
              {canCloseoutView && (
                <Box sx={{ ...CARD_SX, p: '16px 18px' }} id="closeout-panel">
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: '12px' }} id="closeout-completion">
                    <Box sx={{ fontSize: 14, fontWeight: 700, color: BRAND.ink }}>Closeout</Box>
                    <Mono sx={{ fontSize: 12, fontWeight: 600, color: BRAND.amber, ...LTR_ISOLATE }}>{closeoutPct}%</Mono>
                  </Stack>

                  <LinearProgress
                    variant="determinate"
                    value={closeoutPct}
                    sx={{
                      height: 7,
                      borderRadius: 999,
                      mb: '14px',
                      backgroundColor: '#F1F3F8',
                      '& .MuiLinearProgress-bar': { borderRadius: 999, backgroundColor: '#C08A23' },
                    }}
                  />

                  {canCloseoutUpdate && (
                    <Stack spacing={1} id="closeout-template" sx={{ mb: 1.5 }}>
                      <FormControl size="small">
                        <InputLabel id="closeout-template-label">Template</InputLabel>
                        <Select labelId="closeout-template-label" value={selectedTemplateId} label="Template" onChange={(event) => setSelectedTemplateId(String(event.target.value))}>
                          {templates.map((template) => (
                            <MenuItem key={template.id} value={template.id}>
                              {template.name}
                              {template.is_library ? ' (Library)' : ''}
                              {template.discipline ? ` - ${template.discipline}` : ''}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <Button variant="outlined" onClick={() => void initializeCloseout()} disabled={busy} sx={{ borderRadius: '11px' }}>
                        {closeout ? 'Update Template' : 'Initialize Closeout'}
                      </Button>
                    </Stack>
                  )}

                  <Stack id="closeout-checklist">
                    {(closeout?.items ?? []).map((item) => {
                      const done = item.is_completed;
                      return (
                        <Box key={item.id} sx={{ py: '7px' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                            <Box
                              sx={{
                                width: 19,
                                height: 19,
                                borderRadius: '6px',
                                flex: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: canCloseoutUpdate && !busy ? 'pointer' : 'default',
                                ...(done ? { bgcolor: BRAND.green } : { border: '1.6px solid #D3DAE4' }),
                              }}
                              role={canCloseoutUpdate ? 'button' : undefined}
                              onClick={() => {
                                if (canCloseoutUpdate && !busy) {
                                  void updateCloseoutItem(item, !item.is_completed);
                                }
                              }}
                            >
                              {done && <CheckIcon size={12} strokeWidth={3.2} />}
                            </Box>
                            <Box sx={{ flex: 1, fontSize: 12.5, fontWeight: done ? 400 : 500, color: done ? BRAND.inkSoft : BRAND.ink }}>{item.title}</Box>
                            {item.required && !done && (
                              <Box component="span" sx={{ fontSize: 10, fontWeight: 600, color: BRAND.amber, bgcolor: 'rgba(192,138,35,0.13)', px: '7px', py: '2px', borderRadius: '5px', flex: 'none' }}>
                                Required
                              </Box>
                            )}
                            {item.evidence_required && (
                              <Box component="span" sx={{ fontSize: 10, fontWeight: 600, color: BRAND.inkSoft, bgcolor: STATUS.new.tint, px: '7px', py: '2px', borderRadius: '5px', flex: 'none' }}>
                                Evidence
                              </Box>
                            )}
                          </Box>

                          {canCloseoutUpdate && (
                            <Stack spacing={1} sx={{ mt: 1, ml: '28px' }}>
                              <TextField
                                size="small"
                                label="Notes"
                                value={itemNotes[item.id] ?? ''}
                                onChange={(event) => setItemNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                              />
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Button size="small" variant={item.is_completed ? 'outlined' : 'contained'} onClick={() => void updateCloseoutItem(item, !item.is_completed)} disabled={busy} sx={{ borderRadius: '11px' }}>
                                  {item.is_completed ? 'Mark Incomplete' : 'Mark Complete'}
                                </Button>
                              </Stack>
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Button size="small" variant="outlined" component="label" sx={{ borderRadius: '11px' }}>
                                  {evidenceFiles[item.id]?.name ?? 'Choose evidence'}
                                  <input
                                    hidden
                                    type="file"
                                    accept="image/*,video/*,.pdf"
                                    onChange={(event) => setEvidenceFiles((current) => ({ ...current, [item.id]: event.target.files?.[0] ?? null }))}
                                  />
                                </Button>
                                <Button size="small" variant="contained" disabled={!evidenceFiles[item.id] || busy} onClick={() => void uploadCloseoutEvidence(item)} sx={{ borderRadius: '11px' }}>
                                  Upload
                                </Button>
                              </Stack>
                            </Stack>
                          )}

                          {(item.evidences ?? []).length > 0 && (
                            <List dense sx={{ py: 0, ml: '28px' }}>
                              {(item.evidences ?? []).map((evidence) => (
                                <ListItem key={evidence.id} sx={{ px: 0 }}>
                                  <ListItemText
                                    primary={evidence.file_name}
                                    secondary={
                                      <a href={`/api/closeout/evidence/${evidence.id}/download`} target="_blank" rel="noreferrer">
                                        Download evidence
                                      </a>
                                    }
                                  />
                                </ListItem>
                              ))}
                            </List>
                          )}
                          <Divider sx={{ mt: '7px', borderColor: 'rgba(20,38,66,0.06)' }} />
                        </Box>
                      );
                    })}
                  </Stack>

                  {canCloseoutReview && closeout && closeout.completion_percentage === 100 && closeout.status !== 'reviewed' && (
                    <Button variant="contained" onClick={() => void reviewCloseout()} disabled={busy} sx={{ mt: 1.5, borderRadius: '11px' }}>
                      Mark Reviewed
                    </Button>
                  )}
                </Box>
              )}
              {!canCloseoutView && <Typography color="text.secondary">Closeout is not enabled for your role.</Typography>}
            </Box>

            {/* 3.4 Activity thread (comments) */}
            <Box sx={{ display: activeTab === 'comments' ? 'block' : 'none' }}>
              {canComment && (
                <Stack spacing={1.5}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Watchers
                    </Typography>
                    <Button size="small" onClick={() => setWatchersExpanded((current) => !current)}>
                      {watchersExpanded ? 'Hide' : 'Show'}
                    </Button>
                  </Stack>

                  {watchersExpanded && (
                    <>
                      <Stack direction="row" spacing={1}>
                        <FormControl size="small" fullWidth>
                          <InputLabel id="watcher-select-label">Add watcher</InputLabel>
                          <Select labelId="watcher-select-label" value={watcherUserId} label="Add watcher" onChange={(event) => setWatcherUserId(String(event.target.value))}>
                            <MenuItem value="">Select member</MenuItem>
                            {members.map((member) => (
                              <MenuItem key={member.id} value={member.id}>
                                {member.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <Button variant="outlined" onClick={() => void addWatcher()} disabled={!watcherUserId || busy} sx={{ borderRadius: '11px' }}>
                          Watch
                        </Button>
                      </Stack>

                      <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
                        {watcherUsers.length === 0 ? (
                          <Typography variant="body2" color="text.secondary">
                            No watchers yet.
                          </Typography>
                        ) : (
                          watcherUsers.map((watcher) => <Chip key={watcher.id} label={watcher.name} onDelete={() => void removeWatcher(watcher.id)} size="small" />)
                        )}
                      </Stack>
                    </>
                  )}

                  <Divider />

                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Activity
                    </Typography>
                    <Button size="small" onClick={() => setCommentsExpanded((current) => !current)}>
                      {commentsExpanded ? 'Hide' : 'Show'}
                    </Button>
                  </Stack>
                  {commentsExpanded && (
                    <>
                      <Stack spacing="14px">
                        {(snag.comments ?? []).length === 0 ? (
                          <Typography variant="body2" color="text.secondary">
                            No activity yet.
                          </Typography>
                        ) : (
                          (snag.comments ?? []).map((comment) => renderCommentThread(comment))
                        )}
                      </Stack>

                      {commentParentId && (
                        <Chip size="small" color="info" label={`Replying to #${commentParentId}`} onDelete={() => setCommentParentId(null)} sx={{ alignSelf: 'flex-start' }} />
                      )}

                      {/* 3.4 Comment composer (pinned) */}
                      <TextField
                        multiline
                        minRows={1}
                        size="small"
                        value={commentBody}
                        onChange={(event) => setCommentBody(event.target.value)}
                        placeholder="Add a comment… use @ to mention"
                        InputProps={{
                          sx: { borderRadius: '11px', bgcolor: '#fff' },
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton size="small" onClick={() => void addComment()} disabled={!commentBody.trim() || busy} aria-label="Add Comment">
                                <SendIcon active={Boolean(commentBody.trim()) && !busy} />
                              </IconButton>
                            </InputAdornment>
                          ),
                        }}
                      />

                      <FormControl size="small">
                        <InputLabel id="mention-users-label">Mention users</InputLabel>
                        <Select
                          labelId="mention-users-label"
                          multiple
                          value={mentionUserIds}
                          label="Mention users"
                          onChange={(event) => setMentionUserIds(event.target.value)}
                          renderValue={(selected) => selected.map((id) => members.find((member) => member.id === Number(id))?.name ?? id).join(', ')}
                        >
                          {members.map((member) => (
                            <MenuItem key={member.id} value={String(member.id)}>
                              {member.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <FormControl size="small">
                        <InputLabel id="mention-teams-label">Mention teams</InputLabel>
                        <Select
                          labelId="mention-teams-label"
                          multiple
                          value={mentionTeamIds}
                          label="Mention teams"
                          onChange={(event) => setMentionTeamIds(event.target.value)}
                          renderValue={(selected) => selected.map((id) => teams.find((team) => team.id === Number(id))?.name ?? id).join(', ')}
                        >
                          {teams.map((team) => (
                            <MenuItem key={team.id} value={String(team.id)}>
                              {team.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <Button variant="outlined" component="label" sx={{ borderRadius: '11px' }}>
                        {commentFiles.length > 0 ? `${commentFiles.length} file(s) selected` : 'Attach files'}
                        <input hidden type="file" multiple accept="image/*,video/*,.pdf" onChange={(event) => setCommentFiles(Array.from(event.target.files ?? []))} />
                      </Button>
                      <Button variant="outlined" onClick={() => void addComment()} disabled={!commentBody.trim() || busy} sx={{ borderRadius: '11px' }}>
                        Add Comment
                      </Button>
                    </>
                  )}
                </Stack>
              )}
              {!canComment && <Typography color="text.secondary">Comment permissions are not available for your role.</Typography>}
            </Box>

            {/* History trail */}
            <Box sx={{ display: activeTab === 'history' ? 'block' : 'none' }} id="history-panel">
              <Stack spacing={1.5}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Status History
                </Typography>
                <Stack spacing="14px">
                  {statusHistory.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No activity yet.
                    </Typography>
                  ) : (
                    statusHistory.map((history) => (
                      <Stack key={history.id} direction="row" spacing="11px" alignItems="center">
                        <Box sx={{ width: 30, height: 30, borderRadius: '50%', bgcolor: '#F1F3F8', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                          <Box sx={{ width: 9, height: 9, borderRadius: '50%', background: BRAND.navy }} />
                        </Box>
                        <Box sx={{ fontSize: 12.5, color: BRAND.muted }}>
                          <Box component="strong" sx={{ color: BRAND.ink, fontWeight: 600 }}>
                            {history.changedBy?.name ?? 'User'}
                          </Box>{' '}
                          moved{' '}
                          <Box component="span" sx={{ color: BRAND.navy, fontWeight: 600, ...LTR_ISOLATE }}>
                            {formatStatusLabel(history.from_status ?? 'none')} → {formatStatusLabel(history.to_status)}
                          </Box>{' '}
                          ·{' '}
                          <Box component="span" sx={{ ...LTR_ISOLATE }}>
                            {new Date(history.created_at).toLocaleString()}
                          </Box>
                        </Box>
                      </Stack>
                    ))
                  )}
                </Stack>
              </Stack>
            </Box>
          </Stack>
        )}
      </Box>
    </Drawer>
  );
};

// Metadata key/value row (frame-1g §3.5).
const MetaRow = ({ label, children, first }) => (
  <Box
    sx={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      py: '7px',
      ...(first ? {} : { borderTop: '1px solid rgba(20,38,66,0.06)' }),
    }}
  >
    <Box sx={{ fontFamily: FONT_MONO, fontSize: 11, color: BRAND.muted }}>{label}</Box>
    {children}
  </Box>
);

const MetaValue = ({ children, sx }) => (
  <Box sx={{ fontSize: 13, fontWeight: 600, color: BRAND.ink, textAlign: 'end', ...sx }}>{children}</Box>
);
