import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import ApartmentRoundedIcon from '@mui/icons-material/ApartmentRounded'
import EngineeringRoundedIcon from '@mui/icons-material/EngineeringRounded'
import BlueprintRoundedIcon from '@mui/icons-material/AutoAwesomeMosaicRounded'
import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { api } from '../api/client'
import type { Paginated, ProjectSummary } from '../types'
import { useAuth } from '../hooks/useAuth'
import { useLocalization } from '../hooks/useLocalization'
import { parseApiError } from '../utils/apiError'
import { PageHero } from '../components/ui/PageHero'
import { StatCard } from '../components/ui/StatCard'

export const ProjectsPage = () => {
  const { permissions } = useAuth()
  const { t } = useLocalization()

  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadProjects = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await api.get<Paginated<ProjectSummary>>('/api/projects', {
        params: {
          per_page: 40,
          search: search || undefined,
        },
      })

      setProjects(response.data.data)
    } catch (requestError) {
      setError(parseApiError(requestError, 'Unable to load projects for this organization.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProjects()
  }, [])

  const metrics = useMemo(() => {
    const projectCount = projects.length
    const snagCount = projects.reduce((sum, project) => sum + (project.snags_count ?? 0), 0)
    const drawingCount = projects.reduce((sum, project) => sum + (project.drawings_count ?? 0), 0)
    const trainingCount = projects.filter((project) => project.is_training).length

    return { projectCount, snagCount, drawingCount, trainingCount }
  }, [projects])

  return (
    <Stack spacing={2.2}>
      <PageHero
        title={t('nav.projects')}
        description="Explore live and training projects, open drawings, and monitor quality work by location and team."
        badges={
          <Stack direction="row" spacing={1.2} flexWrap="wrap" useFlexGap>
            <Chip
              icon={<ApartmentRoundedIcon sx={{ color: '#fff !important' }} />}
              label={`${metrics.projectCount} projects`}
              sx={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.4)' }}
              variant="outlined"
            />
            <Chip
              icon={<EngineeringRoundedIcon sx={{ color: '#fff !important' }} />}
              label={`${metrics.snagCount} snags`}
              sx={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.4)' }}
              variant="outlined"
            />
          </Stack>
        }
      />

      <Grid container spacing={1.2}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard label="Total Projects" value={metrics.projectCount} tone="primary" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard label="Total Drawings" value={metrics.drawingCount} tone="secondary" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard label="Total Snags" value={metrics.snagCount} tone="warning" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard label="Training Projects" value={metrics.trainingCount} tone="neutral" />
        </Grid>
      </Grid>

      <Paper sx={{ p: 1.6, borderRadius: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.2}>
          <TextField
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            fullWidth
            placeholder="Search by project name or code"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <Button variant="contained" onClick={() => void loadProjects()} disabled={loading} sx={{ minWidth: 130 }}>
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </Stack>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}

      <Grid container spacing={2}>
        {projects.map((project) => (
          <Grid size={{ xs: 12, md: 6, lg: 4 }} key={project.id}>
            <Card
              sx={{
                height: '100%',
                transition: 'transform 180ms ease, box-shadow 180ms ease',
                '&:hover': {
                  transform: 'translateY(-3px)',
                  boxShadow: '0 16px 28px rgba(12, 42, 51, 0.16)',
                },
              }}
            >
              <CardContent sx={{ pb: '12px !important' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="h6">{project.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {project.code}
                    </Typography>
                  </Box>
                  <BlueprintRoundedIcon sx={{ color: 'primary.main' }} />
                </Stack>

                <Typography mt={1.2} minHeight={48}>
                  {project.description ?? 'No project description yet.'}
                </Typography>

                <Divider sx={{ my: 1.2 }} />

                <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
                  <Chip size="small" label={`Drawings: ${project.drawings_count ?? 0}`} />
                  <Chip size="small" label={`Snags: ${project.snags_count ?? 0}`} />
                  <Chip size="small" label={project.status} color={project.status === 'active' ? 'success' : 'default'} />
                  {project.is_training && <Chip size="small" color="warning" label={t('training.badge')} />}
                </Stack>

                {project.is_training && project.training_notes && (
                  <Typography mt={1} variant="caption" color="text.secondary">
                    {project.training_notes}
                  </Typography>
                )}
              </CardContent>

              <Box sx={{ px: 2, pb: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Button component={RouterLink} to={`/projects/${project.id}`} variant="contained" size="small">
                    Open Dashboard
                  </Button>
                  {permissions.includes('projects.manage') && (
                    <Typography variant="caption" color="text.secondary">
                      Manage enabled
                    </Typography>
                  )}
                </Stack>
              </Box>
            </Card>
          </Grid>
        ))}
      </Grid>

      {!loading && projects.length === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6">No projects found</Typography>
          <Typography color="text.secondary">Try a different search term or switch organization scope.</Typography>
        </Paper>
      )}
    </Stack>
  )
}
