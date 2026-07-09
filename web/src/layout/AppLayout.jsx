import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Box, Button, Divider, ListItemIcon, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import ViewKanbanRoundedIcon from '@mui/icons-material/ViewKanbanRounded';
import LayersRoundedIcon from '@mui/icons-material/LayersRounded';
import ViewInArRoundedIcon from '@mui/icons-material/ViewInArRounded';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import AssignmentTurnedInRoundedIcon from '@mui/icons-material/AssignmentTurnedInRounded';
import PlaylistAddCheckRoundedIcon from '@mui/icons-material/PlaylistAddCheckRounded';
import HandshakeRoundedIcon from '@mui/icons-material/HandshakeRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import BarChartRoundedIcon from '@mui/icons-material/BarChartRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import TranslateRoundedIcon from '@mui/icons-material/TranslateRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ApartmentRoundedIcon from '@mui/icons-material/ApartmentRounded';
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLocalization } from '../hooks/useLocalization';
import { NotificationsMenu } from '../components/NotificationsMenu';
import { canAccessFeature } from '../utils/permissions';
import { BRAND, FONT_MONO } from '../theme';

const RAIL_WIDTH = 76;

// Flat navigation — one rail, no simple/advanced modes, no nested drawers.
// Each item is gated by a feature permission (Home is always available). The
// `id` on Drawings preserves the onboarding tour anchor (#projects-nav).
const RAIL_ITEMS = [
  { key: 'home', to: '/home', labelKey: 'nav.home', fallback: 'Home', icon: HomeRoundedIcon },
  { key: 'board', to: '/board', feature: 'board', labelKey: 'nav.board', fallback: 'Board', icon: ViewKanbanRoundedIcon },
  { key: 'drawings', to: '/projects', feature: 'projects', labelKey: 'nav.drawings', fallback: 'Drawings', icon: LayersRoundedIcon, id: 'projects-nav' },
  { key: 'overlay', to: '/overlay', feature: 'drawingOverlay', labelKey: 'nav.overlay', fallback: 'Overlay', icon: ApartmentRoundedIcon },
  { key: 'equipment', to: '/equipment', feature: 'equipment', labelKey: 'nav.equipment', fallback: 'Equipment', icon: ViewInArRoundedIcon },
  { key: 'inspect', to: '/inspections/submissions', feature: 'inspectionsSubmissions', labelKey: 'nav.inspect', fallback: 'Inspect', icon: FactCheckRoundedIcon },
  { key: 'commissioning', to: '/commissioning', feature: 'commissioning', labelKey: 'nav.commissioning', fallback: 'T&C', icon: AssignmentTurnedInRoundedIcon },
  { key: 'handovers', to: '/handovers', feature: 'handoverRequests', labelKey: 'nav.handovers', fallback: 'Handovers', icon: AccountTreeRoundedIcon },
  { key: 'handover', to: '/handover', feature: 'handover', labelKey: 'nav.handover', fallback: 'Certificates', icon: HandshakeRoundedIcon },
  { key: 'punchLists', to: '/punch-lists', feature: 'punchLists', labelKey: 'nav.punchLists', fallback: 'Punch lists', icon: PlaylistAddCheckRoundedIcon },
  { key: 'analytics', to: '/dashboard', feature: 'dashboard', labelKey: 'nav.analytics', fallback: 'Analytics', icon: BarChartRoundedIcon },
  { key: 'reports', to: '/exports', feature: 'exports', labelKey: 'nav.reports', fallback: 'Reports', icon: DescriptionRoundedIcon },
];

// Settings / admin surfaces reached from the account menu and the rail gear.
const SETTINGS_ITEMS = [
  { to: '/search/advanced', feature: 'advancedSearch', label: 'Advanced search' },
  { to: '/access-control', feature: 'accessControl', label: 'Team & access' },
  { to: '/master-data', feature: 'masterData', label: 'Location & categories' },
  { to: '/handovers/workflow', feature: 'workflowConfig', label: 'Handover workflow' },
  { to: '/audit', feature: 'auditTrail', label: 'Audit trail' },
  { to: '/automation', feature: 'automation', label: 'Automation' },
  { to: '/templates', feature: 'templates', label: 'Templates' },
  { to: '/inspections/requests', feature: 'inspectionsRequests', label: 'Inspection requests' },
  { to: '/inspections/reports', feature: 'inspectionsReports', label: 'Inspection reports' },
  { to: '/preferences/notifications', feature: 'notificationPreferences', label: 'Notifications' },
  { to: '/ops', feature: 'ops', label: 'Organization & health' },
];

// The three-square brand mark shown at the top of the rail.
const BrandMark = () => (
  <Box component="svg" width="30" height="30" viewBox="0 0 34 34" fill="none" sx={{ mb: 2, flex: 'none' }} aria-hidden>
    <rect x="1" y="1" width="14.5" height="14.5" rx="3.2" fill={BRAND.green} />
    <rect x="18.5" y="1" width="14.5" height="14.5" rx="3.2" fill={BRAND.navy} />
    <rect x="1" y="18.5" width="14.5" height="14.5" rx="3.2" fill={BRAND.teal} />
  </Box>
);

