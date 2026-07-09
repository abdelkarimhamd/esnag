import type { RootTabParamList, SnagsStackParamList } from './types'

export type AppRole =
  | 'owner'
  | 'consultant'
  | 'contractor'
  | 'project_manager'
  | 'engineer'
  | 'inspector'
  | 'viewer'
  | 'unknown'

type RoleSet = AppRole[]

interface MenuBaseItem {
  id: string
  label: string
  subtitle?: string
  icon: string
  roles: RoleSet
  badgeKey?: keyof BadgesMap
}

export interface MenuRouteItem extends MenuBaseItem {
  type: 'route'
  tab: keyof RootTabParamList
  stackScreen?: keyof SnagsStackParamList
}

export interface MenuActionItem extends MenuBaseItem {
  type: 'action'
  action: 'logout'
}

export type MenuItem = MenuRouteItem | MenuActionItem

export interface MenuSection {
  id: string
  title: string
  items: MenuItem[]
}

export type NormalizedMenuItem = MenuItem & {
  badge: number
}

export interface NormalizedMenuSection extends Omit<MenuSection, 'items'> {
  items: NormalizedMenuItem[]
}

export interface NavigationBadgeState {
  queueSize: number
  pendingConflicts: number
  notificationAlerts: number
}

export interface BadgesMap {
  queue: number
  conflicts: number
  notifications: number
}

const allRoles: RoleSet = [
  'owner',
  'consultant',
  'contractor',
  'project_manager',
  'engineer',
  'inspector',
  'viewer',
  'unknown',
]

const fullMenu: MenuSection[] = [
  {
    id: 'work',
    title: 'Work',
    items: [
      { id: 'home', type: 'route', label: 'My work', subtitle: "Today's assigned snags", icon: 'home-outline', tab: 'Home', roles: allRoles },
      { id: 'snags', type: 'route', label: 'Snags', subtitle: 'Main snag list', icon: 'construct-outline', tab: 'Snags', roles: allRoles, badgeKey: 'queue' },
      { id: 'create-snag', type: 'route', label: 'Create Snag', subtitle: 'Queue new snag', icon: 'add-circle-outline', tab: 'Snags', stackScreen: 'SnagCreate', roles: allRoles },
      { id: 'floor-map', type: 'route', label: 'Floor Map', subtitle: 'Open by floor/zone', icon: 'map-outline', tab: 'Snags', stackScreen: 'FloorMap', roles: allRoles },
      {
        id: 'equipment',
        type: 'route',
        label: 'Equipment',
        subtitle: 'Assets and maintenance',
        icon: 'build-outline',
        tab: 'Equipment',
        roles: ['owner', 'consultant', 'contractor', 'project_manager', 'engineer', 'inspector', 'unknown'],
      },
    ],
  },
  {
    id: 'collaboration',
    title: 'Collaboration',
    items: [
      {
        id: 'conflicts',
        type: 'route',
        label: 'Sync Conflicts',
        subtitle: 'Resolve offline conflicts',
        icon: 'git-compare-outline',
        tab: 'Conflicts',
        roles: ['owner', 'consultant', 'contractor', 'project_manager', 'engineer', 'inspector', 'unknown'],
        badgeKey: 'conflicts',
      },
      {
        id: 'notifications',
        type: 'route',
        label: 'Notifications',
        subtitle: 'Alerts and references',
        icon: 'notifications-outline',
        tab: 'Notifications',
        roles: allRoles,
        badgeKey: 'notifications',
      },
      {
        id: 'inspection-link',
        type: 'route',
        label: 'Inspection Link',
        subtitle: 'Deep-link destination',
        icon: 'clipboard-outline',
        tab: 'Snags',
        stackScreen: 'InspectionDetail',
        roles: allRoles,
      },
      {
        id: 'handovers',
        type: 'route',
        label: 'Handovers',
        subtitle: 'Multi-party handover routing',
        icon: 'git-network-outline',
        tab: 'Snags',
        stackScreen: 'HandoverRequestsList',
        roles: allRoles,
      },
      {
        id: 'master-data',
        type: 'route',
        label: 'Master Data',
        subtitle: 'Areas, buildings & categories',
        icon: 'grid-outline',
        tab: 'Snags',
        stackScreen: 'MasterDataAdmin',
        roles: ['owner', 'project_manager'],
      },
      {
        id: 'role-matrix',
        type: 'route',
        label: 'Roles & Permissions',
        subtitle: 'Role permission matrix',
        icon: 'shield-checkmark-outline',
        tab: 'Snags',
        stackScreen: 'RoleMatrix',
        roles: ['owner', 'project_manager'],
      },
    ],
  },
  {
    id: 'account',
    title: 'Account',
    items: [
      {
        id: 'profile',
        type: 'route',
        label: 'Profile',
        subtitle: 'Organization, role & project',
        icon: 'person-circle-outline',
        tab: 'Snags',
        stackScreen: 'Profile',
        roles: allRoles,
      },
      { id: 'settings', type: 'route', label: 'Settings', subtitle: 'Preferences and devices', icon: 'settings-outline', tab: 'Settings', roles: allRoles },
      { id: 'logout', type: 'action', label: 'Logout', subtitle: 'End current session', icon: 'log-out-outline', action: 'logout', roles: allRoles },
    ],
  },
]

export const resolvePrimaryRole = (roles: string[]): AppRole => {
  const normalized = roles.map((role) => role.trim().toLowerCase())
  const priority: AppRole[] = [
    'owner',
    'project_manager',
    'consultant',
    'contractor',
    'engineer',
    'inspector',
    'viewer',
  ]

  return priority.find((role) => normalized.includes(role)) ?? 'unknown'
}

// Match strictly on the resolved role. Each item's `roles` set already lists every
// role that should see it (allRoles for always-available items, an explicit subset for
// restricted ones), so there must be no implicit wildcard here — otherwise 'unknown',
// which appears in every set, would make every item visible to every role (e.g. a
// viewer would see Equipment / Sync Conflicts contrary to getPrimaryTabsByRole).
const isAllowedForRole = (itemRoles: RoleSet, role: AppRole) => itemRoles.includes(role)

export const getPrimaryTabsByRole = (role: AppRole): Array<keyof RootTabParamList> => {
  if (role === 'viewer') {
    return ['Snags', 'Notifications', 'Settings']
  }

  if (role === 'inspector') {
    return ['Snags', 'Conflicts', 'Notifications', 'Settings']
  }

  return ['Snags', 'Equipment', 'Conflicts', 'Notifications']
}

export const getFullMenuByRole = (role: AppRole): MenuSection[] =>
  fullMenu
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => isAllowedForRole(item.roles, role)),
    }))
    .filter((section) => section.items.length > 0)

export const getBadgesMap = (state: NavigationBadgeState): BadgesMap => ({
  queue: Math.max(0, state.queueSize || 0),
  conflicts: Math.max(0, state.pendingConflicts || 0),
  notifications: Math.max(0, state.notificationAlerts || 0),
})

export const normalizeMenuTree = (sections: MenuSection[], badges: BadgesMap): NormalizedMenuSection[] =>
  sections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      badge: item.badgeKey ? badges[item.badgeKey] : 0,
    })),
  }))
