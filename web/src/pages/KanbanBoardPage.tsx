import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { SnagDrawer } from '../components/SnagDrawer'
import { PageHero } from '../components/ui/PageHero'
import { StatCard } from '../components/ui/StatCard'
import { useAuth } from '../hooks/useAuth'
import { useFeatureTour } from '../hooks/useFeatureTour'
import { subscribeOrganizationChannel } from '../realtime/echo'
import { formatPriorityLabel, formatStatusLabel, snagPriorityChipColor, snagStatusChipColor } from '../utils/ui'
import type { Paginated, ProjectSummary, Snag, SnagStatus, StakeholderCompany, StakeholderTeam, UserSummary } from '../types'

interface KanbanColumn {
  status: SnagStatus
  label: string
  total: number
  snags: Snag[]
}

interface KanbanPayload {
  columns: KanbanColumn[]
  workflow: Record<string, SnagStatus[]>
}

export const KanbanBoardPage = () => {
  const { activeOrganization, permissions, resolveProjectPermissions } = useAuth()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [members, setMembers] = useState<UserSummary[]>([])
  const [companies, setCompanies] = useState<StakeholderCompany[]>([])
  const [teams, setTeams] = useState<StakeholderTeam[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | ''>('')
  const [kanban, setKanban] = useState<KanbanPayload | null>(null)
  const [selectedSnagId, setSelectedSnagId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [scopedPermissions, setScopedPermissions] = useState<string[]>(permissions)

  const canTransition = scopedPermissions.includes('snags.transition')
  const canAssign = scopedPermissions.includes('snags.assign')
  const boardTourSteps = useMemo(
    () => [
      {
        id: 'project_filter',
        title: 'Project Filter',
        text: 'Switch projects to focus the board on one job or keep all projects.',
        attachTo: { element: '#board-project-filter', on: 'bottom' as const },
      },
      {
        id: 'board_columns',
        title: 'Kanban Columns',
        text: 'Snags are grouped by workflow status so teams can prioritize quickly.',
        attachTo: { element: '#board-columns', on: 'top' as const },
      },
      {
        id: 'quick_actions',
        title: 'Quick Actions',
        text: 'Use quick actions for fast transitions, or open the detail drawer for full updates.',
        attachTo: { element: '#board-quick-actions', on: 'left' as const },
      },
    ],
    [],
  )

  useFeatureTour({
    tourKey: 'snags_board',
    enabled: Boolean(kanban),
    steps: boardTourSteps,
  })

  const loadProjects = async () => {
    const response = await api.get<Paginated<ProjectSummary>>('/api/projects', {
      params: { per_page: 100 },
    })
    setProjects(response.data.data)
  }

  const loadMembers = async () => {
    const response = await api.get<{ data: UserSummary[] }>('/api/organizations/members', {
      params: {
        project_id: selectedProjectId || undefined,
      },
    })
    setMembers(response.data.data)
  }

  const loadStakeholders = async () => {
    const [companiesResponse, teamsResponse] = await Promise.all([
      api.get<{ data: StakeholderCompany[] }>('/api/stakeholders/companies', {
        params: {
          project_id: selectedProjectId || undefined,
        },
      }),
      api.get<{ data: StakeholderTeam[] }>('/api/stakeholders/teams', {
        params: {
          project_id: selectedProjectId || undefined,
        },
      }),
    ])

    setCompanies(companiesResponse.data.data)
    setTeams(teamsResponse.data.data)
  }

  const loadBoard = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await api.get<{ data: KanbanPayload }>('/api/kanban/snags', {
        params: {
          project_id: selectedProjectId || undefined,
        },
      })
      setKanban(response.data.data)
    } catch {
      setError('Unable to load Kanban board.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void Promise.all([loadProjects(), loadBoard()])
  }, [])

  useEffect(() => {
    void Promise.all([loadMembers(), loadStakeholders(), loadBoard()])
  }, [selectedProjectId])

  useEffect(() => {
    const run = async () => {
      try {
        const scoped = await resolveProjectPermissions(selectedProjectId ? Number(selectedProjectId) : null)
        setScopedPermissions(scoped.length > 0 ? scoped : permissions)
      } catch {
        setScopedPermissions(permissions)
      }
    }

    void run()
  }, [selectedProjectId, permissions, resolveProjectPermissions])

  useEffect(() => {
    if (!activeOrganization) {
      return
    }

    const unsubscribe = subscribeOrganizationChannel(activeOrganization.id, {
      onSnag: () => {
        void loadBoard()
      },
    })

    return () => {
      unsubscribe()
    }
  }, [activeOrganization?.id, selectedProjectId])

  const moveSnag = async (snag: Snag, toStatus: SnagStatus) => {
    await api.post(`/api/snags/${snag.id}/transition`, {
      to_status: toStatus,
      assigned_to: snag.assigned_to ?? undefined,
    })

    await loadBoard()
  }

  const filteredColumns = useMemo(() => kanban?.columns ?? [], [kanban])
  const totalSnags = useMemo(() => filteredColumns.reduce((sum, column) => sum + column.total, 0), [filteredColumns])
  const stalledSnags = useMemo(
    () =>
      filteredColumns
        .filter((column) => column.status === 'new' || column.status === 'assigned')
        .reduce((sum, column) => sum + column.total, 0),
    [filteredColumns],
  )
  const reviewSnags = useMemo(
    () => filteredColumns.find((column) => column.status === 'ready_for_review')?.total ?? 0,
    [filteredColumns],
  )

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}

      <PageHero
        title="Snags Kanban"
        description="Track snag movement by status, trigger quick transitions, and open full details from any card."
        actions={
          <FormControl size="small" sx={{ minWidth: 280, bgcolor: 'rgba(255,255,255,0.14)', borderRadius: 1.5 }} id="board-project-filter">
            <InputLabel id="board-project-label" sx={{ color: 'rgba(255,255,255,0.92)' }}>
              Project
            </InputLabel>
            <Select
              labelId="board-project-label"
              label="Project"
              value={selectedProjectId}
              onChange={(event) => setSelectedProjectId(event.target.value ? Number(event.target.value) : '')}
              sx={{
                color: '#FFFFFF',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.42)' },
                '& .MuiSvgIcon-root': { color: '#FFFFFF' },
              }}
            >
              <MenuItem value="">All projects</MenuItem>
              {projects.map((project) => (
                <MenuItem key={project.id} value={project.id}>
                  {project.code} - {project.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        }
        badges={
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" variant="outlined" label={`${filteredColumns.length} stages`} sx={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.44)' }} />
            <Chip size="small" variant="outlined" label={`Total ${totalSnags}`} sx={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.44)' }} />
          </Stack>
        }
      />

      <Grid container spacing={1.3}>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <StatCard label="Board Total" value={totalSnags} tone="primary" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <StatCard label="Awaiting Action" value={stalledSnags} tone="warning" hint="New + Assigned" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <StatCard label="Ready For Review" value={reviewSnags} tone="secondary" />
        </Grid>
      </Grid>

      <Grid container spacing={2} id="board-columns">
        {filteredColumns.map((column) => (
          <Grid size={{ xs: 12, md: 6, lg: 2 }} key={column.status}>
            <Stack spacing={1}>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle1" fontWeight={700}>
                  {column.label}
                </Typography>
                <Chip size="small" label={column.total} />
              </Box>

              <Stack spacing={1}>
                {column.snags.map((snag) => {
                  const transitions = (kanban?.workflow[snag.status] ?? []).filter(
                    (status) => status !== 'assigned' || Boolean(snag.assigned_to),
                  )

                  return (
                    <Card key={snag.id} variant="outlined" sx={{ borderRadius: 2, cursor: 'pointer' }}>
                      <CardContent sx={{ pb: 1.25 }} onClick={() => setSelectedSnagId(snag.id)}>
                        <Stack spacing={1}>
                          <Typography variant="body2" fontWeight={700}>
                            {snag.reference}
                          </Typography>
                          <Typography variant="body2">{snag.title}</Typography>
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Chip size="small" color={snagPriorityChipColor(snag.priority)} label={formatPriorityLabel(snag.priority)} />
                            <Chip size="small" color={snagStatusChipColor(snag.status)} label={formatStatusLabel(snag.status)} />
                            <Chip size="small" label={snag.assignee?.name ?? 'Unassigned'} />
                            <Chip
                              size="small"
                              variant="outlined"
                              label={`Closeout ${snag.closeoutInstance?.completion_percentage ?? snag.closeout_instance?.completion_percentage ?? 0}%`}
                            />
                          </Stack>
                        </Stack>
                      </CardContent>

                      {canTransition && transitions.length > 0 && (
                        <Box px={2} pb={1.5} id="board-quick-actions">
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            {transitions.slice(0, 2).map((toStatus) => (
                              <Button
                                key={toStatus}
                                size="small"
                                variant="outlined"
                                onClick={() => void moveSnag(snag, toStatus)}
                                disabled={loading}
                              >
                                {formatStatusLabel(toStatus)}
                              </Button>
                            ))}
                          </Stack>
                        </Box>
                      )}
                    </Card>
                  )
                })}
              </Stack>
            </Stack>
          </Grid>
        ))}
      </Grid>

      {!loading && filteredColumns.length === 0 && (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="h6">No snags for this filter</Typography>
          <Typography color="text.secondary">Try another project scope or create a new snag from the drawing viewer.</Typography>
        </Paper>
      )}

      <SnagDrawer
        snagId={selectedSnagId}
        members={members}
        companies={companies}
        teams={teams}
        canTransition={canTransition}
        canAssign={canAssign}
        canComment={scopedPermissions.includes('snags.comment')}
        canAttach={scopedPermissions.includes('snags.attach')}
        canCloseoutView={scopedPermissions.includes('closeout.instances.view')}
        canCloseoutUpdate={scopedPermissions.includes('closeout.instances.update')}
        canCloseoutReview={scopedPermissions.includes('closeout.review')}
        onClose={() => setSelectedSnagId(null)}
        onChanged={async () => {
          await loadBoard()
        }}
      />
    </Stack>
  )
}
