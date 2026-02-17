export type SnagStatus =
  | 'new'
  | 'assigned'
  | 'in_progress'
  | 'ready_for_review'
  | 'closed'
  | 'rejected'

export type SnagPriority = 'low' | 'medium' | 'high' | 'critical'

export interface OrganizationSummary {
  id: number
  name: string
  code: string
  roles: string[]
  permissions?: string[]
  project_permissions?: string[]
}

export interface UserSummary {
  id: number
  name: string
  email: string
  mfa_enabled?: boolean
  roles?: string[]
  org_roles?: string[]
  project_roles?: string[]
  permissions?: string[]
  companies?: Array<{ id: number; name: string }>
  teams?: Array<{ id: number; name: string }>
}

export interface AuthPayload {
  user: UserSummary
  organizations: OrganizationSummary[]
}

export interface ProjectSummary {
  id: number
  organization_id: number
  name: string
  code: string
  description?: string | null
  status: string
  is_training?: boolean
  training_locked?: boolean
  training_notes?: string | null
  start_date?: string | null
  end_date?: string | null
  drawings_count?: number
  snags_count?: number
}

export interface Building {
  id: number
  name: string
  code?: string | null
  project_id: number
}

export interface Floor {
  id: number
  name: string
  code?: string | null
  level?: number | null
  building_id: number
}

export interface Location {
  id: number
  name: string
  code?: string | null
  barcode?: string | null
  floor_id: number
}

export interface RootCauseCategoryRecord {
  id: number
  organization_id: number
  name: string
  code?: string | null
  description?: string | null
  is_active: boolean
}

export interface DrawingRevision {
  id: number
  drawing_id: number
  revision_label: string
  file_name: string
  file_path: string
  mime_type: string
  file_size: number
  is_current: boolean
  notes?: string | null
}

export interface DrawingLocationZone {
  id: number
  drawing_id: number
  drawing_revision_id?: number | null
  location_id: number
  zone_label?: string | null
  x_min: number
  y_min: number
  x_max: number
  y_max: number
  priority: number
  location?: Location
}

export interface Drawing {
  id: number
  project_id: number
  organization_id: number
  building_id?: number | null
  floor_id?: number | null
  title: string
  code: string
  description?: string | null
  current_revision_id?: number | null
  current_revision?: DrawingRevision | null
  currentRevision?: DrawingRevision | null
  revisions?: DrawingRevision[]
  locationZones?: DrawingLocationZone[]
  snags?: Snag[]
}

export interface DrawingComparisonRevision {
  id: number
  revision_label: string
  file_name: string
  mime_type: string
  is_current: boolean
  snag_count: number
  file_url: string
}

export interface DrawingComparisonResponse {
  drawing_id: number
  left_revision: DrawingComparisonRevision
  right_revision: DrawingComparisonRevision
  can_highlight: boolean
  mapping?: {
    id: number
    direction: 'forward' | 'reverse'
    transform_type: 'identity' | 'offset_scale' | 'affine'
    confidence_score?: number | null
    notes?: string | null
  } | null
}

export interface DrawingPinMigrationItem {
  snag_id: number
  reference: string
  status: SnagStatus
  location_id?: number | null
  from: {
    revision_id: number
    pin_x: number
    pin_y: number
  }
  to: {
    revision_id: number
    pin_x: number
    pin_y: number
    was_clamped: boolean
  }
}

export interface DrawingPinMigrationResponse {
  dry_run: boolean
  applied: boolean
  total_candidates: number
  processed_count: number
  truncated: boolean
  source_revision: DrawingComparisonRevision
  target_revision: DrawingComparisonRevision
  mapping: {
    id: number
    direction: 'forward' | 'reverse'
    transform_type: 'identity' | 'offset_scale' | 'affine'
    confidence_score?: number | null
  }
  migrated: DrawingPinMigrationItem[]
}

