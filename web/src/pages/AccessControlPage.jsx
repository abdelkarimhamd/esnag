import { Alert, Box, Button, Chip, Divider, FormControl, Grid, InputLabel, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, } from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { PageHero } from '../components/ui/PageHero';
import { StatCard } from '../components/ui/StatCard';
import { useAuth } from '../hooks/useAuth';
import { parseApiError } from '../utils/apiError';
const roleOptions = ['owner', 'consultant', 'contractor', 'org_admin', 'project_manager', 'engineer', 'inspector', 'viewer'];
const todayDateInput = () => new Date().toISOString().slice(0, 10);
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
    return (<Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}

      <PageHero title="Access Control" description="Project role overrides, stakeholder structures, delegation windows, and permission diffing in one place." actions={<FormControl size="small" sx={{ minWidth: 280, bgcolor: 'rgba(255,255,255,0.14)', borderRadius: 1.5 }}>
            <InputLabel id="access-project" sx={{ color: 'rgba(255,255,255,0.92)' }}>
              Project
            </InputLabel>
            <Select labelId="access-project" label="Project" value={projectId ?? ''} onChange={(event) => setProjectId(Number(event.target.value))} sx={{
                color: '#FFFFFF',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.42)' },
                '& .MuiSvgIcon-root': { color: '#FFFFFF' },
            }}>
              {projects.map((project) => (<MenuItem key={project.id} value={project.id}>
                  {project.code} - {project.name}
                </MenuItem>))}
            </Select>
          </FormControl>}/>

      <Grid container spacing={1.2}>
        <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
          <StatCard label="Projects" value={metrics.projects} tone="primary"/>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
          <StatCard label="Members" value={metrics.members} tone="secondary"/>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
          <StatCard label="Companies" value={metrics.companies} tone="success"/>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
          <StatCard label="Teams" value={metrics.teams} tone="neutral"/>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 2.4 }}>
          <StatCard label="Delegations" value={metrics.delegations} tone="warning"/>
        </Grid>
      </Grid>

      {currentProject && (<Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Project Role Overrides
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Assign project-specific roles that override organization-level roles for this project only.
          </Typography>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Org Roles</TableCell>
                <TableCell>Project Roles</TableCell>
                <TableCell>Effective Roles</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {members.map((member) => (<TableRow key={member.id}>
                  <TableCell>
                    <Typography fontWeight={600}>{member.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {member.email}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {member.org_roles.map((role) => (<Chip key={`${member.id}-org-${role}`} label={role} size="small" variant="outlined"/>))}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <FormControl size="small" sx={{ minWidth: 220 }}>
                      <Select multiple value={roleDrafts[member.id] ?? []} onChange={(event) => {
                    const value = event.target.value;
                    setRoleDrafts((current) => ({
                        ...current,
                        [member.id]: typeof value === 'string' ? value.split(',') : value,
                    }));
                }}>
                        {roleOptions.map((role) => (<MenuItem key={`${member.id}-role-${role}`} value={role}>
                            {role}
                          </MenuItem>))}
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {member.effective_roles.map((role) => (<Chip key={`${member.id}-effective-${role}`} label={role} size="small" color="primary" variant="outlined"/>))}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" variant="contained" disabled={!canManage || savingUserId === member.id} onClick={() => void saveRoleOverride(member)}>
                      {savingUserId === member.id ? 'Saving...' : 'Save'}
                    </Button>
                  </TableCell>
                </TableRow>))}
            </TableBody>
          </Table>
        </Paper>)}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Stakeholders
            </Typography>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} mb={1.5}>
              <TextField size="small" label="New Company" value={newCompanyName} onChange={(event) => setNewCompanyName(event.target.value)}/>
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
              <TextField size="small" label="New Team" value={newTeamName} onChange={(event) => setNewTeamName(event.target.value)}/>
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel id="team-company">Company</InputLabel>
                <Select labelId="team-company" label="Company" value={newTeamCompanyId} onChange={(event) => setNewTeamCompanyId(String(event.target.value))}>
                  <MenuItem value="">No company</MenuItem>
                  {companies.map((company) => (<MenuItem key={company.id} value={company.id}>
                      {company.name}
                    </MenuItem>))}
                </Select>
              </FormControl>
              <Button variant="outlined" onClick={() => void createTeam()} disabled={!canManage || !projectId}>
                Add Team
              </Button>
            </Stack>

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Company</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Members</TableCell>
                  <TableCell align="right">Teams</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {companies.map((company) => (<TableRow key={company.id}>
                    <TableCell>{company.name}</TableCell>
                    <TableCell>{company.type}</TableCell>
                    <TableCell align="right">{company.active_members_count ?? 0}</TableCell>
                    <TableCell align="right">{company.active_teams_count ?? 0}</TableCell>
                  </TableRow>))}
              </TableBody>
            </Table>

            <Divider sx={{ my: 2 }}/>

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Team</TableCell>
                  <TableCell>Company</TableCell>
                  <TableCell align="right">Members</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {teams.map((team) => (<TableRow key={team.id}>
                    <TableCell>{team.name}</TableCell>
                    <TableCell>{team.company?.name ?? 'Unlinked'}</TableCell>
                    <TableCell align="right">{team.active_members_count ?? 0}</TableCell>
                  </TableRow>))}
              </TableBody>
            </Table>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Permission Preset Diff
            </Typography>

            <Stack spacing={1.5}>
              <FormControl size="small" fullWidth>
                <InputLabel id="preset-key">Preset</InputLabel>
                <Select labelId="preset-key" label="Preset" value={presetKey} onChange={(event) => setPresetKey(String(event.target.value))}>
                  {presets.map((preset) => (<MenuItem key={preset.id} value={preset.preset_key}>
                      {preset.name}
                    </MenuItem>))}
                </Select>
              </FormControl>

              <FormControl size="small" fullWidth>
                <InputLabel id="diff-user">Target User</InputLabel>
                <Select labelId="diff-user" label="Target User" value={diffUserId ? String(diffUserId) : ''} onChange={(event) => setDiffUserId(event.target.value ? Number(event.target.value) : null)}>
                  <MenuItem value="">Current user</MenuItem>
                  {members.map((member) => (<MenuItem key={member.id} value={member.id}>
                      {member.name}
                    </MenuItem>))}
                </Select>
              </FormControl>

              <Button variant="contained" onClick={() => void comparePreset()} disabled={!projectId || !presetKey}>
                Compare
              </Button>

              {diff && (<Stack spacing={1}>
                  <Alert severity="info">
                    {diff.target.label}: {diff.stats.matching_count} matching / {diff.stats.missing_count} missing / {diff.stats.extra_count} extra
                  </Alert>

                  <Box>
                    <Typography variant="subtitle2">Missing</Typography>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {diff.missing_permissions.map((permissionName) => (<Chip key={`missing-${permissionName}`} label={permissionName} size="small" color="warning" variant="outlined"/>))}
                    </Stack>
                  </Box>

                  <Box>
                    <Typography variant="subtitle2">Extra</Typography>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {diff.extra_permissions.map((permissionName) => (<Chip key={`extra-${permissionName}`} label={permissionName} size="small" color="info" variant="outlined"/>))}
                    </Stack>
                  </Box>
                </Stack>)}
            </Stack>
          </Paper>

          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Delegations
            </Typography>

            <Stack spacing={1.2} mb={2}>
              <FormControl size="small" fullWidth>
                <InputLabel id="delegator">Delegator</InputLabel>
                <Select labelId="delegator" label="Delegator" value={delegatorId} onChange={(event) => setDelegatorId(String(event.target.value))}>
                  {membersForDelegation.map((member) => (<MenuItem key={`delegator-${member.id}`} value={member.id}>
                      {member.name}
                    </MenuItem>))}
                </Select>
              </FormControl>

              <FormControl size="small" fullWidth>
                <InputLabel id="delegate">Delegate</InputLabel>
                <Select labelId="delegate" label="Delegate" value={delegateId} onChange={(event) => setDelegateId(String(event.target.value))}>
                  {membersForDelegation.map((member) => (<MenuItem key={`delegate-${member.id}`} value={member.id}>
                      {member.name}
                    </MenuItem>))}
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
                <TextField size="small" type="date" label="Start" value={delegationStart} onChange={(event) => setDelegationStart(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} fullWidth/>
                <TextField size="small" type="date" label="End" value={delegationEnd} onChange={(event) => setDelegationEnd(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} fullWidth/>
              </Stack>

              <TextField size="small" label="Reason" value={delegationReason} onChange={(event) => setDelegationReason(event.target.value)}/>

              <Button variant="outlined" onClick={() => void createDelegation()} disabled={!canManage || !projectId}>
                Add Delegation
              </Button>
            </Stack>

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Delegator</TableCell>
                  <TableCell>Delegate</TableCell>
                  <TableCell>Scope</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {delegations.map((delegation) => (<TableRow key={delegation.id}>
                    <TableCell>{delegation.delegator?.name}</TableCell>
                    <TableCell>{delegation.delegate?.name}</TableCell>
                    <TableCell>{delegation.scope}</TableCell>
                    <TableCell align="right">
                      <Button size="small" color="error" onClick={() => void deleteDelegation(delegation.id)} disabled={!canManage}>
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>))}
              </TableBody>
            </Table>
          </Paper>
        </Grid>
      </Grid>

      {busy && (<Typography variant="body2" color="text.secondary">
          Syncing access configuration...
        </Typography>)}
    </Stack>);
};
