import {
  AppBar,
  Avatar,
  Box,
  Button,
  Container,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material'
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded'
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded'
import ConstructionRoundedIcon from '@mui/icons-material/ConstructionRounded'
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded'
import ApartmentRoundedIcon from '@mui/icons-material/ApartmentRounded'
import SettingsSuggestRoundedIcon from '@mui/icons-material/SettingsSuggestRounded'
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded'
import ViewKanbanRoundedIcon from '@mui/icons-material/ViewKanbanRounded'
import TuneRoundedIcon from '@mui/icons-material/TuneRounded'
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded'
import AnalyticsRoundedIcon from '@mui/icons-material/AnalyticsRounded'
import AssignmentTurnedInRoundedIcon from '@mui/icons-material/AssignmentTurnedInRounded'
import RouteRoundedIcon from '@mui/icons-material/RouteRounded'
import MenuRoundedIcon from '@mui/icons-material/MenuRounded'
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useState, type ReactElement } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useLocalization } from '../hooks/useLocalization'
import { NotificationsMenu } from '../components/NotificationsMenu'
import { BrandLogo } from '../components/BrandLogo'
import { canAccessFeature } from '../utils/permissions'

const drawerWidth = 286

type NavFeature = Parameters<typeof canAccessFeature>[1]
interface NavItem {
  feature: NavFeature
  to: string
  label: string
  icon: ReactElement
  id?: string
}

interface NavSection {
  title: string
  items: NavItem[]
}