export const AppLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { organizations, activeOrganization, selectOrganization, logout, permissions, user } = useAuth();
  const { locale, setLocale, t, direction } = useLocalization();
  const [accountEl, setAccountEl] = useState(null);
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);

  const can = (feature) => (feature ? canAccessFeature(permissions, feature) : true);
  const resolveLabel = (item) => {
    const translated = t(item.labelKey);
    return translated && translated !== item.labelKey ? translated : item.fallback;
  };

  const railItems = useMemo(
    () => RAIL_ITEMS.filter((item) => can(item.feature)).map((item) => ({ ...item, label: resolveLabel(item) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [permissions, locale],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const settingsItems = useMemo(() => SETTINGS_ITEMS.filter((item) => can(item.feature)), [permissions]);
  const settingsTarget = settingsItems[0]?.to ?? null;

  const isSelected = (to) => {
    if (to === '/home') return location.pathname === '/home' || location.pathname === '/';
    if (to === '/projects') return location.pathname.startsWith('/projects');
    if (to === '/templates') return location.pathname.startsWith('/templates') || location.pathname.startsWith('/inspections/templates');
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  };
  const settingsSelected = settingsItems.some((item) => isSelected(item.to));

  // Header title/subtitle: match the current rail or settings destination.
  const activeItem = railItems.find((item) => isSelected(item.to));
  const activeSettings = settingsItems.find((item) => isSelected(item.to));
  const pageTitle = activeItem?.label ?? activeSettings?.label ?? (activeOrganization?.name ?? 'eSnag');
  const subtitle = activeOrganization
    ? [activeOrganization.code, activeOrganization.name].filter(Boolean).join(' · ')
    : '';

  const initials = (user?.name ?? 'U')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // Focus the global search on "/" (unless already typing in a field).
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== '/') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submitSearch = (event) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      navigate(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  };

  const railItem = (item) => {
    const Icon = item.icon;
    const selected = isSelected(item.to);
    return (
      <Tooltip key={item.key} title={item.label} placement={direction === 'rtl' ? 'left' : 'right'} arrow>
        <Box
          component={RouterLink}
          to={item.to}
          id={item.id}
          aria-current={selected ? 'page' : undefined}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.5,
            width: 60,
            py: 1,
            borderRadius: '12px',
            textDecoration: 'none',
            color: selected ? BRAND.navy : BRAND.muted,
            background: selected ? 'rgba(36,72,143,0.10)' : 'transparent',
            transition: 'background 160ms ease, color 160ms ease',
            '&:hover': {
              background: selected ? 'rgba(36,72,143,0.10)' : 'rgba(20,38,66,0.05)',
              color: selected ? BRAND.navy : BRAND.ink,
            },
          }}
        >
          <Icon sx={{ fontSize: 20 }} />
          <Box sx={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.01em' }}>{item.label}</Box>
        </Box>
      </Tooltip>
    );
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: direction === 'rtl' ? 'row-reverse' : 'row', height: '100vh', overflow: 'hidden' }}>
      {/* ---- 76px icon rail --------------------------------------------- */}
      <Box
        component="nav"
        sx={{
          width: RAIL_WIDTH,
          flex: 'none',
          height: '100%',
          bgcolor: BRAND.panel,
          borderInlineEnd: `1px solid ${BRAND.border}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0.5,
          py: 2,
          px: 0,
          overflowY: 'auto',
        }}
      >
        <BrandMark />
        {railItems.map(railItem)}

        <Box sx={{ flex: 1 }} />

        {settingsTarget && (
          <Tooltip title={t('nav.settings') || 'Settings'} placement={direction === 'rtl' ? 'left' : 'right'} arrow>
            <Box
              component={RouterLink}
              to={settingsTarget}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.5,
                width: 60,
                py: 1,
                borderRadius: '12px',
                textDecoration: 'none',
                color: settingsSelected ? BRAND.navy : BRAND.muted,
                background: settingsSelected ? 'rgba(36,72,143,0.10)' : 'transparent',
                '&:hover': { background: settingsSelected ? 'rgba(36,72,143,0.10)' : 'rgba(20,38,66,0.05)' },
              }}
            >
              <SettingsRoundedIcon sx={{ fontSize: 20 }} />
              <Box sx={{ fontSize: 9, fontWeight: 600 }}>{t('nav.settings') || 'Settings'}</Box>
            </Box>
          </Tooltip>
        )}

        <Tooltip title={user?.name ?? ''} placement={direction === 'rtl' ? 'left' : 'right'} arrow>
          <Avatar
            onClick={(event) => setAccountEl(event.currentTarget)}
            sx={{
              width: 34,
              height: 34,
              mt: 1,
              bgcolor: BRAND.navy,
              color: '#fff',
              fontFamily: FONT_MONO,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {initials}
          </Avatar>
        </Tooltip>
      </Box>

      {/* ---- Main column: header + scrollable content ------------------- */}
      <Box sx={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box
          component="header"
          sx={{
            height: 64,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            px: { xs: 2, md: 3.25 },
            bgcolor: BRAND.panel,
            borderBottom: `1px solid ${BRAND.border}`,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 16.5, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.1 }} noWrap>
              {pageTitle}
            </Typography>
            {subtitle && (
              <Typography sx={{ fontSize: 12, color: BRAND.muted, mt: '1px' }} noWrap>
                {subtitle}
              </Typography>
            )}
          </Box>

          <Box sx={{ flex: 1 }} />

          <Box
            component="form"
            onSubmit={submitSearch}
            sx={{
              display: { xs: 'none', md: 'flex' },
              alignItems: 'center',
              gap: 1,
              width: 300,
              px: 1.6,
              py: 1,
              borderRadius: '11px',
              bgcolor: '#F1F3F8',
              border: `1px solid ${BRAND.borderHair}`,
              color: BRAND.muted,
              '&:focus-within': { borderColor: 'rgba(47,143,190,0.5)', bgcolor: '#fff' },
            }}
          >
            <SearchRoundedIcon sx={{ fontSize: 18 }} />
            <Box
              component="input"
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search snags, drawings…"
              sx={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                flex: 1,
                minWidth: 0,
                fontFamily: 'inherit',
                fontSize: 13,
                color: BRAND.ink,
                '&::placeholder': { color: BRAND.muted },
              }}
            />
            <Box sx={{ fontFamily: FONT_MONO, fontSize: 11, color: '#B6BFCC' }}>/</Box>
          </Box>

          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => navigate('/projects')} sx={{ height: 40, whiteSpace: 'nowrap' }}>
            New snag
          </Button>

          <NotificationsMenu canView={permissions.includes('notifications.view')} />
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: { xs: 2, md: '26px 28px' } }}>
          <Box className="page-enter" sx={{ height: '100%' }}>
            <Outlet />
          </Box>
        </Box>
      </Box>

      {/* ---- Account menu (org switch · language · settings · logout) --- */}
      <Menu
        open={Boolean(accountEl)}
        anchorEl={accountEl}
        onClose={() => setAccountEl(null)}
        anchorOrigin={{ vertical: 'top', horizontal: direction === 'rtl' ? 'left' : 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: direction === 'rtl' ? 'left' : 'right' }}
        slotProps={{ paper: { sx: { width: 288, p: 0.5, borderRadius: '14px' } } }}
      >
        <Box sx={{ px: 1.5, py: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 14 }} noWrap>
            {user?.name}
          </Typography>
          <Typography sx={{ fontSize: 12, color: BRAND.muted }} noWrap>
            {user?.email}
          </Typography>
        </Box>
        <Divider />

        {organizations.length > 0 && [
          <Typography key="org-label" sx={{ px: 1.5, pt: 1, pb: 0.5, fontSize: 11, fontWeight: 700, color: BRAND.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t('common.organization')}
          </Typography>,
          ...organizations.map((organization) => (
            <MenuItem
              key={`org-${organization.id}`}
              selected={organization.id === activeOrganization?.id}
              onClick={() => {
                selectOrganization(organization.id);
                setAccountEl(null);
                navigate('/home');
              }}
            >
              <ListItemIcon>
                {organization.id === activeOrganization?.id ? <CheckRoundedIcon fontSize="small" /> : <ApartmentRoundedIcon fontSize="small" />}
              </ListItemIcon>
              <Typography variant="body2" noWrap>{organization.name}</Typography>
            </MenuItem>
          )),
          <Divider key="org-divider" />,
        ]}

        <Typography sx={{ px: 1.5, pt: 1, pb: 0.5, fontSize: 11, fontWeight: 700, color: BRAND.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {t('common.language')}
        </Typography>
        {['en', 'ar'].map((code) => (
          <MenuItem
            key={`lang-${code}`}
            selected={locale === code}
            onClick={() => {
              setLocale(code);
              setAccountEl(null);
            }}
          >
            <ListItemIcon>
              {locale === code ? <CheckRoundedIcon fontSize="small" /> : <TranslateRoundedIcon fontSize="small" />}
            </ListItemIcon>
            <Typography variant="body2">{t(`language.${code}`)}</Typography>
          </MenuItem>
        ))}

        {settingsItems.length > 0 && [
          <Divider key="settings-divider" />,
          <Typography key="settings-label" sx={{ px: 1.5, pt: 1, pb: 0.5, fontSize: 11, fontWeight: 700, color: BRAND.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t('nav.settings') || 'Settings'}
          </Typography>,
          ...settingsItems.map((item) => (
            <MenuItem
              key={`set-${item.to}`}
              onClick={() => {
                navigate(item.to);
                setAccountEl(null);
              }}
            >
              <Typography variant="body2">{item.label}</Typography>
            </MenuItem>
          )),
        ]}

        <Divider />
        <MenuItem
          onClick={() => {
            setAccountEl(null);
            void logout();
          }}
        >
          <ListItemIcon>
            <LogoutRoundedIcon fontSize="small" />
          </ListItemIcon>
          <Typography variant="body2">{t('auth.logout')}</Typography>
        </MenuItem>
      </Menu>
    </Box>
  );
};
