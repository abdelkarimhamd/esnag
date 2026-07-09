import { Alert, Box, Button, Card, CardContent, Chip, FormControl, Grid, InputLabel, MenuItem, Paper, Select, Stack, Typography, } from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { SnagDrawer } from '../components/SnagDrawer';
import { PageHero } from '../components/ui/PageHero';
import { StatCard } from '../components/ui/StatCard';
import { useAuth } from '../hooks/useAuth';
import { useFeatureTour } from '../hooks/useFeatureTour';
import { subscribeOrganizationChannel } from '../realtime/echo';
import { formatPriorityLabel, formatStatusLabel, snagPriorityChipColor, snagStatusChipColor } from '../utils/ui';
import { normalizeApiError } from '../utils/apiError';
export const KanbanBoardPage = () => {
    const { activeOrganization, permissions, resolveProjectPermissions } = useAuth();
    const activeOrganizationId = activeOrganization?.id ?? null;
    const [projects, setProjects] = useState([]);
    const [members, setMembers] = useState([]);
    const [companies, setCompanies] = useState([]);
    const [teams, setTeams] = useState([]);
    const [selectedProjectId, setSelectedProjectId] = useState('');
    const [kanban, setKanban] = useState(null);
    const [selectedSnagId, setSelectedSnagId] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [scopedPermissions, setScopedPermissions] = useState(permissions);
    const [scopeFilter, setScopeFilter] = useState('mine');
    const [dueWindow, setDueWindow] = useState('all');
    const canTransition = scopedPermissions.includes('snags.transition');
    const canAssign = scopedPermissions.includes('snags.assign');
    const boardTourSteps = useMemo(() => [
        {
            id: 'project_filter',
            title: 'Project Filter',
            text: 'Switch projects to focus the board on one job or keep all projects.',
            attachTo: { element: '#board-project-filter', on: 'bottom' },
        },
        {
            id: 'board_columns',
            title: 'Kanban Columns',
            text: 'Snags are grouped by workflow status so teams can prioritize quickly.',
            attachTo: { element: '#board-columns', on: 'top' },
        },
        {
            id: 'quick_actions',
            title: 'Quick Actions',
            text: 'Use quick actions for fast transitions, or open the detail drawer for full updates.',
            attachTo: { element: '#board-quick-actions', on: 'left' },
        },
    ], []);
    useFeatureTour({
        tourKey: 'snags_board',
        enabled: Boolean(kanban),
        steps: boardTourSteps,
    });
    const loadProjects = useCallback(async () => {
        const response = await api.get('/api/projects', {
            params: { per_page: 100 },
        });
        setProjects(response.data.data);
    }, []);
    const loadMembers = useCallback(async (projectId = selectedProjectId) => {
        const response = await api.get('/api/organizations/members', {
            params: {
                project_id: projectId || undefined,
            },
        });
        setMembers(response.data.data);
    }, [selectedProjectId]);
    const loadStakeholders = useCallback(async (projectId = selectedProjectId) => {
        const [companiesResponse, teamsResponse] = await Promise.all([
            api.get('/api/stakeholders/companies', {
                params: {
                    project_id: projectId || undefined,
                },
            }),
            api.get('/api/stakeholders/teams', {
                params: {
                    project_id: projectId || undefined,
                },
            }),
        ]);
        setCompanies(companiesResponse.data.data);
        setTeams(teamsResponse.data.data);
    }, [selectedProjectId]);
    const loadBoard = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.get('/api/kanban/snags', {
                params: {
                    project_id: selectedProjectId || undefined,
                    scope: scopeFilter,
                    due_window: dueWindow,
                },
            });
            setKanban(response.data.data);
        }
        catch (requestError) {
            setError(normalizeApiError(requestError, 'Unable to load Kanban board.'));
        }
        finally {
            setLoading(false);
        }
    }, [dueWindow, scopeFilter, selectedProjectId]);
    useEffect(() => {
        void Promise.all([loadProjects(), loadBoard()]);
    }, [loadBoard, loadProjects]);
    useEffect(() => {
        void Promise.all([loadMembers(selectedProjectId), loadStakeholders(selectedProjectId), loadBoard()]);
    }, [loadBoard, loadMembers, loadStakeholders, selectedProjectId]);
    useEffect(() => {
        const run = async () => {
            try {
                const scoped = await resolveProjectPermissions(selectedProjectId ? Number(selectedProjectId) : null);
                setScopedPermissions(scoped.length > 0 ? scoped : permissions);
            }
            catch {
                setScopedPermissions(permissions);
            }
        };
        void run();
    }, [selectedProjectId, permissions, resolveProjectPermissions]);
    useEffect(() => {
        if (!activeOrganizationId) {
            return;
        }
        const unsubscribe = subscribeOrganizationChannel(activeOrganizationId, {
            onSnag: () => {
                void loadBoard();
            },
        });
        return () => {
            unsubscribe();
        };
    }, [activeOrganizationId, loadBoard]);
    const moveSnag = async (snag, toStatus) => {
        await api.post(`/api/snags/${snag.id}/transition`, {
            to_status: toStatus,
            assigned_to: snag.assigned_to ?? undefined,
        });
        await loadBoard();
    };
    const filteredColumns = useMemo(() => kanban?.columns ?? [], [kanban]);
    const totalSnags = useMemo(() => filteredColumns.reduce((sum, column) => sum + column.total, 0), [filteredColumns]);
    const stalledSnags = useMemo(() => filteredColumns
        .filter((column) => column.status === 'new' || column.status === 'assigned')
        .reduce((sum, column) => sum + column.total, 0), [filteredColumns]);
    const reviewSnags = useMemo(() => filteredColumns.find((column) => column.status === 'ready_for_review')?.total ?? 0, [filteredColumns]);
    return (<Stack spacing={2}>
      {error && (<Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void loadBoard()}>
            Retry
          </Button>}>
          <Stack spacing={0.5}>
            <Typography variant="body2">{error.message}</Typography>
            {error.hint && (<Typography variant="caption" color="text.secondary">
                {error.hint}
              </Typography>)}
          </Stack>
        </Alert>)}

      <PageHero title="Drawing Work Board" description="Focus on assigned work first, then drill into full snag details only when needed." actions={<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <FormControl size="small" sx={{ minWidth: 160, bgcolor: 'rgba(255,255,255,0.14)', borderRadius: 1.5 }}>
              <InputLabel id="board-scope-label" sx={{ color: 'rgba(255,255,255,0.92)' }}>
                Scope
              </InputLabel>
              <Select labelId="board-scope-label" label="Scope" value={scopeFilter} onChange={(event) => setScopeFilter(String(event.target.value))} sx={{
                color: '#FFFFFF',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.42)' },
                '& .MuiSvgIcon-root': { color: '#FFFFFF' },
            }}>
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="mine">Mine</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 280, bgcolor: 'rgba(255,255,255,0.14)', borderRadius: 1.5 }} id="board-project-filter">
              <InputLabel id="board-project-label" sx={{ color: 'rgba(255,255,255,0.92)' }}>
                Project
              </InputLabel>
              <Select labelId="board-project-label" label="Project" value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value ? Number(event.target.value) : '')} sx={{
                color: '#FFFFFF',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.42)' },
                '& .MuiSvgIcon-root': { color: '#FFFFFF' },
            }}>
                <MenuItem value="">All projects</MenuItem>
                {projects.map((project) => (<MenuItem key={project.id} value={project.id}>
                    {project.code} - {project.name}
                  </MenuItem>))}
              </Select>
            </FormControl>
          </Stack>} badges={<Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" variant="outlined" label={`${filteredColumns.length} stages`} sx={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.44)' }}/>
            <Chip size="small" variant="outlined" label={`Total ${totalSnags}`} sx={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.44)' }}/>
            <Chip size="small" variant="outlined" label={`Scope: ${scopeFilter === 'mine' ? 'Mine' : 'All'}`} sx={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.44)' }}/>
          </Stack>}/>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip size="small" color={dueWindow === 'all' ? 'primary' : 'default'} label="All due dates" onClick={() => setDueWindow('all')}/>
        <Chip size="small" color={dueWindow === 'overdue' ? 'primary' : 'default'} label="Overdue only" onClick={() => setDueWindow('overdue')}/>
        <Chip size="small" color={dueWindow === '7d' ? 'primary' : 'default'} label="Next 7 days" onClick={() => setDueWindow('7d')}/>
      </Stack>

      <Grid container spacing={1.3}>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <StatCard label="Board Total" value={totalSnags} tone="primary"/>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <StatCard label="Awaiting Action" value={stalledSnags} tone="warning" hint="New + Assigned"/>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <StatCard label="Ready For Review" value={reviewSnags} tone="secondary"/>
        </Grid>
      </Grid>

      <Grid container spacing={2} id="board-columns">
        {filteredColumns.map((column) => (<Grid size={{ xs: 12, md: 6, lg: 2 }} key={column.status}>
            <Stack spacing={1}>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle1" fontWeight={700}>
                  {column.label}
                </Typography>
                <Chip size="small" label={column.total}/>
              </Box>

              <Stack spacing={1}>
                {column.snags.map((snag) => {
                const transitions = (kanban?.workflow[snag.status] ?? []).filter((status) => status !== 'assigned' || Boolean(snag.assigned_to));
                const recommended = snag.workflow?.recommended_next_status ?? transitions[0] ?? null;
                return (<Card key={snag.id} variant="outlined" sx={{ borderRadius: 2, cursor: 'pointer' }}>
                      <CardContent sx={{ pb: 1.25 }} onClick={() => setSelectedSnagId(snag.id)}>
                        <Stack spacing={1}>
                          <Typography variant="body2" fontWeight={700}>
                            {snag.reference}
                          </Typography>
                          <Typography variant="body2">{snag.title}</Typography>
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Chip size="small" color={snagPriorityChipColor(snag.priority)} label={formatPriorityLabel(snag.priority)}/>
                            <Chip size="small" color={snagStatusChipColor(snag.status)} label={formatStatusLabel(snag.status)}/>
                            <Chip size="small" label={snag.assignee?.name ?? 'Unassigned'}/>
                            <Chip size="small" variant="outlined" label={`Closeout ${snag.closeoutInstance?.completion_percentage ?? snag.closeout_instance?.completion_percentage ?? 0}%`}/>
                          </Stack>
                        </Stack>
                      </CardContent>

                      {canTransition && recommended && (<Box px={2} pb={1.5} id="board-quick-actions">
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Button size="small" variant="outlined" onClick={() => void moveSnag(snag, recommended)} disabled={loading}>
                              {formatStatusLabel(recommended)}
                            </Button>
                          </Stack>
                        </Box>)}
                    </Card>);
            })}
              </Stack>
            </Stack>
          </Grid>))}
      </Grid>

      {!loading && filteredColumns.length === 0 && (<Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="h6">No snags for this filter</Typography>
          <Typography color="text.secondary">Try another project scope or create a new snag from the drawing viewer.</Typography>
        </Paper>)}

      <SnagDrawer snagId={selectedSnagId} members={members} companies={companies} teams={teams} canTransition={canTransition} canAssign={canAssign} canComment={scopedPermissions.includes('snags.comment')} canAttach={scopedPermissions.includes('snags.attach')} canCloseoutView={scopedPermissions.includes('closeout.instances.view')} canCloseoutUpdate={scopedPermissions.includes('closeout.instances.update')} canCloseoutReview={scopedPermissions.includes('closeout.review')} onClose={() => setSelectedSnagId(null)} onChanged={async () => {
            await loadBoard();
        }}/>
    </Stack>);
};
