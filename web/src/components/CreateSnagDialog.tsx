import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import type {
  Drawing,
  DrawingRevision,
  Location,
  RootCauseCategoryRecord,
  SnagPriority,
  StakeholderCompany,
  StakeholderTeam,
  UserSummary,
} from '../types'

interface CreateSnagPayload {
  title: string
  description: string
  priority: SnagPriority
  location_id?: number
  assigned_to?: number
  assigned_company_id?: number
  assigned_team_id?: number
  root_cause_category_id?: number
  estimated_cost?: number
  estimated_hours?: number
  pin_x: number
  pin_y: number
}

interface CreateSnagDialogProps {
  open: boolean
  drawing: Drawing
  revision: DrawingRevision | null
  locationOptions: Location[]
  rootCauseCategories: RootCauseCategoryRecord[]
  members: UserSummary[]
  companies: StakeholderCompany[]
  teams: StakeholderTeam[]
  canAssign: boolean
  pin: { x: number; y: number } | null
  suggestedLocation?: {
    location_id: number
    reason: string
    score: number
  } | null
  onClose: () => void
  onCreate: (payload: CreateSnagPayload) => Promise<void>
}

export const CreateSnagDialog = ({
  open,
  drawing,
  revision,
  locationOptions,
  rootCauseCategories,
  members,
  companies,
  teams,
  canAssign,
  pin,
  suggestedLocation,
  onClose,
  onCreate,
}: CreateSnagDialogProps) => {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<SnagPriority>('medium')
  const [locationId, setLocationId] = useState<string>('')
  const [assigneeId, setAssigneeId] = useState<string>('')
  const [companyId, setCompanyId] = useState<string>('')
  const [teamId, setTeamId] = useState<string>('')
  const [rootCauseCategoryId, setRootCauseCategoryId] = useState<string>('')
  const [estimatedCost, setEstimatedCost] = useState<string>('')
  const [estimatedHours, setEstimatedHours] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    setTitle('')
    setDescription('')
    setPriority('medium')
    setLocationId(suggestedLocation?.location_id ? String(suggestedLocation.location_id) : '')
    setAssigneeId('')
    setCompanyId('')
    setTeamId('')
    setRootCauseCategoryId('')
    setEstimatedCost('')
    setEstimatedHours('')
  }, [open, suggestedLocation])

  const pinLabel = useMemo(() => {
    if (!pin) {
      return 'N/A'
    }

    return `${Math.round(pin.x * 100)}%, ${Math.round(pin.y * 100)}%`
  }, [pin])

  const availableTeams = useMemo(() => {
    if (!companyId) {
      return teams
    }

    return teams.filter((team) => !team.company_id || team.company_id === Number(companyId))
  }, [teams, companyId])

  const submit = async () => {
    if (!pin) {
      return
    }

    setSubmitting(true)

    try {
      await onCreate({
        title,
        description,
        priority,
        location_id: locationId ? Number(locationId) : undefined,
        assigned_to: canAssign && assigneeId ? Number(assigneeId) : undefined,
        assigned_company_id: canAssign && companyId ? Number(companyId) : undefined,
        assigned_team_id: canAssign && teamId ? Number(teamId) : undefined,
        root_cause_category_id: rootCauseCategoryId ? Number(rootCauseCategoryId) : undefined,
        estimated_cost: estimatedCost ? Number(estimatedCost) : undefined,
        estimated_hours: estimatedHours ? Number(estimatedHours) : undefined,
        pin_x: pin.x,
        pin_y: pin.y,
      })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Create Snag</DialogTitle>
      <DialogContent>
        <Stack spacing={2} mt={1}>
          <Typography variant="body2" color="text.secondary">
            Drawing: {drawing.code} / {drawing.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Revision: {revision?.revision_label ?? 'Current'} | Pin: {pinLabel}
          </Typography>
          {suggestedLocation && (
            <Typography variant="body2" color="info.main">
              Suggested location applied ({suggestedLocation.reason}, score {suggestedLocation.score.toFixed(2)}).
            </Typography>
          )}

          <TextField label="Title" value={title} onChange={(event) => setTitle(event.target.value)} required />

          <TextField
            label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            multiline
            minRows={3}
          />

          <FormControl>
            <InputLabel id="priority-label">Priority</InputLabel>
            <Select
              labelId="priority-label"
              value={priority}
              label="Priority"
              onChange={(event) => setPriority(event.target.value as SnagPriority)}
            >
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="high">High</MenuItem>
              <MenuItem value="critical">Critical</MenuItem>
            </Select>
          </FormControl>

          <FormControl>
            <InputLabel id="location-label">Location (optional)</InputLabel>
            <Select
              labelId="location-label"
              value={locationId}
              label="Location (optional)"
              onChange={(event) => setLocationId(String(event.target.value))}
            >
              <MenuItem value="">No specific location</MenuItem>
              {locationOptions.map((location) => (
                <MenuItem key={location.id} value={location.id}>
                  {location.code} - {location.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl>
            <InputLabel id="root-cause-label">Root Cause (optional)</InputLabel>
            <Select
              labelId="root-cause-label"
              value={rootCauseCategoryId}
              label="Root Cause (optional)"
              onChange={(event) => setRootCauseCategoryId(String(event.target.value))}
            >
              <MenuItem value="">Unclassified</MenuItem>
              {rootCauseCategories.map((category) => (
                <MenuItem key={category.id} value={category.id}>
                  {category.code ? `${category.code} - ` : ''}
                  {category.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Estimated Cost (optional)"
            type="number"
            value={estimatedCost}
            onChange={(event) => setEstimatedCost(event.target.value)}
            inputProps={{ min: 0, step: '0.01' }}
          />

          <TextField
            label="Estimated Hours (optional)"
            type="number"
            value={estimatedHours}
            onChange={(event) => setEstimatedHours(event.target.value)}
            inputProps={{ min: 0, step: '0.01' }}
          />

          {canAssign && (
            <>
              <FormControl>
                <InputLabel id="company-label">Company (optional)</InputLabel>
                <Select
                  labelId="company-label"
                  value={companyId}
                  label="Company (optional)"
                  onChange={(event) => {
                    const value = String(event.target.value)
                    setCompanyId(value)
                    if (teamId) {
                      const selectedTeam = teams.find((team) => team.id === Number(teamId))
                      if (selectedTeam?.company_id && selectedTeam.company_id !== Number(value || 0)) {
                        setTeamId('')
                      }
                    }
                  }}
                >
                  <MenuItem value="">No company</MenuItem>
                  {companies.map((company) => (
                    <MenuItem key={company.id} value={company.id}>
                      {company.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <InputLabel id="team-label">Team (optional)</InputLabel>
                <Select
                  labelId="team-label"
                  value={teamId}
                  label="Team (optional)"
                  onChange={(event) => setTeamId(String(event.target.value))}
                >
                  <MenuItem value="">No team</MenuItem>
                  {availableTeams.map((team) => (
                    <MenuItem key={team.id} value={team.id}>
                      {team.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <InputLabel id="assignee-label">Assignee (optional)</InputLabel>
                <Select
                  labelId="assignee-label"
                  value={assigneeId}
                  label="Assignee (optional)"
                  onChange={(event) => setAssigneeId(String(event.target.value))}
                >
                  <MenuItem value="">Unassigned</MenuItem>
                  {members.map((member) => (
                    <MenuItem key={member.id} value={member.id}>
                      {member.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={() => void submit()} variant="contained" disabled={!title.trim() || !pin || submitting} id="create-snag-btn">
          {submitting ? 'Creating...' : 'Create Snag'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