export const AppLayout = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { organizations, activeOrganization, selectOrganization, logout, permissions, user } = useAuth()
  const { locale, setLocale, t, direction } = useLocalization()
  const [mobileOpen, setMobileOpen] = useState(false)
  const can = (feature: Parameters<typeof canAccessFeature>[1]) => canAccessFeature(permissions, feature)

  const navSections: NavSection[] = [
    {
      title: 'Core Workspace',
      items: [
        { feature: 'projects' as const, to: '/projects', label: t('nav.projects'), icon: <ApartmentRoundedIcon fontSize="small" />, id: 'projects-nav' },
        { feature: 'board' as const, to: '/board', label: t('nav.board'), icon: <ViewKanbanRoundedIcon fontSize="small" /> },
        { feature: 'dashboard' as const, to: '/dashboard', label: t('nav.dashboard'), icon: <AnalyticsRoundedIcon fontSize="small" /> },
        { feature: 'exports' as const, to: '/exports', label: t('nav.exports'), icon: <DescriptionRoundedIcon fontSize="small" /> },
      ],
    },
    {
      title: 'Quality & Delivery',
      items: [
        { feature: 'templates' as const, to: '/templates', label: t('nav.templates'), icon: <AssignmentRoundedIcon fontSize="small" /> },
        { feature: 'inspectionsSubmissions' as const, to: '/inspections/submissions', label: t('nav.inspections'), icon: <AssignmentTurnedInRoundedIcon fontSize="small" /> },
        { feature: 'inspectionsRequests' as const, to: '/inspections/requests', label: t('nav.requests'), icon: <RouteRoundedIcon fontSize="small" /> },
        { feature: 'inspectionsReports' as const, to: '/inspections/reports', label: t('nav.reports'), icon: <DashboardRoundedIcon fontSize="small" /> },
        { feature: 'equipment' as const, to: '/equipment', label: t('nav.equipment'), icon: <ConstructionRoundedIcon fontSize="small" /> },
      ],
    },
    {
      title: 'Controls',
      items: [
        { feature: 'accessControl' as const, to: '/access-control', label: t('nav.access'), icon: <ShieldRoundedIcon fontSize="small" /> },
        { feature: 'automation' as const, to: '/automation', label: t('nav.automation'), icon: <SettingsSuggestRoundedIcon fontSize="small" /> },
        { feature: 'ops' as const, to: '/ops', label: t('nav.ops'), icon: <TuneRoundedIcon fontSize="small" /> },
        { feature: 'notificationPreferences' as const, to: '/preferences/notifications', label: t('nav.alerts'), icon: <NotificationsActiveRoundedIcon fontSize="small" /> },
      ],
    },
  ]
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => can(item.feature)),
    }))
    .filter((section) => section.items.length > 0)

  const isSelected = (to: string) => {
    if (to === '/projects') {
      return location.pathname.startsWith('/projects')
    }
    if (to === '/templates') {
      return location.pathname.startsWith('/templates') || location.pathname.startsWith('/inspections/templates')
    }

    return location.pathname === to || location.pathname.startsWith(`${to}/`)
  }

  const currentNav = navSections.flatMap((section) => section.items).find((item) => isSelected(item.to))
  const pageTitle = currentNav?.label ?? t('app.title')

  const drawerContent = (
    <Box sx={{ px: 2, py: 2 }}>
      <Box
        sx={{
          p: 1.5,
          borderRadius: 3,
          mb: 2,
          border: '1px solid rgba(23, 47, 92, 0.14)',
          background: 'linear-gradient(180deg, #FFFFFF 0%, #F4F8FF 100%)',
          boxShadow: '0 10px 20px rgba(23, 47, 92, 0.14)',
        }}
      >
        <BrandLogo sx={{ maxWidth: 212 }} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Quality lifecycle workspace
        </Typography>
      </Box>

      <FormControl fullWidth size="small" sx={{ mb: 2 }}>
        <InputLabel id="org-select-label">{t('common.organization')}</InputLabel>
        <Select
          labelId="org-select-label"
          value={activeOrganization?.id ?? ''}
          label={t('common.organization')}
          onChange={(event) => {
            const organizationId = Number(event.target.value)
            selectOrganization(organizationId)
            navigate('/projects')
            setMobileOpen(false)
          }}
        >
          {organizations.map((organization) => (
            <MenuItem key={organization.id} value={organization.id}>
              {organization.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Stack spacing={1.5}>
        {navSections.map((section) => (
          <Box key={section.title}>
            <Typography
              variant="caption"
              sx={{
                px: 1,
                pb: 0.5,
                color: 'text.secondary',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 800,
              }}
            >
              {section.title}
            </Typography>
            <List dense sx={{ pt: 0.2 }}>
              {section.items.map((item) => (
                <ListItemButton
                  key={item.to}
                  component={RouterLink}
                  to={item.to}
                  selected={isSelected(item.to)}
                  id={item.id}
                  onClick={() => setMobileOpen(false)}
                  sx={{
                    borderRadius: 2,
                    mb: 0.6,
                    '&.Mui-selected': {
                      bgcolor: 'var(--surface-selected)',
                      color: 'primary.main',
                      '& .MuiListItemIcon-root': {
                        color: 'primary.main',
                      },
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 34, color: 'text.secondary' }}>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 700 }} />
                </ListItemButton>
              ))}
            </List>
          </Box>
        ))}
      </Stack>
    </Box>
  )

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex' }}>
      <Drawer
        variant="permanent"
        open
        anchor={direction === 'rtl' ? 'right' : 'left'}
        sx={{
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
        }}
      >
        {drawerContent}
      </Drawer>

      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        anchor={direction === 'rtl' ? 'right' : 'left'}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            border: 0,
          },
        }}
      >
        {drawerContent}
      </Drawer>

      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            width: { md: `calc(100% - ${drawerWidth}px)` },
            ml: { md: direction === 'rtl' ? 0 : `${drawerWidth}px` },
            mr: { md: direction === 'rtl' ? `${drawerWidth}px` : 0 },
          }}
        >
          <Toolbar sx={{ px: { xs: 1.5, sm: 2.5 }, py: 1, gap: 1.2 }}>
            <IconButton
              onClick={() => setMobileOpen(true)}
              sx={{ display: { xs: 'inline-flex', md: 'none' } }}
              aria-label="open navigation"
            >
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
              <Select
                labelId="locale-select-label"
                value={locale}
                label={t('common.language')}
                onChange={(event) => {
                  const nextLocale = String(event.target.value)
                  if (nextLocale === 'en' || nextLocale === 'ar') {
                    setLocale(nextLocale)
                  }
                }}
              >
                <MenuItem value="en">{t('language.en')}</MenuItem>
                <MenuItem value="ar">{t('language.ar')}</MenuItem>
              </Select>
            </FormControl>

            <NotificationsMenu canView={permissions.includes('notifications.view')} />

            <Tooltip title={user?.email ?? ''}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ display: { xs: 'none', sm: 'flex' } }}>
                <Avatar
                  sx={{
                    width: 32,
                    height: 32,
                    bgcolor: 'primary.main',
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
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

        <Box
          sx={{
            ml: { md: direction === 'rtl' ? 0 : `${drawerWidth}px` },
            mr: { md: direction === 'rtl' ? `${drawerWidth}px` : 0 },
          }}
        >
          <Container maxWidth={false} sx={{ px: { xs: 1.5, sm: 2.5 }, py: 2.5 }}>
            <Box className="page-enter">
              <Outlet />
            </Box>
          </Container>
        </Box>
      </Box>
    </Box>
  )
}
