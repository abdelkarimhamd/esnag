import { Alert, Box, Button, Chip, Divider, FormControl, InputLabel, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { parseApiError } from '../utils/apiError';
import { BRAND } from '../theme';
import { Mono, SectionLabel } from '../components/ui/Mono';

const roleOptions = ['owner', 'consultant', 'contractor', 'org_admin', 'project_manager', 'engineer', 'inspector', 'viewer'];
const todayDateInput = () => new Date().toISOString().slice(0, 10);

// Card surface recipe from the spec: flat white with a hairline border and the
// very subtle resting shadow shared by every panel in the redesign.
const CARD_SX = {
    bgcolor: BRAND.panel,
    border: `1px solid ${BRAND.border}`,
    borderRadius: '16px',
    boxShadow: '0 1px 2px rgba(20,38,66,0.04)',
};

// Deterministic avatar tint so each member keeps a stable colour across renders.
const AVATAR_TINTS = ['#24488F', '#2F8FBE', '#6E8C3A', '#C08A23', '#6B7A93', '#1A3466'];
const avatarTint = (member) => {
    const seed = String(member?.email ?? member?.name ?? member?.id ?? '');
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
        hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
    }
    return AVATAR_TINTS[hash % AVATAR_TINTS.length];
};

const initialsOf = (name) => String(name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '—';

// Map a role key/label onto one of the redesign's pill styles (00-tokens families).
const ROLE_PILL = {
    owner: { bg: 'rgba(36,72,143,0.10)', color: '#24488F' },
    org_admin: { bg: 'rgba(36,72,143,0.10)', color: '#24488F' },
    project_manager: { bg: 'rgba(36,72,143,0.10)', color: '#24488F' },
    inspector: { bg: 'rgba(47,143,190,0.12)', color: '#2276A0' },
    contractor: { bg: 'rgba(110,140,58,0.15)', color: '#56702C' },
    consultant: { bg: 'rgba(192,138,35,0.14)', color: '#9C6E14' },
    engineer: { bg: '#EEF1F6', color: '#51627F' },
    viewer: { bg: 'transparent', color: '#51627F', outline: true },
};
const rolePillStyle = (role) => ROLE_PILL[role] ?? { bg: '#EEF1F6', color: '#51627F' };
const humaniseRole = (role) => String(role ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

// Preset colour dot per key (Owner navy / Consultant amber / Contractor green).
const PRESET_DOT = {
    owner: '#24488F',
    org_admin: '#24488F',
    project_manager: '#24488F',
    consultant: '#C08A23',
    contractor: '#6E8C3A',
    engineer: '#6B7A93',
    inspector: '#2F8FBE',
    viewer: '#8A97AC',
};

const RolePill = ({ role }) => {
    const style = rolePillStyle(role);
    return (
        <Box
            component="span"
            sx={{
                display: 'inline-block',
                px: '10px',
                py: '4px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                lineHeight: 1.3,
                color: style.color,
                background: style.outline ? 'transparent' : style.bg,
                border: style.outline ? '1px solid rgba(20,38,66,0.18)' : '1px solid transparent',
                whiteSpace: 'nowrap',
            }}
        >
            {humaniseRole(role)}
        </Box>
    );
};

const StatusText = ({ active }) => (
    <Box
        component="span"
        sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: 12,
            fontWeight: 600,
            color: active ? '#56702C' : '#9C6E14',
        }}
    >
        <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', background: active ? '#6E8C3A' : '#C08A23', flex: 'none' }} />
        {active ? 'Active' : 'Invited'}
    </Box>
);

// Grid template shared by the members table header + rows.
const MEMBER_GRID = '2.4fr 1.3fr 0.8fr 0.9fr';