export interface LocationSuggestion {
  location_id: number
  location_name: string
  location_code?: string | null
  barcode?: string | null
  inside_zone: boolean
  distance?: number | null
  score: number
  source: 'zone_inside' | 'zone_nearest' | 'floor_fallback'
  zone?: {
    id: number
    label?: string | null
    x_min: number
    y_min: number
    x_max: number
    y_max: number
    priority: number
  } | null
}

export interface LocationSuggestionResponse {
  pin: {
    x: number
    y: number
  }
  suggested_location_id?: number | null
  suggestions: LocationSuggestion[]
}

export interface ResolvedLocationContext {
  barcode: string
  location: {
    id: number
    name: string
    code?: string | null
    barcode?: string | null
    floor_id: number
  }
  floor: {
    id: number
    name: string
    code?: string | null
    level?: number | null
  }
  building: {
    id: number
    name: string
    code?: string | null
  }
  project: Pick<ProjectSummary, 'id' | 'name' | 'code'>
  drawing?: Pick<Drawing, 'id' | 'title' | 'code' | 'current_revision_id'> | null
  snags: {
    total: number
    open: number
  }
  deep_link: string
  filters: {
    location_id: number
    project_id: number
    drawing_id?: number | null
  }
}

export interface SnagAttachment {
  id: number
  snag_id: number
  type: 'photo' | 'video' | 'markup'
  file_name?: string | null
  file_path?: string | null
  mime_type?: string | null
  file_size?: number | null
  markup_data?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  created_at: string
}

export interface SnagComment {
  id: number
  snag_id: number
  parent_id?: number | null
  user_id: number
  body: string
  is_internal: boolean
  created_at: string
  user?: UserSummary
  replies?: SnagComment[]
  mentions?: SnagCommentMention[]
  attachments?: SnagCommentAttachment[]
}

export interface SnagCommentMention {
  id: number
  organization_id: number
  snag_comment_id: number
  mentioned_user_id?: number | null
  mentioned_team_id?: number | null
  token?: string | null
  meta?: Record<string, unknown> | null
  mentionedUser?: UserSummary
  mentioned_user?: UserSummary
  mentionedTeam?: Pick<StakeholderTeam, 'id' | 'name' | 'code'> | null
  mentioned_team?: Pick<StakeholderTeam, 'id' | 'name' | 'code'> | null
}

export interface SnagCommentAttachment {
  id: number
  organization_id: number
  snag_comment_id: number
  uploaded_by?: number | null
  type: string
  file_name: string
  file_path: string
  mime_type: string
  file_size: number
  metadata?: Record<string, unknown> | null
  created_at: string
}

export interface SnagWatcher {
  id: number
  organization_id: number
  snag_id: number
  user_id: number
  source: string
  created_by?: number | null
  created_at: string
  user?: UserSummary
  creator?: UserSummary
}

export interface SnagEscalationRecord {
  id: number
  organization_id: number
  snag_id: number
  snag_escalation_rule_id: number
  escalated_to_user_id: number
  escalated_at: string
  status_at_escalation?: string | null
  reason?: string | null
  meta?: Record<string, unknown> | null
  recipient?: UserSummary
  rule?: {
    id: number
    name: string
    overdue_days: number
    cooldown_hours: number
  }
}

export interface SnagHistory {
  id: number
  snag_id: number
  from_status?: SnagStatus | null
  to_status: SnagStatus
  note?: string | null
  created_at: string
  changed_by: number
  changedBy?: UserSummary
}

