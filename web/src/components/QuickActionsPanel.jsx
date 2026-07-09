import { Button, Grid, Paper, Stack, Typography, } from '@mui/material';
import ApartmentRoundedIcon from '@mui/icons-material/ApartmentRounded';
import ViewKanbanRoundedIcon from '@mui/icons-material/ViewKanbanRounded';
import AnalyticsRoundedIcon from '@mui/icons-material/AnalyticsRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded';
import { Link as RouterLink } from 'react-router-dom';
import { canAccessFeature } from '../utils/permissions';
export const QuickActionsPanel = ({ permissions, simple = false }) => {
    const can = (feature) => canAccessFeature(permissions, feature);
    const actions = [
        { feature: 'projects', to: '/projects', label: 'Projects', helper: 'Browse project workspaces', icon: <ApartmentRoundedIcon fontSize="small"/>, core: true },
        { feature: 'board', to: '/board', label: 'Drawing Work', helper: 'Review and move snag statuses', icon: <ViewKanbanRoundedIcon fontSize="small"/>, core: true },
        { feature: 'dashboard', to: '/dashboard', label: 'Dashboard', helper: 'Open KPI and SLA dashboards', icon: <AnalyticsRoundedIcon fontSize="small"/>, core: true },
        { feature: 'notificationPreferences', to: '/preferences/notifications', label: 'Alerts', helper: 'Adjust digest and alert preferences', icon: <NotificationsActiveRoundedIcon fontSize="small"/>, core: true },
        { feature: 'exports', to: '/exports', label: 'Exports', helper: 'Request PDF/CSV/XLSX reports', icon: <DescriptionRoundedIcon fontSize="small"/> },
        { feature: 'templates', to: '/templates', label: 'Templates', helper: 'Manage inspection and closeout templates', icon: <AssignmentRoundedIcon fontSize="small"/> },
        { feature: 'ops', to: '/ops', label: 'Ops', helper: 'Check health, limits, and support tools', icon: <TuneRoundedIcon fontSize="small"/> },
    ].filter((item) => can(item.feature));
    const visibleActions = simple ? actions.filter((action) => action.core) : actions;
    if (visibleActions.length === 0) {
        return null;
    }
    return (<Paper sx={{ p: 2.2, borderRadius: 3 }}>
      <Stack spacing={0.5} sx={{ mb: 1.5 }}>
        <Typography variant="h6">Quick Actions</Typography>
        <Typography color="text.secondary">
          Common actions based on your role permissions.
        </Typography>
      </Stack>

      <Grid container spacing={1.2}>
        {visibleActions.map((action) => (<Grid size={{ xs: 12, sm: 6, lg: 4 }} key={action.to}>
            <Button component={RouterLink} to={action.to} variant="outlined" fullWidth startIcon={action.icon} sx={{ justifyContent: 'flex-start', py: 1.1 }}>
              <Stack spacing={0.2} alignItems="flex-start" sx={{ textAlign: 'left' }}>
                <Typography variant="body2" fontWeight={700}>
                  {action.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {action.helper}
                </Typography>
              </Stack>
            </Button>
          </Grid>))}
      </Grid>
    </Paper>);
};
