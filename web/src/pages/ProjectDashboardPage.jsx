import { Alert, Button, Chip, Grid, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography, } from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { parseApiError } from '../utils/apiError';
import { PageHero } from '../components/ui/PageHero';
import { StatCard } from '../components/ui/StatCard';
import { formatStatusLabel, snagStatusChipColor } from '../utils/ui';
export const ProjectDashboardPage = () => {
    const { projectId } = useParams();
    const { permissions } = useAuth();
    const canViewDrawings = permissions.includes('drawings.view');
    const [project, setProject] = useState(null);
    const [dashboard, setDashboard] = useState(null);
    const [error, setError] = useState(null);
    const load = useCallback(async () => {
        if (!projectId) {
            return;
        }
        try {
            const [projectResponse, dashboardResponse] = await Promise.all([
                api.get(`/api/projects/${projectId}`),
                api.get(`/api/projects/${projectId}/dashboard`),
            ]);
            setProject(projectResponse.data.data);
            setDashboard(dashboardResponse.data.data);
            setError(null);
        }
        catch (requestError) {
            setError(parseApiError(requestError, 'Unable to load project dashboard.'));
        }
    }, [projectId]);
    useEffect(() => {
        void load();
    }, [load]);
    const drawings = useMemo(() => project?.drawings ?? [], [project]);
    return (<Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}

      {project && (<PageHero title={project.name} description={<span>
              {project.code} | Project-level summary of snags, drawing coverage, and status movement.
            </span>} actions={<Button component={RouterLink} to="/projects" variant="outlined" sx={{ borderColor: 'rgba(255,255,255,0.42)', color: '#FFFFFF' }}>
              Back to Projects
            </Button>} badges={<Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip sx={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.42)' }} variant="outlined" label={`Status: ${formatStatusLabel(project.status)}`}/>
              {project.is_training && <Chip sx={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.42)' }} variant="outlined" label="Training Mode"/>}
            </Stack>}/>)}

      {project?.is_training && project.training_locked && (<Alert severity="warning">
          {project.training_notes || 'Training mode is active. Changes are blocked for this project.'}
        </Alert>)}

      {dashboard && (<Grid container spacing={1.4}>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <StatCard label="Total Snags" value={dashboard.summary.snags_total} tone="warning"/>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <StatCard label="Open Snags" value={dashboard.summary.open_snags} tone="secondary"/>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <StatCard label="Drawings" value={dashboard.summary.drawings_total} tone="primary"/>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <Paper sx={{ p: 1.8, borderRadius: 3 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={700}>
                Status Mix
              </Typography>
              <Stack direction="row" spacing={0.8} mt={1} flexWrap="wrap" useFlexGap>
                {Object.entries(dashboard.summary.status_breakdown).map(([status, total]) => (<Chip key={status} size="small" color={snagStatusChipColor(status)} label={`${formatStatusLabel(status)} ${total}`}/>))}
              </Stack>
            </Paper>
          </Grid>
        </Grid>)}

      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom id="drawings-entry">
          Drawings
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Open a drawing to place pins, create snags, compare revisions, and manage closeout progress.
        </Typography>

        {!canViewDrawings && (<Alert severity="warning" sx={{ mb: 2 }}>
            You can view this project summary, but drawing viewer access is not enabled for your role.
          </Alert>)}

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Code</TableCell>
              <TableCell>Title</TableCell>
              <TableCell>Current Revision</TableCell>
              <TableCell align="right">Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {drawings.map((drawing) => (<TableRow key={drawing.id} hover>
                <TableCell>{drawing.code}</TableCell>
                <TableCell>{drawing.title}</TableCell>
                <TableCell>{drawing.currentRevision?.revision_label ?? drawing.current_revision?.revision_label ?? 'N/A'}</TableCell>
                <TableCell align="right">
                  {canViewDrawings ? (<Button component={RouterLink} to={`/projects/${projectId}/drawings/${drawing.id}`} variant="contained" size="small">
                      Open Viewer
                    </Button>) : (<Typography variant="caption" color="text.secondary">
                      No access
                    </Typography>)}
                </TableCell>
              </TableRow>))}
          </TableBody>
        </Table>
      </Paper>
    </Stack>);
};