export interface Snag {
  id: number
  organization_id: number
  project_id: number
  drawing_id: number
  drawing_revision_id?: number | null
  building_id?: number | null
  floor_id?: number | null
  location_id?: number | null
  root_cause_category_id?: number | null
  equipment_id?: number | null
  reference: string
  title: string
  description?: string | null
  priority: SnagPriority
  trade?: string | null
  status: SnagStatus
  pin_x: number
  pin_y: number
  due_date?: string | null
  estimated_cost?: number | null
  estimated_hours?: number | null
  acknowledged_at?: string | null
  started_at?: string | null
  ready_for_review_at?: string | null
  created_at: string
  created_by: number
  assigned_to?: number | null
  assigned_company_id?: number | null
  assigned_team_id?: number | null
  dispatched_to?: number | null
  dispatch_note?: string | null
  dispatched_at?: string | null
  creator?: UserSummary
  assignee?: UserSummary
  assignedCompany?: StakeholderCompany | null
  assigned_company?: StakeholderCompany | null
  assignedTeam?: StakeholderTeam | null
  assigned_team?: StakeholderTeam | null
  dispatchRecipient?: UserSummary | null
  dispatch_recipient?: UserSummary | null
  rootCauseCategory?: RootCauseCategoryRecord | null
  root_cause_category?: RootCauseCategoryRecord | null
  attachments?: SnagAttachment[]
  comments?: SnagComment[]
  watcherUsers?: UserSummary[]
  watcher_users?: UserSummary[]
  watchers?: SnagWatcher[]
  escalations?: SnagEscalationRecord[]
  status_history?: SnagHistory[]
  statusHistory?: SnagHistory[]
  closeoutInstance?: CloseoutInstance | null
  closeout_instance?: CloseoutInstance | null
  equipment?: EquipmentRecord | null
}

export interface CloseoutTemplateItem {
  id: number
  closeout_template_id: number
  title: string
  description?: string | null
  required: boolean
  evidence_required: boolean
  sort_order: number
}

export interface CloseoutTemplate {
  id: number
  organization_id: number
  project_id?: number | null
  project?: Pick<ProjectSummary, 'id' | 'name' | 'code'> | null
  name: string
  trade?: string | null
  discipline?: string | null
  description?: string | null
  is_default: boolean
  is_active: boolean
  is_library?: boolean
  library_key?: string | null
  items: CloseoutTemplateItem[]
}

export interface CloseoutEvidence {
  id: number
  closeout_instance_item_id: number
  file_name: string
  file_path: string
  mime_type: string
  file_size: number
  metadata?: Record<string, unknown> | null
  uploader?: UserSummary
  uploaded_by?: number | null
}

export interface CloseoutInstanceItem {
  id: number
  closeout_instance_id: number
  closeout_template_item_id?: number | null
  title: string
  description?: string | null
  required: boolean
  evidence_required: boolean
  is_completed: boolean
  completed_at?: string | null
  completed_by?: number | null
  notes?: string | null
  is_satisfied?: boolean
  evidences: CloseoutEvidence[]
}

export interface CloseoutInstance {
  id: number
  organization_id: number
  project_id: number
  snag_id: number
  closeout_template_id?: number | null
  status: 'not_started' | 'in_progress' | 'completed' | 'reviewed'
  completion_percentage: number
  completed_at?: string | null
  reviewed_at?: string | null
  reviewed_by?: number | null
  template?: CloseoutTemplate | null
  items: CloseoutInstanceItem[]
}

export type InspectionSubmissionStatus = 'draft' | 'submitted' | 'in_review' | 'approved' | 'rejected'
export type InspectionRequestType = 'mir' | 'wir' | 'ir'
export type InspectionRequestStatus = 'requested' | 'scheduled' | 'in_progress' | 'completed' | 'rejected' | 'cancelled'

export interface InspectionTemplateField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'date' | 'checkbox'
  required?: boolean
  options?: string[]
}

export interface InspectionTemplateSection {
  title: string
  fields: InspectionTemplateField[]
}

export interface InspectionWorkflowStep {
  step_order: number
  step_name?: string | null
  role_name: string
  requires_signature?: boolean
}

