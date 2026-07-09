import {
    Alert,
    Box,
    Button,
    Divider,
    List,
    ListItem,
    ListItemText,
    Paper,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { DynamicInspectionForm } from '../components/DynamicInspectionForm';
import { SignaturePad } from '../components/SignaturePad';
import { useAuth } from '../hooks/useAuth';
import { useFeatureTour } from '../hooks/useFeatureTour';
import { subscribeOrganizationChannel } from '../realtime/echo';
import { BRAND, FONT_MONO } from '../theme';
import { Mono, SectionLabel } from '../components/ui/Mono';

// Per-status pill palette matching the frame-1i spec (submitted/in_review →
// amber Review, approved → green Closed, rejected → red, draft → muted).
const STATUS_PILL = {
    draft: { label: 'Draft', bg: '#F1F3F8', text: '#51627F' },
    submitted: { label: 'Submitted', bg: 'rgba(192,138,35,0.14)', text: '#9C6E14' },
    in_review: { label: 'In review', bg: 'rgba(192,138,35,0.14)', text: '#9C6E14' },
    approved: { label: 'Approved', bg: 'rgba(110,140,58,0.15)', text: '#56702C' },
    rejected: { label: 'Rejected', bg: 'rgba(178,59,59,0.13)', text: '#B23B3B' },
};

const pillFor = (status) => STATUS_PILL[status] ?? { label: status ?? '—', bg: '#F1F3F8', text: '#51627F' };

const StatusPillInline = ({ status }) => {
    const pill = pillFor(status);
    return (
        <Box
            component="span"
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                px: '9px',
                py: '3px',
                borderRadius: 999,
                fontSize: 10.5,
                fontWeight: 600,
                lineHeight: 1,
                background: pill.bg,
                color: pill.text,
                whiteSpace: 'nowrap',
            }}
        >
            {pill.label}
        </Box>
    );
};

// Resolve a stored field value into pass | fail | na | '' — mirrors the
// DynamicInspectionForm resolver so the donut/passed count stay in sync.
const PASS_VALUES = new Set(['pass', 'passed', true, 'true', 'yes', 'ok']);
const FAIL_VALUES = new Set(['fail', 'failed', false, 'false', 'no']);
const NA_VALUES = new Set(['na', 'n/a', 'not_applicable']);

const resolveResult = (raw) => {
    if (raw === undefined || raw === null || raw === '') return '';
    if (typeof raw === 'object') {
        const nested = raw.result ?? raw.value ?? raw.status;
        return nested !== undefined ? resolveResult(nested) : '';
    }
    const token = typeof raw === 'string' ? raw.trim().toLowerCase() : raw;
    if (PASS_VALUES.has(token)) return 'pass';
    if (FAIL_VALUES.has(token)) return 'fail';
    if (NA_VALUES.has(token)) return 'na';
    return '';
};

const extractError = (error, fallback) => {
    if (typeof error === 'object' && error && 'response' in error) {
        const response = error.response;
        const firstError = response?.data?.errors ? Object.values(response.data.errors).flat().at(0) : null;
        return firstError ?? response?.data?.message ?? fallback;
    }
    return fallback;
};

// Small labelled tile used in the sign-off/side rail for step & signature counts.
const CountTile = ({ label, value, dot }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: dot, flex: 'none' }} />
        <Box sx={{ fontSize: 12.5, color: BRAND.inkSoft }}>
            {label}{' '}
            <Box component="span" sx={{ fontFamily: FONT_MONO, fontWeight: 600, color: BRAND.ink }} dir="ltr">
                {value}
            </Box>
        </Box>
    </Box>
);

