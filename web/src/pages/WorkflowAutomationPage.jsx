import { Alert, Button, FormControl, Grid, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography, } from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { PageHero } from '../components/ui/PageHero';
import { StatCard } from '../components/ui/StatCard';
import { useAuth } from '../hooks/useAuth';
import { useFeatureTour } from '../hooks/useFeatureTour';
import { parseApiError } from '../utils/apiError';
const priorities = ['low', 'medium', 'high', 'critical'];
export const WorkflowAutomationPage = () => {
    const { permissions } = useAuth();
    const canView = permissions.includes('automation.view') || permissions.includes('automation.manage');
    const canManage = permissions.includes('automation.manage');
    const canManageRecurring = permissions.includes('inspections.recurring.manage') || permissions.includes('inspections.templates.manage');
    const [projectId, setProjectId] = useState('');
    const [projects, setProjects] = useState([]);
    const [teams, setTeams] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [rules, setRules] = useState([]);
    const [reminderPolicies, setReminderPolicies] = useState([]);
    const [recurringSchedules, setRecurringSchedules] = useState([]);
    const [ruleName, setRuleName] = useState('');
    const [ruleTrigger, setRuleTrigger] = useState('snag_created');
    const [ruleTrade, setRuleTrade] = useState('Electrical');
    const [rulePriority, setRulePriority] = useState('high');
    const [ruleTeamId, setRuleTeamId] = useState('');
    const [ruleDueHours, setRuleDueHours] = useState('48');
    const [ruleEscalateRoles, setRuleEscalateRoles] = useState('consultant,owner');
    const [policyName, setPolicyName] = useState('');
    const [policyStatuses, setPolicyStatuses] = useState('assigned,in_progress');
    const [policyEveryHours, setPolicyEveryHours] = useState('12');
    const [policyMax, setPolicyMax] = useState('6');
    const [scheduleName, setScheduleName] = useState('');
    const [scheduleTemplateId, setScheduleTemplateId] = useState('');
    const [scheduleRecurrence, setScheduleRecurrence] = useState('weekly');
    const [scheduleInterval, setScheduleInterval] = useState('1');
    const [scheduleStartsAt, setScheduleStartsAt] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const metrics = useMemo(() => ({
        rules: rules.length,
        reminderPolicies: reminderPolicies.length,
        recurring: recurringSchedules.length,
        activeTemplates: templates.filter((template) => template.is_active).length,
    }), [recurringSchedules.length, reminderPolicies.length, rules.length, templates]);
    const selectedProjectId = projectId ? Number(projectId) : null;
    useFeatureTour({
        tourKey: 'automation',
        enabled: canView && (rules.length > 0 || reminderPolicies.length > 0 || recurringSchedules.length > 0),
        steps: [
            {
                id: 'automation-filter',
                title: 'Project Scope',
                text: 'Scope rules, reminders, and recurring schedules per project or keep them org-wide.',
                attachTo: { element: '#automation-project-filter', on: 'bottom' },
            },
            {
                id: 'automation-rules',
                title: 'Rules',
                text: 'Create event-driven assignment and escalation rules.',
                attachTo: { element: '#automation-rules', on: 'top' },
            },
            {
                id: 'automation-reminders',
                title: 'Reminders',
                text: 'Configure nudges for assignees until action is taken.',
                attachTo: { element: '#automation-reminders', on: 'top' },
            },
            {
                id: 'automation-recurring',
                title: 'Recurring',
                text: 'Automatically generate recurring inspection submissions.',
                attachTo: { element: '#automation-recurring', on: 'top' },
            },
        ],
    });
    const loadData = useCallback(async () => {
        if (!canView && !canManageRecurring) {
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const [projectsResponse, teamsResponse, templatesResponse] = await Promise.all([
                api.get('/api/projects', { params: { per_page: 200 } }),
                api.get('/api/stakeholders/teams', {
                    params: { project_id: selectedProjectId || undefined },
                }),
                api.get('/api/inspections/templates', {
                    params: { project_id: selectedProjectId || undefined, is_active: true },
                }),
            ]);
            setProjects(projectsResponse.data.data);
            setTeams(teamsResponse.data.data);
            setTemplates(templatesResponse.data.data);
            if (canView) {
                const [rulesResponse, policiesResponse] = await Promise.all([
                    api.get('/api/automation/rules', {
                        params: { project_id: selectedProjectId || undefined },
                    }),
                    api.get('/api/automation/reminder-policies', {
                        params: { project_id: selectedProjectId || undefined },
                    }),
                ]);
                setRules(rulesResponse.data.data);
                setReminderPolicies(policiesResponse.data.data);
            }
            else {
                setRules([]);
                setReminderPolicies([]);
            }
            const schedulesResponse = await api.get('/api/inspections/recurring-schedules', {
                params: { project_id: selectedProjectId || undefined },
            });
            setRecurringSchedules(schedulesResponse.data.data);
        }
        catch (requestError) {
            setError(parseApiError(requestError, 'Unable to load workflow automation data.'));
        }
        finally {
            setLoading(false);
        }
    }, [canManageRecurring, canView, selectedProjectId]);
    useEffect(() => {
        void loadData();
    }, [loadData]);
    const createRule = async () => {
        if (!canManage || !ruleName.trim()) {
            return;
        }
        const actions = {};
        if (ruleTeamId) {
            actions.assign_team_id = Number(ruleTeamId);
        }
        if (Number(ruleDueHours) > 0) {
            actions.due_in_hours = Number(ruleDueHours);
        }
        if (ruleEscalateRoles.trim()) {
            actions.escalate_to_roles = ruleEscalateRoles.split(',').map((entry) => entry.trim()).filter(Boolean);
        }
        try {
            await api.post('/api/automation/rules', {
                project_id: selectedProjectId || null,
                name: ruleName,
                trigger_event: ruleTrigger,
                conditions: {
                    trade: ruleTrade ? [ruleTrade] : undefined,
                    priority: [rulePriority],
                    status_changed_to: ruleTrigger === 'snag_status_changed' ? ['rejected'] : undefined,
                },
                actions,
                run_once_per_snag: ruleTrigger === 'snag_status_changed',
            });
            setRuleName('');
            await loadData();
        }
        catch (requestError) {
            setError(parseApiError(requestError, 'Unable to create automation rule.'));
        }
    };
    const createPolicy = async () => {
        if (!canManage || !policyName.trim()) {
            return;
        }
        try {
            await api.post('/api/automation/reminder-policies', {
                project_id: selectedProjectId || null,
                name: policyName,
                statuses: policyStatuses.split(',').map((entry) => entry.trim()).filter(Boolean),
                reminder_every_hours: Number(policyEveryHours),
                max_reminders: Number(policyMax),
            });
            setPolicyName('');
            await loadData();
        }
        catch (requestError) {
            setError(parseApiError(requestError, 'Unable to create reminder policy.'));
        }
    };
    const createSchedule = async () => {
        if (!canManageRecurring || !scheduleName.trim() || !scheduleTemplateId || !scheduleStartsAt) {
            return;
        }
        try {
            await api.post('/api/inspections/recurring-schedules', {
                project_id: selectedProjectId || null,
                inspection_template_id: Number(scheduleTemplateId),
                name: scheduleName,
                recurrence: scheduleRecurrence,
                interval_value: Number(scheduleInterval),
                starts_at: scheduleStartsAt,
            });
            setScheduleName('');
            await loadData();
        }
        catch (requestError) {
            setError(parseApiError(requestError, 'Unable to create recurring schedule.'));
        }
    };
    const deleteRule = async (id) => {
        try {
            await api.delete(`/api/automation/rules/${id}`);
            await loadData();
        }
        catch (requestError) {
            setError(parseApiError(requestError, 'Unable to delete automation rule.'));
        }
    };
    const deleteReminderPolicy = async (id) => {
        try {
            await api.delete(`/api/automation/reminder-policies/${id}`);
            await loadData();
        }
        catch (requestError) {
            setError(parseApiError(requestError, 'Unable to delete reminder policy.'));
        }
    };
    const deleteRecurringSchedule = async (id) => {
        try {
            await api.delete(`/api/inspections/recurring-schedules/${id}`);
            await loadData();
        }
        catch (requestError) {
            setError(parseApiError(requestError, 'Unable to delete recurring schedule.'));
        }
    };
    if (!canView && !canManageRecurring) {
        return <Alert severity="warning">You do not have permission to access workflow automation.</Alert>;
    }
    return (<Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}

      <PageHero title="Workflow Automation" description="Build smart assignment rules, reminder nudges, and recurring inspection schedules." actions={<FormControl size="small" sx={{ minWidth: 260, bgcolor: 'rgba(255,255,255,0.14)', borderRadius: 1.5 }} id="automation-project-filter">
            <InputLabel id="automation-project" sx={{ color: 'rgba(255,255,255,0.92)' }}>
              Project
            </InputLabel>
            <Select labelId="automation-project" label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value ? Number(event.target.value) : '')} sx={{
                color: '#FFFFFF',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.42)' },
                '& .MuiSvgIcon-root': { color: '#FFFFFF' },
            }}>
              <MenuItem value="">All projects</MenuItem>
              {projects.map((project) => (<MenuItem key={project.id} value={project.id}>
                  {project.code} - {project.name}
                </MenuItem>))}
            </Select>
          </FormControl>}/>

      <Grid container spacing={1.2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard label="Rules" value={metrics.rules} tone="primary"/>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard label="Reminder Policies" value={metrics.reminderPolicies} tone="secondary"/>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard label="Recurring Schedules" value={metrics.recurring} tone="success"/>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard label="Active Templates" value={metrics.activeTemplates} tone="neutral"/>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper sx={{ p: 2 }} id="automation-rules">
            <Typography variant="h6" gutterBottom>
              Automation Rules
            </Typography>
            {canManage && (<Stack spacing={1.2} mb={2}>
                <TextField size="small" label="Name" value={ruleName} onChange={(event) => setRuleName(event.target.value)}/>
                <FormControl size="small">
                  <InputLabel id="rule-trigger">Trigger</InputLabel>
                  <Select labelId="rule-trigger" label="Trigger" value={ruleTrigger} onChange={(event) => setRuleTrigger(event.target.value)}>
                    <MenuItem value="snag_created">snag_created</MenuItem>
                    <MenuItem value="snag_updated">snag_updated</MenuItem>
                    <MenuItem value="snag_status_changed">snag_status_changed</MenuItem>
                  </Select>
                </FormControl>
                <TextField size="small" label="Trade" value={ruleTrade} onChange={(event) => setRuleTrade(event.target.value)}/>
                <FormControl size="small">
                  <InputLabel id="rule-priority">Priority</InputLabel>
                  <Select labelId="rule-priority" label="Priority" value={rulePriority} onChange={(event) => setRulePriority(String(event.target.value))}>
                    {priorities.map((priority) => (<MenuItem key={priority} value={priority}>
                        {priority}
                      </MenuItem>))}
                  </Select>
                </FormControl>
                <FormControl size="small">
                  <InputLabel id="rule-team">Assign Team</InputLabel>
                  <Select labelId="rule-team" label="Assign Team" value={ruleTeamId} onChange={(event) => setRuleTeamId(String(event.target.value))}>
                    <MenuItem value="">None</MenuItem>
                    {teams.map((team) => (<MenuItem key={team.id} value={team.id}>
                        {team.name}
                      </MenuItem>))}
                  </Select>
                </FormControl>
                <TextField size="small" label="Due in hours" value={ruleDueHours} onChange={(event) => setRuleDueHours(event.target.value)}/>
                <TextField size="small" label="Escalate roles csv" value={ruleEscalateRoles} onChange={(event) => setRuleEscalateRoles(event.target.value)}/>
                <Button variant="contained" onClick={() => void createRule()}>
                  Add Rule
                </Button>
              </Stack>)}

            <Stack spacing={1}>
              {rules.map((rule) => (<Paper key={rule.id} variant="outlined" sx={{ p: 1.2 }}>
                  <Typography fontWeight={700}>{rule.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {rule.trigger_event} | runs {rule.trigger_count} | {rule.is_active ? 'active' : 'inactive'}
                  </Typography>
                  {canManage && (<Stack direction="row" spacing={1} mt={1}>
                      <Button size="small" color="error" onClick={() => void deleteRule(rule.id)}>
                        Delete
                      </Button>
                    </Stack>)}
                </Paper>))}
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper sx={{ p: 2 }} id="automation-reminders">
            <Typography variant="h6" gutterBottom>
              Reminder Policies
            </Typography>
            {canManage && (<Stack spacing={1.2} mb={2}>
                <TextField size="small" label="Name" value={policyName} onChange={(event) => setPolicyName(event.target.value)}/>
                <TextField size="small" label="Statuses csv" value={policyStatuses} onChange={(event) => setPolicyStatuses(event.target.value)}/>
                <TextField size="small" label="Every hours" value={policyEveryHours} onChange={(event) => setPolicyEveryHours(event.target.value)}/>
                <TextField size="small" label="Max reminders" value={policyMax} onChange={(event) => setPolicyMax(event.target.value)}/>
                <Button variant="contained" onClick={() => void createPolicy()}>
                  Add Policy
                </Button>
              </Stack>)}

            <Stack spacing={1}>
              {reminderPolicies.map((policy) => (<Paper key={policy.id} variant="outlined" sx={{ p: 1.2 }}>
                  <Typography fontWeight={700}>{policy.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {(policy.statuses ?? []).join(', ')} | every {policy.reminder_every_hours}h | max {policy.max_reminders}
                  </Typography>
                  {canManage && (<Stack direction="row" spacing={1} mt={1}>
                      <Button size="small" color="error" onClick={() => void deleteReminderPolicy(policy.id)}>
                        Delete
                      </Button>
                    </Stack>)}
                </Paper>))}
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper sx={{ p: 2 }} id="automation-recurring">
            <Typography variant="h6" gutterBottom>
              Recurring Inspections
            </Typography>
            {canManageRecurring && (<Stack spacing={1.2} mb={2}>
                <TextField size="small" label="Name" value={scheduleName} onChange={(event) => setScheduleName(event.target.value)}/>
                <FormControl size="small">
                  <InputLabel id="schedule-template">Template</InputLabel>
                  <Select labelId="schedule-template" label="Template" value={scheduleTemplateId} onChange={(event) => setScheduleTemplateId(String(event.target.value))}>
                    <MenuItem value="">Select template</MenuItem>
                    {templates.map((template) => (<MenuItem key={template.id} value={template.id}>
                        {template.name}
                      </MenuItem>))}
                  </Select>
                </FormControl>
                <FormControl size="small">
                  <InputLabel id="schedule-recurrence">Recurrence</InputLabel>
                  <Select labelId="schedule-recurrence" label="Recurrence" value={scheduleRecurrence} onChange={(event) => setScheduleRecurrence(event.target.value)}>
                    <MenuItem value="daily">daily</MenuItem>
                    <MenuItem value="weekly">weekly</MenuItem>
                    <MenuItem value="biweekly">biweekly</MenuItem>
                    <MenuItem value="monthly">monthly</MenuItem>
                  </Select>
                </FormControl>
                <TextField size="small" label="Interval" value={scheduleInterval} onChange={(event) => setScheduleInterval(event.target.value)}/>
                <TextField size="small" type="datetime-local" label="Starts At" slotProps={{ inputLabel: { shrink: true } }} value={scheduleStartsAt} onChange={(event) => setScheduleStartsAt(event.target.value)}/>
                <Button variant="contained" onClick={() => void createSchedule()}>
                  Add Schedule
                </Button>
              </Stack>)}

            <Stack spacing={1}>
              {recurringSchedules.map((schedule) => (<Paper key={schedule.id} variant="outlined" sx={{ p: 1.2 }}>
                  <Typography fontWeight={700}>{schedule.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {schedule.recurrence}/{schedule.interval_value} | next {new Date(schedule.next_run_at).toLocaleString()}
                  </Typography>
                  {canManageRecurring && (<Stack direction="row" spacing={1} mt={1}>
                      <Button size="small" color="error" onClick={() => void deleteRecurringSchedule(schedule.id)}>
                        Delete
                      </Button>
                    </Stack>)}
                </Paper>))}
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {loading && <Typography color="text.secondary">Loading automation data...</Typography>}
    </Stack>);
};