export interface InspectionTemplateRecord {
  id: number
  organization_id: number
  project_id?: number | null
  name: string
  code?: string | null
  type: string
  discipline?: string | null
  description?: string | null
  schema: {
    sections: InspectionTemplateSection[]
  }
  approval_workflow?: InspectionWorkflowStep[] | null
  is_active: boolean
  is_library?: boolean
  library_key?: string | null
  version: number
  creator?: UserSummary
  project?: ProjectSummary
  created_at: string
  updated_at: string
}

export interface InspectionApproval {
  id: number
  organization_id: number
  inspection_submission_id: number
  step_order: number
  step_name?: string | null
  role_name: string
  requires_signature: boolean
  status: 'pending' | 'approved' | 'rejected'
  approver_id?: number | null
  decision_notes?: string | null
  acted_at?: string | null
  approver?: UserSummary
}

export interface InspectionSignature {
  id: number
  organization_id: number
  inspection_submission_id: number
  inspection_approval_id?: number | null
  signed_by: number
  context: string
  file_name: string
  file_path: string
  mime_type: string
  file_size: number
  signed_at: string
  signer?: UserSummary
}

export interface InspectionRequestRecord {
  id: number
  organization_id: number
  project_id?: number | null
  inspection_submission_id?: number | null
  reference: string
  request_type: InspectionRequestType
  title: string
  description?: string | null
  status: InspectionRequestStatus
  requested_by: number
  assigned_to?: number | null
  scheduled_for?: string | null
  completed_at?: string | null
  metadata?: Record<string, unknown> | null
  requester?: UserSummary
  assignee?: UserSummary
  submission?: Pick<InspectionSubmission, 'id' | 'reference' | 'status'>
  project?: ProjectSummary
  created_at: string
  updated_at: string
}

export interface InspectionSubmission {
  id: number
  organization_id: number
  project_id?: number | null
  inspection_template_id: number
  reference: string
  status: InspectionSubmissionStatus
  form_data?: Record<string, unknown> | null
  current_approval_order?: number | null
  created_by: number
  submitted_by?: number | null
  submitted_at?: string | null
  approved_at?: string | null
  rejected_at?: string | null
  last_updated_by?: number | null
  template?: InspectionTemplateRecord
  project?: ProjectSummary
  creator?: UserSummary
  submitter?: UserSummary
  approvals?: InspectionApproval[]
  approvalMessages?: InspectionApprovalMessage[]
  approval_messages?: InspectionApprovalMessage[]
  signatures?: InspectionSignature[]
  requests?: InspectionRequestRecord[]
  created_at: string
  updated_at: string
}

export interface InspectionApprovalMessage {
  id: number
  organization_id: number
  inspection_submission_id: number
  inspection_approval_id?: number | null
  user_id?: number | null
  message_type: string
  body: string
  payload?: Record<string, unknown> | null
  created_at: string
  user?: UserSummary
  approval?: Pick<InspectionApproval, 'id' | 'step_order' | 'step_name' | 'role_name' | 'status'>
}

export interface InspectionReportResponse {
  summary: {
    total_submissions: number
    approved_submissions: number
    in_review_submissions: number
    rejected_submissions: number
    open_requests: number
  }
  status_breakdown: Record<string, number>
  type_breakdown: Record<string, number>
  request_status_breakdown: Record<string, number>
  submissions: Paginated<InspectionSubmission>
}

export interface ExportJob {
  id: number
  organization_id: number
  requested_by: number
  project_id?: number | null
  type: 'pdf' | 'csv' | 'xlsx'
  status: 'queued' | 'processing' | 'completed' | 'failed'
  filters?: Record<string, unknown> | null
  file_name?: string | null
  file_path?: string | null
  mime_type?: string | null
  error_message?: string | null
  completed_at?: string | null
  created_at: string
  download_url?: string | null
  requester?: UserSummary
  project?: ProjectSummary
}

export type EquipmentStatus = 'ok' | 'warn' | 'critical' | 'inactive'

