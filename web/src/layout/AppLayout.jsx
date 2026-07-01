import { AppBar, Avatar, Box, Button, Chip, Collapse, Container, Divider, Drawer, FormControl, IconButton, InputLabel, List, ListItemButton, ListItemIcon, ListItemText, MenuItem, Select, Stack, Toolbar, Tooltip, Typography, } from '@mui/material';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import ConstructionRoundedIcon from '@mui/icons-material/ConstructionRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import ApartmentRoundedIcon from '@mui/icons-material/ApartmentRounded';
import SettingsSuggestRoundedIcon from '@mui/icons-material/SettingsSuggestRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import ViewKanbanRoundedIcon from '@mui/icons-material/ViewKanbanRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded';
import AnalyticsRoundedIcon from '@mui/icons-material/AnalyticsRounded';
import AssignmentTurnedInRoundedIcon from '@mui/icons-material/AssignmentTurnedInRounded';
import RouteRoundedIcon from '@mui/icons-material/RouteRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useLocalization } from '../hooks/useLocalization';
import { NotificationsMenu } from '../components/NotificationsMenu';
import { BrandLogo } from '../components/BrandLogo';
import { canAccessFeature } from '../utils/permissions';
const drawerWidth = 286;
const getStoredUiMode = () => {
    if (typeof window === 'undefined') {
        return 'simple';
    }
    return window.localStorage.getItem('esnagging.ui.mode') === 'advanced' ? 'advanced' : 'simple';
};
const PRIMARY_NAV_ITEMS = [
    { feature: 'projects', to: '/projects', labelKey: 'nav.projects', icon: <ApartmentRoundedIcon fontSize="small"/>, id: 'projects-nav' },
    { feature: 'board', to: '/board', labelKey: 'nav.board', icon: <ViewKanbanRoundedIcon fontSize="small"/> },
    { feature: 'dashboard', to: '/dashboard', labelKey: 'nav.dashboard', icon: <AnalyticsRoundedIcon fontSize="small"/> },
    { feature: 'notificationPreferences', to: '/preferences/notifications', labelKey: 'nav.alerts', icon: <NotificationsActiveRoundedIcon fontSize="small"/> },
];
const WORKSPACE_MORE_ITEMS = [
    { feature: 'inspectionsSubmissions', to: '/inspections/submissions', labelKey: 'nav.inspections', icon: <AssignmentTurnedInRoundedIcon fontSize="small"/> },
    { feature: 'exports', to: '/exports', labelKey: 'nav.exports', icon: <DescriptionRoundedIcon fontSize="small"/> },
    { feature: 'templates', to: '/templates', labelKey: 'nav.templates', icon: <AssignmentRoundedIcon fontSize="small"/> },
    { feature: 'inspectionsRequests', to: '/inspections/requests', labelKey: 'nav.requests', icon: <RouteRoundedIcon fontSize="small"/> },
    { feature: 'inspectionsReports', to: '/inspections/reports', labelKey: 'nav.reports', icon: <DashboardRoundedIcon fontSize="small"/> },
    { feature: 'equipment', to: '/equipment', labelKey: 'nav.equipment', icon: <ConstructionRoundedIcon fontSize="small"/> },
];
const ADMIN_NAV_ITEMS = [
    {
        feature: 'accessControl',
        to: '/access-control',
        labelKey: 'nav.access',
        icon: <ShieldRoundedIcon fontSize="small"/>,
        allowedRoles: ['org_admin', 'owner', 'project_manager'],
    },
    {
        feature: 'automation',
        to: '/automation',
        labelKey: 'nav.automation',
        icon: <SettingsSuggestRoundedIcon fontSize="small"/>,
        allowedRoles: ['org_admin', 'owner', 'project_manager', 'consultant'],
    },
    {
        feature: 'ops',
        to: '/ops',
        labelKey: 'nav.ops',
        icon: <TuneRoundedIcon fontSize="small"/>,
        allowedRoles: ['org_admin', 'owner'],
    },
];
export const AppLayout = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { organizations, activeOrganization, selectOrganization, logout, permissions, activeRoleNames, user } = useAuth();
    const { locale, setLocale, t, direction } = useLocalization();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [uiMode, setUiMode] = useState(() => getStoredUiMode());
    const [workspaceMoreOpen, setWorkspaceMoreOpen] = useState(false);
    const [adminOpen, setAdminOpen] = useState(false);
    const can = (feature) => canAccessFeature(permissions, feature);
    const hasRoleAccess = (allowedRoles) => {
        if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
            return true;
        }
        if (!Array.isArray(activeRoleNames) || activeRoleNames.length === 0) {
            return true;
        }
        return activeRoleNames.some((roleName) => allowedRoles.includes(roleName));
    };
    const simpleFirstEnabled = activeOrganization?.feature_flags?.['ui.simple_first_v1'] !== false;
    const showAdvanced = !simpleFirstEnabled || uiMode === 'advanced';
    const mapItems = (items) => items
        .filter((item) => can(item.feature) && hasRoleAccess(item.allowedRoles))
        .map((item) => ({ ...item, label: t(item.labelKey) }));
    const primaryItems = mapItems(PRIMARY_NAV_ITEMS);
    const workspaceMoreItems = mapItems(WORKSPACE_MORE_ITEMS);
    const adminItems = mapItems(ADMIN_NAV_ITEMS);
    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.localStorage.setItem('esnagging.ui.mode', uiMode);
        }
    }, [uiMode]);
    useEffect(() => {
        if (!simpleFirstEnabled && uiMode !== 'advanced') {
            setUiMode('advanced');
        }
    }, [simpleFirstEnabled, uiMode]);
    useEffect(() => {
        if (showAdvanced || workspaceMoreItems.length <= 2) {
            setWorkspaceMoreOpen(true);
        }
        else {
            setWorkspaceMoreOpen(false);
        }
    }, [showAdvanced, workspaceMoreItems.length]);
    useEffect(() => {
        if (adminItems.length === 0) {
            setAdminOpen(false);
        }
    }, [adminItems.length]);
    const isSelected = (to) => {
        if (to === '/projects') {
            return location.pathname.startsWith('/projects');
        }
        if (to === '/templates') {
            return location.pathname.startsWith('/templates') || location.pathname.startsWith('/inspections/templates');
        }
        return location.pathname === to || location.pathname.startsWith(`${to}/`);
    };
    const currentNav = [...primaryItems, ...workspaceMoreItems, ...adminItems].find((item) => isSelected(item.to));
    const pageTitle = currentNav?.label ?? t('app.title');
    const navItemStyles = {
        borderRadius: 2,
        mb: 0.6,
        '&.Mui-selected': {
            bgcolor: 'var(--surface-selected)',
            color: 'primary.main',
            '& .MuiListItemIcon-root': {
                color: 'primary.main',
            },
        },
    };
    const renderNavItem = (item) => (<ListItemButton key={item.to} component={RouterLink} to={item.to} selected={isSelected(item.to)} id={item.id} onClick={() => setMobileOpen(false)} sx={navItemStyles}>
        <ListItemIcon sx={{ minWidth: 34, color: 'text.secondary' }}>{item.icon}</ListItemIcon>
        <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 700 }}/>
      </ListItemButton>);
    const drawerContent = (<Box sx={{ px: 2, py: 2 }}>
      <Box sx={{
            p: 1.5,
            borderRadius: 3,
            mb: 2,
            border: '1px solid rgba(23, 47, 92, 0.14)',
            background: 'linear-gradient(180deg, #FFFFFF 0%, #F4F8FF 100%)',
            boxShadow: '0 10px 20px rgba(23, 47, 92, 0.14)',
        }}>
        <BrandLogo sx={{ maxWidth: 212 }}/>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Quality lifecycle workspace
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.4 }}>
          Role: {(activeRoleNames ?? []).join(', ') || 'n/a'}
        </Typography>
      </Box>

      <Box sx={{ mb: 1.5 }}>
        <Chip size="small" label={showAdvanced ? 'Advanced Mode' : 'Simple Mode'} color={showAdvanced ? 'primary' : 'default'} sx={{ mr: 1 }}/>
        {simpleFirstEnabled ? (<>
            <Button size="small" onClick={() => setUiMode((current) => current === 'advanced' ? 'simple' : 'advanced')}>
              {showAdvanced ? 'Use Simple' : 'Use Advanced'}
            </Button>
            <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.8 }}>
              {showAdvanced
                ? 'Advanced mode shows all modules and controls.'
                : 'Simple mode keeps daily actions first and hides setup tools.'}
            </Typography>
          </>) : (<Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.8 }}>
            Simple-first rollout is disabled for this organization.
          </Typography>)}
      </Box>

      <FormControl fullWidth size="small" sx={{ mb: 2 }}>
        <InputLabel id="org-select-label">{t('common.organization')}</InputLabel>
        <Select labelId="org-select-label" value={activeOrganization?.id ?? ''} label={t('common.organization')} onChange={(event) => {
            const organizationId = Number(event.target.value);
            selectOrganization(organizationId);
            navigate('/projects');
            setMobileOpen(false);
        }}>
          {organizations.map((organization) => (<MenuItem key={organization.id} value={organization.id}>
              {organization.name}
            </MenuItem>))}
        </Select>
      </FormControl>

      <Typography variant="caption" sx={{
            px: 1,
            pb: 0.5,
            color: 'text.secondary',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 800,
        }}>
        Workspace
      </Typography>
      <List dense sx={{ pt: 0.2 }}>
        {primaryItems.map((item) => renderNavItem(item))}
      </List>

      {workspaceMoreItems.length > 0 && (<>
          <List dense sx={{ pt: 0 }}>
              <ListItemButton onClick={() => setWorkspaceMoreOpen((current) => !current)} sx={{ borderRadius: 2 }}>
              <ListItemText primary={showAdvanced ? 'Advanced Tools' : 'More Tools'} primaryTypographyProps={{ fontWeight: 700, color: 'text.secondary' }}/>
              {workspaceMoreOpen ? <ExpandLessRoundedIcon fontSize="small"/> : <ExpandMoreRoundedIcon fontSize="small"/>}
            </ListItemButton>
          </List>
          <Collapse in={workspaceMoreOpen} timeout="auto" unmountOnExit>
            <List dense sx={{ pt: 0.2 }}>
              {workspaceMoreItems.map((item) => renderNavItem(item))}
            </List>
          </Collapse>
        </>)}

      {adminItems.length > 0 && (<>
          <Divider sx={{ my: 1.2 }}/>
          <List dense sx={{ pt: 0 }}>
            <ListItemButton onClick={() => setAdminOpen((current) => !current)} sx={{ borderRadius: 2 }}>
              <ListItemText primary="Admin & Setup" primaryTypographyProps={{ fontWeight: 700, color: 'text.secondary' }}/>
              {adminOpen ? <ExpandLessRoundedIcon fontSize="small"/> : <ExpandMoreRoundedIcon fontSize="small"/>}
            </ListItemButton>
          </List>
          <Collapse in={adminOpen} timeout="auto" unmountOnExit>
            <List dense sx={{ pt: 0.2 }}>
              {adminItems.map((item) => renderNavItem(item))}
            </List>
          </Collapse>
        </>)}
    </Box>);
    return (<Box sx={{ minHeight: '100vh', display: 'flex' }}>
      <Drawer variant="permanent" open anchor={direction === 'rtl' ? 'right' : 'left'} sx={{
            display: { xs: 'none', md: 'block' },
            width: drawerWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
                width: drawerWidth,
                border: 0,
                borderRadius: 0,
                borderInlineEnd: '1px solid var(--outline-soft)',
                background: 'linear-gradient(180deg, #FCFDFF 0%, #EFF4FC 100%)',
            },
        }}>
        {drawerContent}
      </Drawer>

      <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} anchor={direction === 'rtl' ? 'right' : 'left'} ModalProps={{ keepMounted: true }} sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
                width: drawerWidth,
                border: 0,
            },
        }}>
        {drawerContent}
      </Drawer>

      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <AppBar position="sticky" elevation={0} sx={{
            width: { md: `calc(100% - ${drawerWidth}px)` },
            ml: { md: direction === 'rtl' ? 0 : `${drawerWidth}px` },
            mr: { md: direction === 'rtl' ? `${drawerWidth}px` : 0 },
        }}>
          <Toolbar sx={{ px: { xs: 1.5, sm: 2.5 }, py: 1, gap: 1.2 }}>
            <IconButton onClick={() => setMobileOpen(true)} sx={{ display: { xs: 'inline-flex', md: 'none' } }} aria-label="open navigation">
              <MenuRoundedIcon />
            </IconButton>

            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Typography variant="h6" noWrap>
                {pageTitle}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {activeOrganization?.code} | {activeOrganization?.name}
              </Typography>
            </Box>

            <FormControl size="small" sx={{ minWidth: 128, display: { xs: 'none', sm: 'flex' } }}>
              <InputLabel id="locale-select-label">{t('common.language')}</InputLabel>
              <Select labelId="locale-select-label" value={locale} label={t('common.language')} onChange={(event) => {
            const nextLocale = String(event.target.value);
            if (nextLocale === 'en' || nextLocale === 'ar') {
                setLocale(nextLocale);
            }
        }}>
                <MenuItem value="en">{t('language.en')}</MenuItem>
                <MenuItem value="ar">{t('language.ar')}</MenuItem>
              </Select>
            </FormControl>

            <NotificationsMenu canView={permissions.includes('notifications.view')}/>

            <Tooltip title={user?.email ?? ''}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ display: { xs: 'none', sm: 'flex' } }}>
                <Avatar sx={{
            width: 32,
            height: 32,
            bgcolor: 'primary.main',
            fontWeight: 700,
            fontSize: 13,
        }}>
                  {(user?.name ?? 'U')
            .split(' ')
            .map((part) => part[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()}
                </Avatar>
                <Typography variant="body2" sx={{ maxWidth: 160 }} noWrap>
                  {user?.name}
                </Typography>
              </Stack>
            </Tooltip>

            <Button color="inherit" variant="outlined" onClick={() => void logout()} sx={{ borderColor: 'var(--outline-soft)' }}>
              {t('auth.logout')}
            </Button>
          </Toolbar>
        </AppBar>

        <Box sx={{
            ml: { md: direction === 'rtl' ? 0 : `${drawerWidth}px` },
            mr: { md: direction === 'rtl' ? `${drawerWidth}px` : 0 },
        }}>
          <Container maxWidth={false} sx={{ px: { xs: 1.5, sm: 2.5 }, py: 2.5 }}>
            <Box className="page-enter">
              <Outlet />
            </Box>
          </Container>
        </Box>
      </Box>
    </Box>);
};