export const InspectionSubmissionDetailPage = () => {
    const navigate = useNavigate();
    const { submissionId } = useParams();
    const { activeOrganization, permissions } = useAuth();
    const activeOrganizationId = activeOrganization?.id ?? null;
    const canUpdate = permissions.includes('inspections.submissions.update');
    const canSubmit = permissions.includes('inspections.submissions.submit');
    const canReview = permissions.includes('inspections.approvals.review');
    const canSign = permissions.includes('inspections.signatures.sign');
    const [submission, setSubmission] = useState(null);
    const [formData, setFormData] = useState({});
    const [decisionNotes, setDecisionNotes] = useState('');
    const [approvalMessageBody, setApprovalMessageBody] = useState('');
    const [signatureData, setSignatureData] = useState(null);
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const approvalsTourSteps = useMemo(() => [
        {
            id: 'approvals_timeline',
            title: 'Approval Timeline',
            text: 'Track each workflow step, acting role, and decision status.',
            attachTo: { element: '#approval-timeline', on: 'left' },
        },
        {
            id: 'approvals_actions',
            title: 'Approval Actions',
            text: 'Approve or reject the current step when your role is the active approver.',
            attachTo: { element: '#approval-actions', on: 'left' },
        },
        {
            id: 'approvals_signature',
            title: 'Digital Signature',
            text: 'Capture and upload signature for steps that require sign-off.',
            attachTo: { element: '#signature-panel', on: 'left' },
        },
    ], []);
    useFeatureTour({
        tourKey: 'approvals',
        enabled: Boolean(submission),
        steps: approvalsTourSteps,
    });
    const numericSubmissionId = Number(submissionId);
    const loadSubmission = useCallback(async () => {
        if (!numericSubmissionId) {
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const response = await api.get(`/api/inspections/submissions/${numericSubmissionId}`);
            setSubmission(response.data.data);
            setFormData(response.data.data.form_data ?? {});
        }
        catch {
            setError('Unable to load inspection submission.');
        }
        finally {
            setLoading(false);
        }
    }, [numericSubmissionId]);
    useEffect(() => {
        void loadSubmission();
    }, [loadSubmission]);
    useEffect(() => {
        if (!activeOrganizationId || !numericSubmissionId) {
            return;
        }
        const unsubscribe = subscribeOrganizationChannel(activeOrganizationId, {
            onInspection: (payload) => {
                if (Number(payload.inspection_submission_id ?? 0) === numericSubmissionId) {
                    void loadSubmission();
                }
            },
        });
        return () => {
            unsubscribe();
        };
    }, [activeOrganizationId, loadSubmission, numericSubmissionId]);
    const pendingApproval = useMemo(() => {
        if (!submission?.approvals) {
            return null;
        }
        return ([...submission.approvals]
            .sort((a, b) => a.step_order - b.step_order)
            .find((approval) => approval.status === 'pending') ?? null);
    }, [submission]);
    const saveForm = async () => {
        if (!submission || !canUpdate) {
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const response = await api.put(`/api/inspections/submissions/${submission.id}`, {
                form_data: formData,
            });
            setSubmission(response.data.data);
        }
        catch (requestError) {
            setError(extractError(requestError, 'Unable to update form data.'));
        }
        finally {
            setBusy(false);
        }
    };
    const submitForReview = async () => {
        if (!submission || !canSubmit) {
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const response = await api.post(`/api/inspections/submissions/${submission.id}/submit`);
            setSubmission(response.data.data);
        }
        catch (requestError) {
            setError(extractError(requestError, 'Unable to submit inspection.'));
        }
        finally {
            setBusy(false);
        }
    };
    const decide = async (decision) => {
        if (!submission || !canReview) {
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const response = await api.post(`/api/inspections/submissions/${submission.id}/approve`, {
                decision,
                notes: decisionNotes || undefined,
            });
            setSubmission(response.data.data);
            setDecisionNotes('');
        }
        catch (requestError) {
            setError(extractError(requestError, `Unable to ${decision} this step.`));
        }
        finally {
            setBusy(false);
        }
    };
    const uploadSignature = async () => {
        if (!submission || !canSign || !signatureData) {
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const response = await api.post(`/api/inspections/submissions/${submission.id}/signatures`, {
                signature_data: signatureData,
                approval_id: pendingApproval?.id,
                context: 'approval_step',
            });
            setSubmission(response.data.data);
            setSignatureData(null);
        }
        catch (requestError) {
            setError(extractError(requestError, 'Unable to upload signature.'));
        }
        finally {
            setBusy(false);
        }
    };
    const postApprovalMessage = async () => {
        if (!submission || !approvalMessageBody.trim()) {
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await api.post(`/api/inspections/submissions/${submission.id}/approval-messages`, {
                body: approvalMessageBody,
                approval_id: pendingApproval?.id,
                message_type: 'comment',
            });
            setApprovalMessageBody('');
            await loadSubmission();
        }
        catch (requestError) {
            setError(extractError(requestError, 'Unable to post approval message.'));
        }
        finally {
            setBusy(false);
        }
    };
    const approvalMessages = submission?.approvalMessages ?? submission?.approval_messages ?? [];
    const metrics = useMemo(() => ({
        steps: submission?.approvals?.length ?? 0,
        approved: (submission?.approvals ?? []).filter((approval) => approval.status === 'approved').length,
        signatures: submission?.signatures?.length ?? 0,
        requests: submission?.requests?.length ?? 0,
    }), [submission]);

    // Multi-party observation attribution (item 8 / BR-BR-002): who contributed
    // which fields, on behalf of which party.
    const contributorGroups = useMemo(() => {
        const groups = new Map();
        for (const contribution of submission?.contributions ?? []) {
            const key = `${contribution.user_id}:${contribution.stakeholder_company_id ?? 'none'}`;
            if (!groups.has(key)) {
                groups.set(key, {
                    key,
                    userName: contribution.user?.name ?? 'User',
                    company: contribution.company?.name ?? null,
                    fields: [],
                });
            }
            if (contribution.field_key) groups.get(key).fields.push(contribution.field_key);
        }
        return [...groups.values()];
    }, [submission]);

    // Checklist completion from the live form values (pass counts / donut arc).
    const checklist = useMemo(() => {
        const sections = submission?.template?.schema?.sections ?? [];
        const fields = sections.flatMap((section) => section.fields ?? []);
        const total = fields.length;
        let passed = 0;
        let answered = 0;
        fields.forEach((field) => {
            const result = resolveResult(formData?.[field.key]);
            if (result) answered += 1;
            if (result === 'pass') passed += 1;
        });
        const percent = total > 0 ? Math.round((answered / total) * 100) : 0;
        return { total, passed, answered, percent };
    }, [submission, formData]);

    const donutDeg = Math.round((checklist.percent / 100) * 360);
    const canEditForm = canUpdate && ['draft', 'in_review'].includes(submission?.status);

    if (!numericSubmissionId) {
        return <Alert severity="error">Invalid inspection submission id.</Alert>;
    }
    if (loading && !submission) {
        return (
            <Box sx={{ p: 2, color: BRAND.muted, fontSize: 13.5 }}>Loading inspection submission…</Box>
        );
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            {submission && (
                <>
                    {/* Flat screen title block (replaces the old PageHero) */}
                    <Box sx={{ mb: 2.25, display: 'flex', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap' }}>
                        <Button
                            variant="text"
                            startIcon={<ArrowBackRoundedIcon />}
                            onClick={() => navigate('/inspections/submissions')}
                            sx={{ color: BRAND.inkSoft, fontSize: 12.5, fontWeight: 600, px: 1, minWidth: 0 }}
                        >
                            Back
                        </Button>
                        <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontSize: 16.5, fontWeight: 700, letterSpacing: '-0.01em', color: BRAND.ink }}>
                                {submission.template?.name ?? 'Inspection'}
                            </Typography>
                            <Mono sx={{ fontSize: 12, color: BRAND.muted, mt: '1px', display: 'block' }} dir="ltr">
                                {[submission.reference, submission.project?.code ?? submission.project?.name]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </Mono>
                        </Box>
                        <Box sx={{ flex: 1 }} />
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                            <StatusPillInline status={submission.status} />
                            {canUpdate && (
                                <Button
                                    variant="outlined"
                                    onClick={() => void saveForm()}
                                    disabled={busy}
                                    sx={{ borderRadius: '10px', fontSize: 12.5, fontWeight: 600 }}
                                >
                                    Save draft
                                </Button>
                            )}
                            {canSubmit && submission.status === 'draft' && (
                                <Button
                                    variant="contained"
                                    onClick={() => void submitForReview()}
                                    disabled={busy}
                                    sx={{ borderRadius: '10px', fontSize: 12.5, fontWeight: 600 }}
                                >
                                    Submit
                                </Button>
                            )}
                        </Stack>
                    </Box>

                    {/* Two-pane: checklist runner (left) + approvals rail (right) */}
                    <Box
                        sx={{
                            display: 'flex',
                            gap: '18px',
                            flex: 1,
                            minHeight: 0,
                            flexDirection: { xs: 'column', lg: 'row' },
                        }}
                    >
                        {/* Checklist runner card */}
                        <Box
                            sx={{
                                flex: 1.4,
                                minWidth: 0,
                                background: '#fff',
                                borderRadius: '16px',
                                border: '1px solid rgba(20,38,66,0.08)',
                                boxShadow: '0 1px 2px rgba(20,38,66,0.03)',
                                overflow: 'hidden',
                                display: 'flex',
                                flexDirection: 'column',
                            }}
                        >
                            {/* Detail header — donut + title/meta */}
                            <Box
                                sx={{
                                    p: '20px 22px 16px',
                                    borderBottom: '1px solid rgba(20,38,66,0.07)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '16px',
                                }}
                            >
                                <Box
                                    sx={{
                                        width: 62,
                                        height: 62,
                                        flex: 'none',
                                        borderRadius: '50%',
                                        background: `conic-gradient(${BRAND.green} 0 ${donutDeg}deg, #E6EAF0 ${donutDeg}deg 360deg)`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        position: 'relative',
                                    }}
                                >
                                    <Box
                                        sx={{
                                            position: 'absolute',
                                            inset: '8px',
                                            borderRadius: '50%',
                                            background: '#fff',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: 15,
                                            fontWeight: 700,
                                            color: BRAND.ink,
                                        }}
                                        dir="ltr"
                                    >
                                        {checklist.percent}%
                                    </Box>
                                </Box>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                                        <Typography sx={{ fontSize: 17, fontWeight: 700, color: BRAND.ink }}>
                                            {submission.template?.name ?? 'Checklist'}
                                        </Typography>
                                        <StatusPillInline status={submission.status} />
                                    </Box>
                                    <Mono sx={{ fontSize: 11.5, color: BRAND.muted, mt: '4px', display: 'block' }} dir="ltr">
                                        {[
                                            submission.reference,
                                            [submission.project?.code, submission.project?.name].filter(Boolean).join(' '),
                                            `${checklist.passed} of ${checklist.total} items passed`,
                                        ].filter(Boolean).join(' · ')}
                                    </Mono>
                                </Box>
                            </Box>

                            {/* Scrollable checklist body */}
                            <Box sx={{ flex: 1, overflowY: 'auto', p: '18px 22px' }}>
                                <DynamicInspectionForm
                                    template={submission.template}
                                    value={formData}
                                    onChange={canEditForm ? setFormData : undefined}
                                    disabled={!canEditForm}
                                />
                            </Box>

                            {/* Sticky sign-off footer */}
                            <Box
                                sx={{
                                    p: '14px 22px',
                                    borderTop: '1px solid rgba(20,38,66,0.07)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '14px',
                                    flexWrap: 'wrap',
                                }}
                                id="approval-actions"
                            >
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    {(submission.signatures ?? []).length > 0 ? (
                                        (() => {
                                            const last = submission.signatures[submission.signatures.length - 1];
                                            return (
                                                <>
                                                    <Box
                                                        sx={{
                                                            fontFamily: "'Segoe Script', 'Segoe UI', cursive",
                                                            fontSize: 20,
                                                            lineHeight: 1,
                                                            color: BRAND.navy,
                                                        }}
                                                    >
                                                        {last.signer?.name ?? 'Signed'}
                                                    </Box>
                                                    <Mono sx={{ fontSize: 10, color: '#A6B0BF', mt: '3px', display: 'block' }} dir="ltr">
                                                        {[last.context, last.signed_at ? new Date(last.signed_at).toLocaleString() : null]
                                                            .filter(Boolean)
                                                            .join(' · ')}
                                                    </Mono>
                                                </>
                                            );
                                        })()
                                    ) : (
                                        <Typography sx={{ fontSize: 12, color: BRAND.muted }}>
                                            {pendingApproval
                                                ? `Awaiting sign-off · #${pendingApproval.step_order} ${pendingApproval.step_name ?? pendingApproval.role_name}`
                                                : 'No pending step'}
                                        </Typography>
                                    )}
                                </Box>
                                <Button
                                    variant="outlined"
                                    color="warning"
                                    disabled={!canReview || !pendingApproval || busy}
                                    onClick={() => void decide('reject')}
                                    sx={{
                                        borderRadius: '10px',
                                        px: '16px',
                                        py: '10px',
                                        fontSize: 12.5,
                                        fontWeight: 600,
                                        borderColor: 'rgba(192,138,35,0.4)',
                                        color: '#9C6E14',
                                        '&:hover': { borderColor: '#9C6E14', background: 'rgba(192,138,35,0.06)' },
                                    }}
                                >
                                    Request rework
                                </Button>
                                <Button
                                    variant="contained"
                                    color="success"
                                    disabled={!canReview || !pendingApproval || busy}
                                    onClick={() => void decide('approve')}
                                    sx={{
                                        borderRadius: '10px',
                                        px: '18px',
                                        py: '10px',
                                        fontSize: 12.5,
                                        fontWeight: 600,
                                        boxShadow: '0 10px 20px -10px rgba(110,140,58,0.7)',
                                    }}
                                >
                                    Approve ITR
                                </Button>
                            </Box>
                        </Box>

                        {/* Right rail — approvals, decision notes, signature, chat, requests */}
                        <Box
                            sx={{
                                flex: 1,
                                minWidth: 0,
                                overflowY: 'auto',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '14px',
                                pr: '2px',
                            }}
                        >
                            <Paper sx={{ p: '16px 18px', borderRadius: '16px' }} id="approval-timeline">
                                <SectionLabel sx={{ mb: 1.5 }}>Approvals timeline</SectionLabel>
                                <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
                                    <CountTile label="Steps" value={metrics.steps} dot={BRAND.navy} />
                                    <CountTile label="Approved" value={metrics.approved} dot={BRAND.green} />
                                    <CountTile label="Signatures" value={metrics.signatures} dot={BRAND.teal} />
                                    <CountTile label="Requests" value={metrics.requests} dot={BRAND.muted} />
                                </Stack>
                                <List dense disablePadding>
                                    {(submission.approvals ?? []).map((approval) => {
                                        const tone = approval.status === 'approved'
                                            ? 'closed'
                                            : approval.status === 'rejected'
                                                ? 'rejected'
                                                : 'review';
                                        return (
                                            <ListItem key={approval.id} sx={{ px: 0, gap: 1 }}>
                                                <ListItemText
                                                    primaryTypographyProps={{ sx: { fontSize: 13, fontWeight: 600, color: BRAND.ink } }}
                                                    secondaryTypographyProps={{ sx: { fontSize: 11.5, color: BRAND.muted } }}
                                                    primary={`#${approval.step_order} ${approval.step_name ?? approval.role_name}`}
                                                    secondary={`${approval.role_name} · ${approval.status}${approval.acted_at ? ` · ${new Date(approval.acted_at).toLocaleString()}` : ''}`}
                                                />
                                                <StatusPillInline status={tone === 'closed' ? 'approved' : tone === 'rejected' ? 'rejected' : 'submitted'} />
                                            </ListItem>
                                        );
                                    })}
                                    {(submission.approvals ?? []).length === 0 && (
                                        <ListItem sx={{ px: 0 }}>
                                            <ListItemText
                                                primaryTypographyProps={{ sx: { fontSize: 12.5, color: BRAND.muted } }}
                                                primary="No approval steps."
                                            />
                                        </ListItem>
                                    )}
                                </List>
                            </Paper>

                            <Paper sx={{ p: '16px 18px', borderRadius: '16px' }}>
                                <SectionLabel sx={{ mb: 1.25 }}>Contributors</SectionLabel>
                                {contributorGroups.length === 0 ? (
                                    <Box sx={{ fontSize: 12.5, color: BRAND.muted }}>No attributed observations yet.</Box>
                                ) : (
                                    <Stack spacing={1}>
                                        {contributorGroups.map((group) => (
                                            <Box key={group.key}>
                                                <Box sx={{ fontSize: 13, fontWeight: 600, color: BRAND.ink }}>
                                                    {group.userName}
                                                    {group.company && (
                                                        <Box component="span" sx={{ color: BRAND.muted, fontWeight: 400 }}> · {group.company}</Box>
                                                    )}
                                                </Box>
                                                {group.fields.length > 0 && (
                                                    <Box sx={{ fontSize: 11.5, color: BRAND.muted, fontFamily: FONT_MONO }}>
                                                        {group.fields.join(', ')}
                                                    </Box>
                                                )}
                                            </Box>
                                        ))}
                                    </Stack>
                                )}
                            </Paper>

                            <Paper sx={{ p: '16px 18px', borderRadius: '16px' }}>
                                <SectionLabel sx={{ mb: 1.25 }}>Decision notes</SectionLabel>
                                <Typography sx={{ fontSize: 12, color: BRAND.muted, mb: 1.25 }}>
                                    Current step:{' '}
                                    {pendingApproval
                                        ? `#${pendingApproval.step_order} ${pendingApproval.step_name ?? pendingApproval.role_name}`
                                        : 'No pending step'}
                                </Typography>
                                <TextField
                                    size="small"
                                    fullWidth
                                    label="Notes for approve / request rework"
                                    value={decisionNotes}
                                    onChange={(event) => setDecisionNotes(event.target.value)}
                                    multiline
                                    minRows={2}
                                    disabled={!canReview || !pendingApproval || busy}
                                />
                            </Paper>

                            <Paper sx={{ p: '16px 18px', borderRadius: '16px' }} id="signature-panel">
                                <SectionLabel sx={{ mb: 1.25 }}>Signature</SectionLabel>
                                <Typography sx={{ fontSize: 12, color: BRAND.muted, mb: 1.25 }}>
                                    {pendingApproval?.requires_signature
                                        ? 'Current step requires digital signature.'
                                        : 'No signature required for current step.'}
                                </Typography>
                                <SignaturePad
                                    onSignatureChange={setSignatureData}
                                    disabled={!canSign || !pendingApproval?.requires_signature || busy}
                                />
                                <Button
                                    variant="contained"
                                    disabled={!canSign || !pendingApproval?.requires_signature || !signatureData || busy}
                                    onClick={() => void uploadSignature()}
                                    sx={{ borderRadius: '10px', mt: 1.5, fontSize: 12.5, fontWeight: 600 }}
                                >
                                    Upload signature
                                </Button>
                                <Divider sx={{ my: 1.5 }} />
                                <SectionLabel sx={{ mb: 1 }}>Captured signatures</SectionLabel>
                                <List dense disablePadding>
                                    {(submission.signatures ?? []).length === 0 ? (
                                        <ListItem sx={{ px: 0 }}>
                                            <ListItemText
                                                primaryTypographyProps={{ sx: { fontSize: 12.5, color: BRAND.muted } }}
                                                primary="No signatures captured yet."
                                            />
                                        </ListItem>
                                    ) : (
                                        submission.signatures.map((signature) => (
                                            <ListItem key={signature.id} sx={{ px: 0, gap: 1 }}>
                                                <ListItemText
                                                    primaryTypographyProps={{ sx: { fontSize: 13, fontWeight: 600, color: BRAND.ink } }}
                                                    secondaryTypographyProps={{ sx: { fontSize: 11.5, color: BRAND.muted } }}
                                                    primary={`${signature.signer?.name ?? 'User'} · ${signature.signed_at ? new Date(signature.signed_at).toLocaleString() : ''}`}
                                                    secondary={signature.context}
                                                />
                                                <Button
                                                    size="small"
                                                    onClick={() => window.open(`/api/inspections/signatures/${signature.id}/download`, '_blank')}
                                                    sx={{ fontSize: 12, fontWeight: 600 }}
                                                >
                                                    Download
                                                </Button>
                                            </ListItem>
                                        ))
                                    )}
                                </List>
                            </Paper>

                            <Paper sx={{ p: '16px 18px', borderRadius: '16px' }}>
                                <SectionLabel sx={{ mb: 1.25 }}>Approval chat log</SectionLabel>
                                <TextField
                                    size="small"
                                    fullWidth
                                    label="Message"
                                    value={approvalMessageBody}
                                    onChange={(event) => setApprovalMessageBody(event.target.value)}
                                    multiline
                                    minRows={2}
                                    disabled={busy}
                                />
                                <Button
                                    variant="outlined"
                                    disabled={!approvalMessageBody.trim() || busy}
                                    onClick={() => void postApprovalMessage()}
                                    sx={{ borderRadius: '10px', mt: 1.25, fontSize: 12.5, fontWeight: 600 }}
                                >
                                    Post message
                                </Button>
                                <List dense disablePadding sx={{ mt: 1 }}>
                                    {approvalMessages.length === 0 ? (
                                        <ListItem sx={{ px: 0 }}>
                                            <ListItemText
                                                primaryTypographyProps={{ sx: { fontSize: 12.5, color: BRAND.muted } }}
                                                primary="No chat messages yet."
                                            />
                                        </ListItem>
                                    ) : (
                                        approvalMessages.map((message) => (
                                            <ListItem key={message.id} sx={{ px: 0, alignItems: 'flex-start' }}>
                                                <ListItemText
                                                    primaryTypographyProps={{ sx: { fontSize: 13, fontWeight: 600, color: BRAND.ink } }}
                                                    secondaryTypographyProps={{ sx: { fontSize: 11.5, color: BRAND.muted } }}
                                                    primary={`${message.user?.name ?? 'System'} · ${message.message_type}`}
                                                    secondary={`${message.body}${message.approval?.step_order ? ` · Step ${message.approval.step_order}` : ''} · ${new Date(message.created_at).toLocaleString()}`}
                                                />
                                            </ListItem>
                                        ))
                                    )}
                                </List>
                            </Paper>

                            <Paper sx={{ p: '16px 18px', borderRadius: '16px' }}>
                                <SectionLabel sx={{ mb: 1.25 }}>Linked MIR / WIR / IR requests</SectionLabel>
                                <List dense disablePadding>
                                    {(submission.requests ?? []).length === 0 ? (
                                        <ListItem sx={{ px: 0 }}>
                                            <ListItemText
                                                primaryTypographyProps={{ sx: { fontSize: 12.5, color: BRAND.muted } }}
                                                primary="No linked requests."
                                            />
                                        </ListItem>
                                    ) : (
                                        submission.requests.map((request) => (
                                            <ListItem key={request.id} sx={{ px: 0 }}>
                                                <ListItemText
                                                    primaryTypographyProps={{ sx: { fontSize: 13, fontWeight: 600, color: BRAND.ink } }}
                                                    secondaryTypographyProps={{ sx: { fontSize: 11.5, color: BRAND.muted } }}
                                                    primary={`${request.reference} · ${request.request_type.toUpperCase()} · ${request.status}`}
                                                    secondary={request.title}
                                                />
                                            </ListItem>
                                        ))
                                    )}
                                </List>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => navigate('/inspections/requests')}
                                    sx={{ borderRadius: '10px', mt: 1, fontSize: 12.5, fontWeight: 600 }}
                                >
                                    Manage requests
                                </Button>
                            </Paper>
                        </Box>
                    </Box>
                </>
            )}
        </Box>
    );
};