export interface EquipmentRecord {
  id: number
  organization_id: number
  project_id?: number | null
  location_id?: number | null
  code: string
  name: string
  category?: string | null
  barcode?: string | null
  serial_number?: string | null
  manufacturer?: string | null
  model?: string | null
  status: EquipmentStatus
  installed_at?: string | null
  last_maintenance_at?: string | null
  notes?: string | null
  project?: Pick<ProjectSummary, 'id' | 'name' | 'code'>
  location?: Pick<Location, 'id' | 'name' | 'code' | 'barcode'>
  maintenance_logs?: EquipmentMaintenanceLog[]
  maintenanceLogs?: EquipmentMaintenanceLog[]
  created_at: string
  updated_at: string
}

export interface EquipmentMaintenanceLog {
  id: number
  organization_id: number
  equipment_id: number
  project_id?: number | null
  snag_id?: number | null
  performed_by?: number | null
  status: 'ok' | 'warn' | 'critical'
  description?: string | null
  action_taken?: string | null
  occurred_at: string
  next_due_at?: string | null
  metadata?: Record<string, unknown> | null
  performer?: UserSummary
  snag?: Pick<Snag, 'id' | 'reference' | 'title' | 'status'>
  created_at: string
  updated_at: string
}

export interface NotificationPreferenceRecord {
  id: number
  organization_id: number
  user_id: number
  digest_frequency: 'off' | 'daily' | 'weekly' | 'monthly'
  email_enabled: boolean
  in_app_enabled: boolean
  push_enabled: boolean
  immediate_assignment: boolean
  immediate_status_change: boolean
  immediate_comment: boolean
  immediate_mention: boolean
  immediate_escalation: boolean
  approval_needed: boolean
  signature_requested: boolean
  quiet_hours_start?: string | null
  quiet_hours_end?: string | null
  timezone: string
  last_daily_sent_at?: string | null
  last_weekly_sent_at?: string | null
  last_monthly_sent_at?: string | null
  created_at: string
  updated_at: string
}

export interface DashboardKpisResponse {
  summary: {
    total_snags: number
    open_snags: number
    overdue_snags: number
    avg_closure_days?: number | null
  }
  status_breakdown: Record<string, number>
  by_trade: Array<{ trade: string; total: number }>
  by_assignee: Array<{ assignee_id?: number | null; assignee_name: string; total: number; open: number }>
  sla?: {
    thresholds: {
      ack_hours: number
      fix_hours: number
      close_hours: number
    }
    averages: {
      ack_hours?: number | null
      fix_hours?: number | null
      close_hours?: number | null
    }
    compliance: {
      ack_measured: number
      fix_measured: number
      close_measured: number
      ack_within_sla: number
      fix_within_sla: number
      close_within_sla: number
      ack_rate?: number | null
      fix_rate?: number | null
      close_rate?: number | null
    }
  }
  root_cause_pareto?: Array<{
    category: string
    count: number
    percentage: number
    cumulative_percentage: number
  }>
  cost_impact?: {
    summary: {
      estimated_cost_total: number
      estimated_hours_total: number
      estimated_cost_open: number
      estimated_hours_open: number
    }
    by_trade: Array<{
      trade: string
      estimated_cost: number
      estimated_hours: number
      count: number
    }>
    by_stakeholder: Array<{
      stakeholder: string
      estimated_cost: number
      estimated_hours: number
      count: number
    }>
  }
  forecast?: {
    overall: {
      history: Array<{ date: string; open: number }>
      projected: Array<{ date: string; open: number }>
      trend_slope: number
      current_open: number
      projected_open_end: number
    }
    by_trade: Array<{ trade: string; current_open: number; projected_open_end: number; trend_slope: number }>
    by_stakeholder: Array<{ stakeholder: string; current_open: number; projected_open_end: number; trend_slope: number }>
  }
}

export interface DashboardChartsResponse {
  trend_14_days: Array<{ date: string; created: number; closed: number }>
  priority_breakdown: Array<{ priority: string; total: number }>
}

