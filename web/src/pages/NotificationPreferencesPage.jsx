import { Alert, Box, Button, Card, CardContent, FormControl, FormControlLabel, Grid, InputLabel, MenuItem, Select, Stack, Switch, TextField, Typography, } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { PageHero } from '../components/ui/PageHero';
import { StatCard } from '../components/ui/StatCard';
import { parseApiError } from '../utils/apiError';
export const NotificationPreferencesPage = () => {
    const [preference, setPreference] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const loadPreference = async () => {
        try {
            setLoading(true);
            const response = await api.get('/api/preferences/notifications');
            setPreference(response.data.data);
            setError(null);
        }
        catch (requestError) {
            setError(parseApiError(requestError, 'Unable to load notification preferences.'));
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        void loadPreference();
    }, []);
    const updatePreference = async (payload) => {
        if (!preference) {
            return;
        }
        setSaving(true);
        setSuccess(null);
        try {
            const response = await api.put('/api/preferences/notifications', payload);
            setPreference(response.data.data);
            setError(null);
            setSuccess('Notification preferences updated.');
        }
        catch (requestError) {
            setError(parseApiError(requestError, 'Unable to save notification preferences.'));
        }
        finally {
            setSaving(false);
        }
    };
    const metrics = useMemo(() => ({
        immediate: Number(preference?.immediate_assignment ?? false) +
            Number(preference?.immediate_status_change ?? false) +
            Number(preference?.immediate_comment ?? false) +
            Number(preference?.immediate_mention ?? false) +
            Number(preference?.immediate_escalation ?? false),
        approvals: Number(preference?.approval_needed ?? false) +
            Number(preference?.signature_requested ?? false),
        channels: Number(preference?.in_app_enabled ?? false) +
            Number(preference?.email_enabled ?? false) +
            Number(preference?.push_enabled ?? false),
        digest: preference?.digest_frequency ?? 'off',
    }), [preference]);
    if (!preference && loading) {
        return <Typography>Loading notification preferences...</Typography>;
    }
    return (<Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <PageHero title="Notification Preferences" description="Control immediate alerts, digest cadence, and quiet hours by role and communication channel."/>

      <Grid container spacing={1.2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard label="Immediate Rules" value={metrics.immediate} tone="primary"/>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard label="Approval Alerts" value={metrics.approvals} tone="secondary"/>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard label="Channels Enabled" value={metrics.channels} tone="success"/>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard label="Digest Frequency" value={String(metrics.digest).toUpperCase()} tone="neutral"/>
        </Grid>
      </Grid>

      {preference && (<Card>
          <CardContent>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 4 }}>
                <FormControl fullWidth>
                  <InputLabel id="digest-frequency-label">Digest Frequency</InputLabel>
                  <Select labelId="digest-frequency-label" value={preference.digest_frequency} label="Digest Frequency" onChange={(event) => setPreference((current) => current
                ? { ...current, digest_frequency: event.target.value }
                : current)}>
                    <MenuItem value="off">Off</MenuItem>
                    <MenuItem value="daily">Daily</MenuItem>
                    <MenuItem value="weekly">Weekly</MenuItem>
                    <MenuItem value="monthly">Monthly</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid size={{ xs: 12, md: 4 }}>
                <TextField fullWidth label="Timezone" value={preference.timezone} onChange={(event) => setPreference((current) => (current ? { ...current, timezone: event.target.value } : current))}/>
              </Grid>

              <Grid size={{ xs: 12, md: 2 }}>
                <TextField fullWidth label="Quiet Start" placeholder="22:00" value={preference.quiet_hours_start ?? ''} onChange={(event) => setPreference((current) => current ? { ...current, quiet_hours_start: event.target.value || null } : current)}/>
              </Grid>

              <Grid size={{ xs: 12, md: 2 }}>
                <TextField fullWidth label="Quiet End" placeholder="06:00" value={preference.quiet_hours_end ?? ''} onChange={(event) => setPreference((current) => current ? { ...current, quiet_hours_end: event.target.value || null } : current)}/>
              </Grid>
            </Grid>

            <Grid container spacing={2} mt={0.5}>
              <Grid size={{ xs: 12, md: 4 }}>
                <FormControlLabel control={<Switch checked={preference.in_app_enabled} onChange={(event) => setPreference((current) => current ? { ...current, in_app_enabled: event.target.checked } : current)}/>} label="In-app notifications"/>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <FormControlLabel control={<Switch checked={preference.email_enabled} onChange={(event) => setPreference((current) => current ? { ...current, email_enabled: event.target.checked } : current)}/>} label="Email notifications"/>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <FormControlLabel control={<Switch checked={preference.push_enabled} onChange={(event) => setPreference((current) => (current ? { ...current, push_enabled: event.target.checked } : current))}/>} label="Push notifications"/>
              </Grid>
            </Grid>

            <Grid container spacing={2} mt={0.2}>
              <Grid size={{ xs: 12, md: 4 }}>
                <FormControlLabel control={<Switch checked={preference.immediate_assignment} onChange={(event) => setPreference((current) => current ? { ...current, immediate_assignment: event.target.checked } : current)}/>} label="Immediate: assignment"/>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <FormControlLabel control={<Switch checked={preference.immediate_status_change} onChange={(event) => setPreference((current) => current ? { ...current, immediate_status_change: event.target.checked } : current)}/>} label="Immediate: status change"/>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <FormControlLabel control={<Switch checked={preference.immediate_comment} onChange={(event) => setPreference((current) => current ? { ...current, immediate_comment: event.target.checked } : current)}/>} label="Immediate: comments"/>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <FormControlLabel control={<Switch checked={preference.immediate_mention} onChange={(event) => setPreference((current) => current ? { ...current, immediate_mention: event.target.checked } : current)}/>} label="Immediate: mentions"/>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <FormControlLabel control={<Switch checked={preference.immediate_escalation} onChange={(event) => setPreference((current) => current ? { ...current, immediate_escalation: event.target.checked } : current)}/>} label="Immediate: escalation"/>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <FormControlLabel control={<Switch checked={preference.approval_needed} onChange={(event) => setPreference((current) => (current ? { ...current, approval_needed: event.target.checked } : current))}/>} label="Approvals needed"/>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <FormControlLabel control={<Switch checked={preference.signature_requested} onChange={(event) => setPreference((current) => current ? { ...current, signature_requested: event.target.checked } : current)}/>} label="Signature requested"/>
              </Grid>
            </Grid>

            <Box mt={2} display="flex" gap={1.2}>
              <Button variant="contained" disabled={saving} onClick={() => void updatePreference({
                digest_frequency: preference.digest_frequency,
                timezone: preference.timezone,
                quiet_hours_start: preference.quiet_hours_start,
                quiet_hours_end: preference.quiet_hours_end,
                email_enabled: preference.email_enabled,
                in_app_enabled: preference.in_app_enabled,
                push_enabled: preference.push_enabled,
                immediate_assignment: preference.immediate_assignment,
                immediate_status_change: preference.immediate_status_change,
                immediate_comment: preference.immediate_comment,
                immediate_mention: preference.immediate_mention,
                immediate_escalation: preference.immediate_escalation,
                approval_needed: preference.approval_needed,
                signature_requested: preference.signature_requested,
            })}>
                Save Preferences
              </Button>
              <Button variant="outlined" disabled={saving} onClick={() => void loadPreference()}>
                Reload
              </Button>
            </Box>
          </CardContent>
        </Card>)}
    </Stack>);
};