export const AccessControlPage = () => {
    const { activeOrganization, permissions } = useAuth();
    const [projects, setProjects] = useState([]);
    const [projectId, setProjectId] = useState(null);
    const [members, setMembers] = useState([]);
    const [membersForDelegation, setMembersForDelegation] = useState([]);
    const [roleDrafts, setRoleDrafts] = useState({});
    const [savingUserId, setSavingUserId] = useState(null);
    const [presets, setPresets] = useState([]);
    const [presetKey, setPresetKey] = useState('');
    const [roleMatrix, setRoleMatrix] = useState(null);
    const [diffUserId, setDiffUserId] = useState(null);
    const [diff, setDiff] = useState(null);
    const [companies, setCompanies] = useState([]);
    const [teams, setTeams] = useState([]);
    const [newCompanyName, setNewCompanyName] = useState('');
    const [newCompanyType, setNewCompanyType] = useState('contractor');
    const [newTeamName, setNewTeamName] = useState('');
    const [newTeamCompanyId, setNewTeamCompanyId] = useState('');
    const [delegations, setDelegations] = useState([]);
    const [delegatorId, setDelegatorId] = useState('');
    const [delegateId, setDelegateId] = useState('');
    const [delegationScope, setDelegationScope] = useState('assignments');
    const [delegationStart, setDelegationStart] = useState(todayDateInput());
    const [delegationEnd, setDelegationEnd] = useState(todayDateInput());
    const [delegationReason, setDelegationReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const canManage = permissions.includes('projects.manage') || permissions.includes('snags.assign');
    const metrics = useMemo(() => ({
        projects: projects.length,
        members: members.length,
        companies: companies.length,
        teams: teams.length,
        delegations: delegations.length,
    }), [companies.length, delegations.length, members.length, projects.length, teams.length]);
    const loadProjects = useCallback(async () => {
        const response = await api.get('/api/projects', {
            params: {
                per_page: 200,
            },
        });
        const list = response.data.data;
        setProjects(list);
        if (!projectId && list.length > 0) {
            setProjectId(list[0].id);
        }
    }, [projectId]);
    const loadProjectRoles = async (selectedProjectId) => {
        const response = await api.get(`/api/projects/${selectedProjectId}/roles`);
        const projectMembers = response.data.data.members;
        setMembers(projectMembers);
        setRoleDrafts(projectMembers.reduce((acc, member) => {
            acc[member.id] = member.project_roles;
            return acc;
        }, {}));
    };
    const loadOrganizationMembers = async (selectedProjectId) => {
        const response = await api.get('/api/organizations/members', {
            params: {
                project_id: selectedProjectId,
            },
        });
        setMembersForDelegation(response.data.data);
    };
    const loadPresets = useCallback(async () => {
        const response = await api.get('/api/rbac/permission-presets');
        const data = response.data.data;
        setPresets(data);
        if (!presetKey && data.length > 0) {
            setPresetKey(data[0].preset_key);
        }
    }, [presetKey]);
    const loadStakeholders = async (selectedProjectId) => {
        const [companiesResponse, teamsResponse] = await Promise.all([
            api.get('/api/stakeholders/companies', {
                params: { project_id: selectedProjectId },
            }),
            api.get('/api/stakeholders/teams', {
                params: { project_id: selectedProjectId },
            }),
        ]);
        setCompanies(companiesResponse.data.data);
        setTeams(teamsResponse.data.data);
    };
    const loadDelegations = async (selectedProjectId) => {
        const response = await api.get('/api/delegations', {
            params: {
                project_id: selectedProjectId,
                active_only: false,
            },
        });
        setDelegations(response.data.data);
    };
    const activeOrganizationId = activeOrganization?.id ?? null;
    useEffect(() => {
        if (!activeOrganizationId) {
            return;
        }
        const run = async () => {
            setBusy(true);
            setError(null);
            try {
                await Promise.all([loadProjects(), loadPresets()]);
            }
            catch (requestError) {
                setError(parseApiError(requestError, 'Unable to load access control data.'));
            }
            finally {
                setBusy(false);
            }
        };
        void run();
    }, [activeOrganizationId, loadPresets, loadProjects]);
    useEffect(() => {
        let active = true;
        api.get('/api/rbac/role-matrix')
            .then((response) => { if (active) setRoleMatrix(response.data.data); })
            .catch(() => { if (active) setRoleMatrix(null); });
        return () => { active = false; };
    }, [activeOrganizationId]);
    useEffect(() => {
        if (!projectId) {
            return;
        }
        const run = async () => {
            setBusy(true);
            setError(null);
            try {
                await Promise.all([
                    loadProjectRoles(projectId),
                    loadOrganizationMembers(projectId),
                    loadStakeholders(projectId),
                    loadDelegations(projectId),
                ]);
            }
            catch (requestError) {
                setError(parseApiError(requestError, 'Unable to load project access details.'));
            }
            finally {
                setBusy(false);
            }
        };
        void run();
    }, [projectId]);
    const currentProject = useMemo(() => projects.find((entry) => entry.id === projectId) ?? null, [projects, projectId]);
    const saveRoleOverride = async (member) => {
        if (!projectId) {
            return;
        }
        setSavingUserId(member.id);
        setError(null);
        try {
            await api.put(`/api/projects/${projectId}/roles/${member.id}`, {
                roles: roleDrafts[member.id] ?? [],
            });
            await loadProjectRoles(projectId);
        }
        catch (requestError) {
            setError(parseApiError(requestError, `Unable to save role override for ${member.name}.`));
        }
        finally {
            setSavingUserId(null);
        }
    };
    const comparePreset = async () => {
        if (!projectId || !presetKey) {
            return;
        }
        setError(null);
        try {
            const response = await api.get('/api/rbac/permission-diff', {
                params: {
                    preset_key: presetKey,
                    project_id: projectId,
                    user_id: diffUserId || undefined,
                },
            });
            setDiff(response.data.data);
        }
        catch (requestError) {
            setError(parseApiError(requestError, 'Unable to compare permissions with the selected preset.'));
        }
    };
    const createCompany = async () => {
        if (!newCompanyName.trim()) {
            return;
        }
        setError(null);
        try {
            await api.post('/api/stakeholders/companies', {
                name: newCompanyName,
                type: newCompanyType,
            });
            setNewCompanyName('');
            if (projectId) {
                await loadStakeholders(projectId);
            }
        }
        catch (requestError) {
            setError(parseApiError(requestError, 'Unable to create company.'));
        }
    };
    const createTeam = async () => {
        if (!projectId || !newTeamName.trim()) {
            return;
        }
        setError(null);
        try {
            await api.post('/api/stakeholders/teams', {
                name: newTeamName,
                project_id: projectId,
                company_id: newTeamCompanyId ? Number(newTeamCompanyId) : undefined,
            });
            setNewTeamName('');
            setNewTeamCompanyId('');
            await loadStakeholders(projectId);
        }
        catch (requestError) {
            setError(parseApiError(requestError, 'Unable to create team.'));
        }
    };
    const createDelegation = async () => {
        if (!projectId || !delegatorId || !delegateId) {
            return;
        }
        setError(null);
        try {
            await api.post('/api/delegations', {
                project_id: projectId,
                delegator_user_id: Number(delegatorId),
                delegate_user_id: Number(delegateId),
                scope: delegationScope,
                starts_at: `${delegationStart} 00:00:00`,
                ends_at: `${delegationEnd} 23:59:59`,
                reason: delegationReason || undefined,
            });
            setDelegatorId('');
            setDelegateId('');
            setDelegationReason('');
            await loadDelegations(projectId);
        }
        catch (requestError) {
            setError(parseApiError(requestError, 'Unable to create delegation rule.'));
        }
    };
    const deleteDelegation = async (delegationId) => {
        if (!projectId) {
            return;
        }
        setError(null);
        try {
            await api.delete(`/api/delegations/${delegationId}`);
            await loadDelegations(projectId);
        }
        catch (requestError) {
            setError(parseApiError(requestError, 'Unable to delete delegation rule.'));
        }
    };

    // Members list rows: derive the redesign columns (avatar tint, primary role,
    // projects count, status) from the existing member payload without new APIs.
    const memberRows = useMemo(() => members.map((member) => {
        const effective = Array.isArray(member.effective_roles) ? member.effective_roles : [];
        const projectRoles = Array.isArray(member.project_roles) ? member.project_roles : [];
        const orgRoles = Array.isArray(member.org_roles) ? member.org_roles : [];
        const primaryRole = effective[0] ?? projectRoles[0] ?? orgRoles[0] ?? 'viewer';
        const projectsCount = member.projects_count ?? (projectRoles.length || effective.length);
        const active = member.status ? member.status !== 'invited' : (member.is_active ?? true);
        return { member, primaryRole, projectsCount, active };
    }), [members]);

    const stakeholderCount = companies.length;

    return (
        <Stack spacing={0} sx={{ height: '100%' }}>
            {error && <Alert severity="error" sx={{ mb: 2.25 }}>{error}</Alert>}

            {/* Screen header row: title block + project selector + invite CTA */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 2.25 }}>
                <Box sx={{ minWidth: 0 }}>
                    <Typography component="h2" sx={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: BRAND.ink, lineHeight: 1.15 }}>
                        Team &amp; access
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: BRAND.muted, mt: '4px' }}>
                        {metrics.members} member{metrics.members === 1 ? '' : 's'}
                        {' · '}
                        {stakeholderCount} stakeholder {stakeholderCount === 1 ? 'company' : 'companies'}
                    </Typography>
                </Box>
                <Stack direction="row" spacing={1.25} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                    <FormControl size="small" sx={{ minWidth: 240 }}>
                        <InputLabel id="access-project">Project</InputLabel>
                        <Select
                            labelId="access-project"
                            label="Project"
                            value={projectId ?? ''}
                            onChange={(event) => setProjectId(Number(event.target.value))}
                        >
                            {projects.map((project) => (
                                <MenuItem key={project.id} value={project.id}>
                                    {project.code} - {project.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <Button
                        variant="contained"
                        startIcon={<AddRoundedIcon sx={{ fontSize: 16 }} />}
                        disabled={!canManage}
                        sx={{ px: '15px', py: '9px', borderRadius: '11px', fontSize: 13, fontWeight: 600 }}
                    >
                        Invite member
                    </Button>
                </Stack>
            </Box>

            {/* Members table — 4-column CSS grid inside a flat card */}
            <Paper elevation={0} sx={{ ...CARD_SX, overflow: 'hidden' }}>
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: MEMBER_GRID,
                        gap: '14px',
                        alignItems: 'center',
                        px: '20px',
                        py: '12px',
                        bgcolor: '#F7F9FC',
                    }}
                >
                    {['MEMBER', 'ROLE', 'PROJECTS', 'STATUS'].map((label) => (
                        <SectionLabel key={label} sx={{ fontSize: 10, letterSpacing: '0.1em', color: BRAND.muted }}>
                            {label}
                        </SectionLabel>
                    ))}
                </Box>

                {memberRows.length === 0 ? (
                    <Box sx={{ px: '20px', py: 5, textAlign: 'center', color: BRAND.muted, borderTop: `1px solid ${BRAND.borderHair}` }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>No members yet</Typography>
                        <Typography sx={{ fontSize: 12.5, mt: 0.5 }}>Invite your first teammate to this project.</Typography>
                    </Box>
                ) : (
                    memberRows.map(({ member, primaryRole, projectsCount, active }) => (
                        <Box
                            key={member.id}
                            sx={{
                                display: 'grid',
                                gridTemplateColumns: MEMBER_GRID,
                                gap: '14px',
                                alignItems: 'center',
                                px: '20px',
                                py: '12px',
                                borderTop: `1px solid ${BRAND.borderHair}`,
                                '&:hover': { background: 'rgba(36,72,143,0.03)' },
                            }}
                        >
                            {/* MEMBER */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: '11px', minWidth: 0 }}>
                                <Box
                                    sx={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: '50%',
                                        background: avatarTint(member),
                                        color: '#fff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flex: 'none',
                                    }}
                                >
                                    <Mono sx={{ fontSize: 10, fontWeight: 600 }}>{initialsOf(member.name)}</Mono>
                                </Box>
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: BRAND.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {member.name}
                                    </Typography>
                                    <Mono sx={{ fontSize: 10.5, color: BRAND.muted, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', unicodeBidi: 'isolate' }}>
                                        {member.email}
                                    </Mono>
                                </Box>
                            </Box>

                            {/* ROLE */}
                            <Box sx={{ minWidth: 0 }}>
                                <RolePill role={primaryRole} />
                            </Box>

                            {/* PROJECTS */}
                            <Mono sx={{ fontSize: 13, color: BRAND.inkSoft, unicodeBidi: 'isolate' }}>{projectsCount}</Mono>

                            {/* STATUS */}
                            <StatusText active={active} />
                        </Box>
                    ))
                )}
            </Paper>

            {/* Permission presets */}
            {presets.length > 0 && (
                <>
                    <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.ink, mt: '22px', mb: '12px' }}>
                        Permission presets
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: '14px' }}>
                        {presets.map((preset) => {
                            const dot = PRESET_DOT[preset.preset_key] ?? BRAND.navy;
                            const permissionNames = Array.isArray(preset.permissions)
                                ? preset.permissions.map((permission) => (typeof permission === 'string' ? permission : permission?.name)).filter(Boolean)
                                : [];
                            const granted = permissionNames.slice(0, 3);
                            const capabilities = granted.length > 0
                                ? granted.map((name) => ({ granted: true, text: humaniseRole(name.split('.').slice(-1)[0]) }))
                                : [{ granted: false, text: 'No permissions configured' }];
                            return (
                                <Paper
                                    key={preset.id}
                                    elevation={0}
                                    sx={{
                                        bgcolor: BRAND.panel,
                                        border: `1px solid ${BRAND.border}`,
                                        borderRadius: '14px',
                                        p: '16px 17px',
                                        boxShadow: '0 1px 2px rgba(20,38,66,0.04)',
                                        '&:hover': { borderColor: BRAND.borderStrong },
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Box sx={{ width: 9, height: 9, borderRadius: '50%', background: dot, flex: 'none' }} />
                                        <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.ink }}>{preset.name}</Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '7px', my: '13px' }}>
                                        {capabilities.map((capability, index) => (
                                            <Box key={`${preset.id}-cap-${index}`} sx={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 12, color: capability.granted ? BRAND.inkSoft : '#A6B0BF' }}>
                                                {capability.granted ? (
                                                    <CheckRoundedIcon sx={{ fontSize: 13, color: '#6E8C3A' }} />
                                                ) : (
                                                    <CloseRoundedIcon sx={{ fontSize: 13, color: '#C4CCD8' }} />
                                                )}
                                                {capability.text}
                                            </Box>
                                        ))}
                                    </Box>
                                    <Box
                                        component="button"
                                        type="button"
                                        disabled={!canManage}
                                        sx={{
                                            border: 'none',
                                            background: 'none',
                                            p: 0,
                                            cursor: canManage ? 'pointer' : 'not-allowed',
                                            fontFamily: 'inherit',
                                            fontSize: 12,
                                            fontWeight: 600,
                                            color: BRAND.navy,
                                            opacity: canManage ? 1 : 0.5,
                                            '&:hover': { color: canManage ? BRAND.navyDark : BRAND.navy },
                                        }}
                                    >
                                        Edit preset
                                    </Box>
                                </Paper>
                            );
                        })}
                    </Box>
                </>
            )}

            {/* Project role overrides — full editing surface (preserved behaviour) */}
            {currentProject && (
                <Paper elevation={0} sx={{ ...CARD_SX, p: '20px', mt: '22px' }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.ink }}>Project role overrides</Typography>
                    <Typography sx={{ fontSize: 12.5, color: BRAND.muted, mt: '4px', mb: 2 }}>
                        Assign project-specific roles that override organization-level roles for this project only.
                    </Typography>

                    <Stack spacing={1.5}>
                        {members.map((member) => (
                            <Box
                                key={member.id}
                                sx={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    alignItems: 'center',
                                    gap: 1.5,
                                    p: '12px 14px',
                                    borderRadius: '12px',
                                    border: `1px solid ${BRAND.borderHair}`,
                                    bgcolor: '#FBFCFE',
                                }}
                            >
                                <Box sx={{ minWidth: 180, flex: '1 1 180px' }}>
                                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: BRAND.ink }}>{member.name}</Typography>
                                    <Mono sx={{ fontSize: 10.5, color: BRAND.muted, display: 'block', unicodeBidi: 'isolate' }}>{member.email}</Mono>
                                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                                        {member.org_roles.map((role) => (
                                            <Chip key={`${member.id}-org-${role}`} label={humaniseRole(role)} size="small" variant="outlined" sx={{ fontSize: 10.5 }} />
                                        ))}
                                    </Stack>
                                </Box>
                                <FormControl size="small" sx={{ minWidth: 220, flex: '1 1 220px' }}>
                                    <InputLabel id={`roles-${member.id}`}>Project roles</InputLabel>
                                    <Select
                                        labelId={`roles-${member.id}`}
                                        label="Project roles"
                                        multiple
                                        value={roleDrafts[member.id] ?? []}
                                        onChange={(event) => {
                                            const value = event.target.value;
                                            setRoleDrafts((current) => ({
                                                ...current,
                                                [member.id]: typeof value === 'string' ? value.split(',') : value,
                                            }));
                                        }}
                                    >
                                        {roleOptions.map((role) => (
                                            <MenuItem key={`${member.id}-role-${role}`} value={role}>
                                                {humaniseRole(role)}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 160, flex: '1 1 160px' }}>
                                    <SectionLabel sx={{ fontSize: 9.5, letterSpacing: '0.1em' }}>Effective</SectionLabel>
                                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                                        {member.effective_roles.map((role) => (
                                            <RolePill key={`${member.id}-effective-${role}`} role={role} />
                                        ))}
                                    </Stack>
                                </Box>
                                <Button
                                    size="small"
                                    variant="contained"
                                    disabled={!canManage || savingUserId === member.id}
                                    onClick={() => void saveRoleOverride(member)}
                                    sx={{ alignSelf: 'center' }}
                                >
                                    {savingUserId === member.id ? 'Saving...' : 'Save'}
                                </Button>
                            </Box>
                        ))}
                    </Stack>
                </Paper>
            )}

            {/* Stakeholders + delegation + preset diff (sibling-frame panels, preserved) */}
            <Box sx={{ display: 'flex', gap: 2.25, mt: '22px', flexDirection: { xs: 'column', lg: 'row' } }}>
                <Paper elevation={0} sx={{ ...CARD_SX, p: '20px', flex: '1 1 0', minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.ink, mb: 1.75 }}>Stakeholders</Typography>

                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} mb={1.5}>
                        <TextField size="small" label="New Company" value={newCompanyName} onChange={(event) => setNewCompanyName(event.target.value)} />
                        <FormControl size="small" sx={{ minWidth: 160 }}>
                            <InputLabel id="company-type">Type</InputLabel>
                            <Select labelId="company-type" label="Type" value={newCompanyType} onChange={(event) => setNewCompanyType(String(event.target.value))}>
                                <MenuItem value="owner">owner</MenuItem>
                                <MenuItem value="consultant">consultant</MenuItem>
                                <MenuItem value="contractor">contractor</MenuItem>
                                <MenuItem value="subcontractor">subcontractor</MenuItem>
                            </Select>
                        </FormControl>
                        <Button variant="outlined" onClick={() => void createCompany()} disabled={!canManage}>
                            Add Company
                        </Button>
                    </Stack>

                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} mb={2}>
                        <TextField size="small" label="New Team" value={newTeamName} onChange={(event) => setNewTeamName(event.target.value)} />
                        <FormControl size="small" sx={{ minWidth: 200 }}>
                            <InputLabel id="team-company">Company</InputLabel>
                            <Select labelId="team-company" label="Company" value={newTeamCompanyId} onChange={(event) => setNewTeamCompanyId(String(event.target.value))}>
                                <MenuItem value="">No company</MenuItem>
                                {companies.map((company) => (
                                    <MenuItem key={company.id} value={company.id}>
                                        {company.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <Button variant="outlined" onClick={() => void createTeam()} disabled={!canManage || !projectId}>
                            Add Team
                        </Button>
                    </Stack>

                    <Stack spacing={0.75}>
                        {companies.map((company) => (
                            <Box key={company.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1, borderTop: `1px solid ${BRAND.borderHair}` }}>
                                <Typography sx={{ fontSize: 13, fontWeight: 600, color: BRAND.ink, flex: 1, minWidth: 0 }}>{company.name}</Typography>
                                <Mono sx={{ fontSize: 11, color: BRAND.muted }}>{company.type}</Mono>
                                <Mono sx={{ fontSize: 12, color: BRAND.inkSoft, width: 90, textAlign: 'end', unicodeBidi: 'isolate' }}>
                                    {company.active_members_count ?? 0} · {company.active_teams_count ?? 0}
                                </Mono>
                            </Box>
                        ))}
                    </Stack>

                    <Divider sx={{ my: 2 }} />

                    <Stack spacing={0.75}>
                        {teams.map((team) => (
                            <Box key={team.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1, borderTop: `1px solid ${BRAND.borderHair}` }}>
                                <Typography sx={{ fontSize: 13, fontWeight: 600, color: BRAND.ink, flex: 1, minWidth: 0 }}>{team.name}</Typography>
                                <Mono sx={{ fontSize: 11, color: BRAND.muted }}>{team.company?.name ?? 'Unlinked'}</Mono>
                                <Mono sx={{ fontSize: 12, color: BRAND.inkSoft, width: 40, textAlign: 'end', unicodeBidi: 'isolate' }}>
                                    {team.active_members_count ?? 0}
                                </Mono>
                            </Box>
                        ))}
                    </Stack>
                </Paper>

                <Box sx={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2.25 }}>
                    <Paper elevation={0} sx={{ ...CARD_SX, p: '20px' }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.ink, mb: 1.75 }}>Permission preset diff</Typography>

                        <Stack spacing={1.5}>
                            <FormControl size="small" fullWidth>
                                <InputLabel id="preset-key">Preset</InputLabel>
                                <Select labelId="preset-key" label="Preset" value={presetKey} onChange={(event) => setPresetKey(String(event.target.value))}>
                                    {presets.map((preset) => (
                                        <MenuItem key={preset.id} value={preset.preset_key}>
                                            {preset.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <FormControl size="small" fullWidth>
                                <InputLabel id="diff-user">Target User</InputLabel>
                                <Select labelId="diff-user" label="Target User" value={diffUserId ? String(diffUserId) : ''} onChange={(event) => setDiffUserId(event.target.value ? Number(event.target.value) : null)}>
                                    <MenuItem value="">Current user</MenuItem>
                                    {members.map((member) => (
                                        <MenuItem key={member.id} value={member.id}>
                                            {member.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <Button variant="contained" onClick={() => void comparePreset()} disabled={!projectId || !presetKey}>
                                Compare
                            </Button>

                            {diff && (
                                <Stack spacing={1}>
                                    <Alert severity="info">
                                        {diff.target.label}: {diff.stats.matching_count} matching / {diff.stats.missing_count} missing / {diff.stats.extra_count} extra
                                    </Alert>

                                    <Box>
                                        <SectionLabel sx={{ fontSize: 9.5, letterSpacing: '0.12em', mb: 0.75 }}>Missing</SectionLabel>
                                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                                            {diff.missing_permissions.map((permissionName) => (
                                                <Chip key={`missing-${permissionName}`} label={permissionName} size="small" color="warning" variant="outlined" />
                                            ))}
                                        </Stack>
                                    </Box>

                                    <Box>
                                        <SectionLabel sx={{ fontSize: 9.5, letterSpacing: '0.12em', mb: 0.75 }}>Extra</SectionLabel>
                                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                                            {diff.extra_permissions.map((permissionName) => (
                                                <Chip key={`extra-${permissionName}`} label={permissionName} size="small" color="info" variant="outlined" />
                                            ))}
                                        </Stack>
                                    </Box>
                                </Stack>
                            )}
                        </Stack>
                    </Paper>

                    <Paper elevation={0} sx={{ ...CARD_SX, p: '20px' }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 700, color: BRAND.ink, mb: 1.75 }}>Delegations</Typography>

                        <Stack spacing={1.2} mb={2}>
                            <FormControl size="small" fullWidth>
                                <InputLabel id="delegator">Delegator</InputLabel>
                                <Select labelId="delegator" label="Delegator" value={delegatorId} onChange={(event) => setDelegatorId(String(event.target.value))}>
                                    {membersForDelegation.map((member) => (
                                        <MenuItem key={`delegator-${member.id}`} value={member.id}>
                                            {member.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <FormControl size="small" fullWidth>
                                <InputLabel id="delegate">Delegate</InputLabel>
                                <Select labelId="delegate" label="Delegate" value={delegateId} onChange={(event) => setDelegateId(String(event.target.value))}>
                                    {membersForDelegation.map((member) => (
                                        <MenuItem key={`delegate-${member.id}`} value={member.id}>
                                            {member.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <FormControl size="small" fullWidth>
                                <InputLabel id="delegation-scope">Scope</InputLabel>
                                <Select labelId="delegation-scope" label="Scope" value={delegationScope} onChange={(event) => setDelegationScope(event.target.value)}>
                                    <MenuItem value="assignments">assignments</MenuItem>
                                    <MenuItem value="approvals">approvals</MenuItem>
                                    <MenuItem value="all">all</MenuItem>
                                </Select>
                            </FormControl>

                            <Stack direction="row" spacing={1}>
                                <TextField size="small" type="date" label="Start" value={delegationStart} onChange={(event) => setDelegationStart(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
                                <TextField size="small" type="date" label="End" value={delegationEnd} onChange={(event) => setDelegationEnd(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
                            </Stack>

                            <TextField size="small" label="Reason" value={delegationReason} onChange={(event) => setDelegationReason(event.target.value)} />

                            <Button variant="outlined" onClick={() => void createDelegation()} disabled={!canManage || !projectId}>
                                Add Delegation
                            </Button>
                        </Stack>

                        <Stack spacing={0.75}>
                            {delegations.map((delegation) => (
                                <Box key={delegation.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1, borderTop: `1px solid ${BRAND.borderHair}` }}>
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography sx={{ fontSize: 13, fontWeight: 600, color: BRAND.ink }}>
                                            {delegation.delegator?.name} → {delegation.delegate?.name}
                                        </Typography>
                                        <Mono sx={{ fontSize: 11, color: BRAND.muted, display: 'block' }}>{delegation.scope}</Mono>
                                    </Box>
                                    <Button size="small" color="error" onClick={() => void deleteDelegation(delegation.id)} disabled={!canManage}>
                                        Delete
                                    </Button>
                                </Box>
                            ))}
                        </Stack>
                    </Paper>
                </Box>
            </Box>

            {roleMatrix && (
                <Paper variant="outlined" sx={{ mt: 2.5, borderColor: BRAND.border, borderRadius: 3, overflow: 'hidden' }}>
                    <Box sx={{ p: 2, pb: 1 }}>
                        <SectionLabel>Roles &amp; permissions matrix</SectionLabel>
                        <Typography sx={{ fontSize: 12, color: BRAND.muted, mt: 0.5 }}>
                            The permission set granted by each role. Roles are defined in the platform catalog — the single source of truth — so this grid is read-only.
                        </Typography>
                    </Box>
                    <TableContainer sx={{ maxHeight: 520 }}>
                        <Table stickyHeader size="small" sx={{ '& td, & th': { whiteSpace: 'nowrap', py: 0.5 } }}>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ position: 'sticky', left: 0, zIndex: 3, background: BRAND.panel, fontWeight: 700, fontSize: 11, color: BRAND.muted }}>
                                        Permission
                                    </TableCell>
                                    {roleMatrix.roles.map((role) => (
                                        <TableCell key={role.name} align="center" sx={{ background: BRAND.panel }}>
                                            <Mono sx={{ fontSize: 10, color: BRAND.muted }}>{role.name}</Mono>
                                        </TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {roleMatrix.permissions.map((permission) => (
                                    <TableRow key={permission} hover>
                                        <TableCell sx={{ position: 'sticky', left: 0, zIndex: 2, background: BRAND.panel }}>
                                            <Mono sx={{ fontSize: 11, color: BRAND.ink }}>{permission}</Mono>
                                        </TableCell>
                                        {roleMatrix.roles.map((role) => (
                                            <TableCell key={role.name} align="center">
                                                {role.permissions.includes(permission)
                                                    ? <Box component="span" sx={{ color: BRAND.green, fontWeight: 700 }}>✓</Box>
                                                    : <Box component="span" sx={{ color: BRAND.borderStrong }}>·</Box>}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            )}

            {busy && (
                <Typography sx={{ fontSize: 12.5, color: BRAND.muted, mt: 2 }}>
                    Syncing access configuration...
                </Typography>
            )}
        </Stack>
    );
};