export interface StakeholderCompany {
  id: number
  organization_id: number
  name: string
  code?: string | null
  type: string
  is_active: boolean
  active_members_count?: number
  active_teams_count?: number
}

export interface StakeholderTeam {
  id: number
  organization_id: number
  project_id?: number | null
  company_id?: number | null
  name: string
  code?: string | null
  is_active: boolean
  company?: Pick<StakeholderCompany, 'id' | 'name' | 'code' | 'type'>
  project?: Pick<ProjectSummary, 'id' | 'name' | 'code'>
  active_members_count?: number
}

export interface DelegationRuleRecord {
  id: number
  organization_id: number
  project_id?: number | null
  delegator_user_id: number
  delegate_user_id: number
  scope: 'all' | 'assignments' | 'approvals'
  starts_at: string
  ends_at: string
  is_active: boolean
  reason?: string | null
  created_by?: number | null
  delegator?: UserSummary
  delegate?: UserSummary
  creator?: UserSummary
  project?: Pick<ProjectSummary, 'id' | 'name' | 'code'>
}

export type WorkflowAutomationTrigger = 'snag_created' | 'snag_updated' | 'snag_status_changed'

export interface WorkflowAutomationRuleRecord {
  id: number
  organization_id: number
  project_id?: number | null
  name: string
  description?: string | null
  trigger_event: WorkflowAutomationTrigger
  conditions?: Record<string, unknown> | null
  actions: Record<string, unknown>
  priority: number
  run_once_per_snag: boolean
  is_active: boolean
  last_triggered_at?: string | null
  trigger_count: number
  logs_count?: number
  project?: Pick<ProjectSummary, 'id' | 'name' | 'code'>
  creator?: UserSummary
  updater?: UserSummary
  created_at: string
  updated_at: string
}

export interface SnagReminderPolicyRecord {
  id: number
  organization_id: number
  project_id?: number | null
  name: string
  statuses?: SnagStatus[] | null
  reminder_every_hours: number
  max_reminders: number
  is_active: boolean
  logs_count?: number
  project?: Pick<ProjectSummary, 'id' | 'name' | 'code'>
  creator?: UserSummary
  updater?: UserSummary
  created_at: string
  updated_at: string
}

export interface InspectionRecurringRunRecord {
  id: number
  organization_id: number
  inspection_recurring_schedule_id: number
  inspection_submission_id?: number | null
  run_at: string
  status: 'generated' | 'skipped' | 'failed'
  message?: string | null
  payload?: Record<string, unknown> | null
}

export interface InspectionRecurringScheduleRecord {
  id: number
  organization_id: number
  project_id?: number | null
  inspection_template_id: number
  name: string
  recurrence: 'daily' | 'weekly' | 'biweekly' | 'monthly'
  interval_value: number
  starts_at: string
  ends_at?: string | null
  next_run_at: string
  run_time: string
  timezone: string
  default_form_data?: Record<string, unknown> | null
  assign_to_user_id?: number | null
  is_active: boolean
  runs_count?: number
  project?: Pick<ProjectSummary, 'id' | 'name' | 'code'>
  template?: Pick<InspectionTemplateRecord, 'id' | 'name' | 'type' | 'project_id'>
  assignee?: UserSummary | null
  creator?: UserSummary
  updater?: UserSummary
  created_at: string
  updated_at: string
}

export interface PermissionPresetRecord {
  id: number
  preset_key: string
  name: string
  description?: string | null
  is_system: boolean
  permissions: string[]
  permissions_count: number
}

export interface PermissionDiffResponse {
  preset: {
    id: number
    preset_key: string
    name: string
  }
  project?: Pick<ProjectSummary, 'id' | 'name' | 'code'> | null
  target: {
    type: 'current_user' | 'user' | 'role'
    label: string
  }
  preset_permissions: string[]
  current_permissions: string[]
  matching_permissions: string[]
  missing_permissions: string[]
  extra_permissions: string[]
  stats: {
    preset_count: number
    current_count: number
    matching_count: number
    missing_count: number
    extra_count: number
  }
}

export interface ProjectRoleMember {
  id: number
  name: string
  email: string
  org_roles: string[]
  project_roles: string[]
  effective_roles: string[]
  effective_permissions: string[]
}

export interface RbacProjectRolesResponse {
  project: Pick<ProjectSummary, 'id' | 'name' | 'code'>
  members: ProjectRoleMember[]
}

export interface RbacContextResponse {
  organization_id: number
  project?: Pick<ProjectSummary, 'id' | 'name' | 'code'> | null
  roles: string[]
  permissions: string[]
  has_project_override: boolean
  delegations: DelegationRuleRecord[]
}

export interface OnboardingProgress {
  id?: number
  tour_key: string
  current_step: number
  completed_at?: string | null
  skipped_at?: string | null
  meta?: Record<string, unknown> | null
}

export interface OpsFeatureFlagRow {
  feature_key: string
  label: string
  description: string
  default_enabled: boolean
  resolved_enabled: boolean
  organization_override?: {
    id: number
    is_enabled: boolean
    updated_at?: string | null
    updated_by?: number | null
  } | null
  project_override?: {
    id: number
    is_enabled: boolean
    updated_at?: string | null
    updated_by?: number | null
  } | null
}

export interface OpsFeatureFlagsResponse {
  organization_id: number
  project_id?: number | null
  flags: OpsFeatureFlagRow[]
}

export interface OrganizationUsageLimitsRecord {
  id: number
  organization_id: number
  storage_quota_mb: number
  max_exports_per_day: number
  max_users: number
  meta?: Record<string, unknown> | null
  updated_by?: number | null
  created_at?: string
  updated_at?: string
}

export interface OrganizationUsageSnapshot {
  active_users: number
  pending_invites: number
  exports_today: number
  storage_used_bytes: number
  storage_used_mb: number
}

export interface OpsHealthStorageFailure {
  source: string
  message?: string | null
  severity: string
  occurred_at?: string | null
  context?: Record<string, unknown> | null
}

export interface OpsHealthDashboardResponse {
  window_hours: number
  sync: {
    total_operations: number
    error_operations: number
    error_rate_percent: number
    by_status: Record<string, number>
  }
  queue_depth: {
    framework_jobs: number
    framework_failed_jobs_last_24h: number
    exports_pending: number
    exports_failed_last_24h: number
  }
  storage_failures: {
    ops_events_last_24h: number
    mobile_upload_failed_last_24h: number
    recent: OpsHealthStorageFailure[]
  }
}

export interface OrganizationInviteRecord {
  id: number
  organization_id: number
  email: string
  token: string
  status: string
  invited_by?: number | null
  invited_at?: string | null
  last_sent_at?: string | null
  send_count: number
  expires_at?: string | null
  accepted_at?: string | null
  meta?: Record<string, unknown> | null
  inviter?: Pick<UserSummary, 'id' | 'name' | 'email'>
  created_at: string
  updated_at: string
}

export interface OrganizationSecuritySettingsRecord {
  id: number
  organization_id: number
  mfa_required_web: boolean
  mfa_required_mobile: boolean
  mobile_device_trust_days: number
  enforce_ip_allowlist: boolean
  ip_allowlist?: string[] | null
  antivirus_mode: 'off' | 'log_only' | 'enforce'
  pii_redaction_mode: 'off' | 'warn' | 'require'
  meta?: Record<string, unknown> | null
  updated_by?: number | null
  created_at?: string
  updated_at?: string
}

export interface DashboardConfigRecord {
  id: number
  organization_id: number
  user_id: number
  name: string
  is_default: boolean
  cards: string[]
  filters?: Record<string, unknown> | null
  layout?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface Paginated<T> {
  data: T[]
  current_page: number
  last_page: number
  per_page: number
  total: number
}

