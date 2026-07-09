import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  MenuItem,
  Pagination,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { api } from '../api/client';
import { parseApiError } from '../utils/apiError';
import { BRAND } from '../theme';
import { Mono } from '../components/ui/Mono';
import { PageHero } from '../components/ui/PageHero';

// ---------------------------------------------------------------------------
// F3 — the unified, read-only, cross-entity audit trail (item 9 / BR-FR-009/010,
// §11.3). Consumes GET /api/audit/events (append-only stream) with actor / role /
// category / date facets. There is deliberately no write action here.
// ---------------------------------------------------------------------------

// Category → action prefix sent to the API. Mirrors the recorder's action names
// (snag.*, area.*, rbac.*, …) so the auditor can narrow by subject kind.
const CATEGORIES = [
  { value: '', label: 'All activity' },
  { value: 'snag.', label: 'Snags' },
  { value: 'rbac.', label: 'Roles & access' },
  { value: 'area.', label: 'Areas' },
  { value: 'building.', label: 'Buildings' },
  { value: 'floor.', label: 'Floors' },
  { value: 'location.', label: 'Locations' },
  { value: 'snagcategory.', label: 'Categories' },
  { value: 'handoverworkflow.', label: 'Workflow config' },
];

const shortSubject = (event) => {
  if (!event.subject_type) return '—';
  const name = String(event.subject_type).split('\\').pop();
  return `${name}#${event.subject_id ?? '?'}`;
};

const formatTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

export function AuditTrailPage() {
  const [filters, setFilters] = useState({ action_prefix: '', actor_role: '', date_from: '', date_to: '' });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ data: [], last_page: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { per_page: 25, page };
      if (filters.action_prefix) params.action_prefix = filters.action_prefix;
      if (filters.actor_role) params.actor_role = filters.actor_role;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;

      const response = await api.get('/api/audit/events', { params });
      setResult(response.data ?? { data: [], last_page: 1, total: 0 });
    } catch (requestError) {
      setError(parseApiError(requestError, 'Unable to load the audit trail.'));
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (key) => (event) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: event.target.value }));
  };

  const rows = useMemo(() => result.data ?? [], [result]);

  return (
    <Stack spacing={2.5}>
      <PageHero
        title="Audit trail"
        description="A read-only, tamper-proof record of every governed change — snags, inspections, master data and role changes — across the whole platform. Filter by who, what and when."
      />

      <Paper variant="outlined" sx={{ p: 2, borderColor: BRAND.border, borderRadius: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <TextField
            select
            label="Activity"
            size="small"
            value={filters.action_prefix}
            onChange={setFilter('action_prefix')}
            sx={{ minWidth: 200 }}
          >
            {CATEGORIES.map((category) => (
              <MenuItem key={category.value || 'all'} value={category.value}>
                {category.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Actor role"
            size="small"
            placeholder="e.g. owner"
            value={filters.actor_role}
            onChange={setFilter('actor_role')}
            sx={{ minWidth: 160 }}
          />
          <TextField
            label="From"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={filters.date_from}
            onChange={setFilter('date_from')}
          />
          <TextField
            label="To"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={filters.date_to}
            onChange={setFilter('date_to')}
          />
        </Stack>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined" sx={{ borderColor: BRAND.border, borderRadius: 3, overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 620 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                {['Time', 'Action', 'Actor', 'Party', 'Subject', 'Reason'].map((head) => (
                  <TableCell key={head} sx={{ fontWeight: 700, fontSize: 12, color: BRAND.muted, background: BRAND.panel }}>
                    {head}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: 'center', color: BRAND.muted, py: 4 }}>
                    {loading ? 'Loading…' : 'No audit activity matches these filters.'}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((event) => (
                <TableRow key={event.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap', fontSize: 12.5, color: BRAND.inkSoft }}>
                    {formatTime(event.created_at)}
                  </TableCell>
                  <TableCell>
                    <Mono sx={{ fontSize: 12 }}>{event.action}</Mono>
                  </TableCell>
                  <TableCell sx={{ fontSize: 13 }}>
                    {event.actor?.name ?? 'System'}
                    {event.actor_role && (
                      <Chip
                        label={event.actor_role}
                        size="small"
                        sx={{ ml: 0.75, height: 18, fontSize: 10.5, bgcolor: 'rgba(36,72,143,0.10)', color: BRAND.navy }}
                      />
                    )}
                  </TableCell>
                  <TableCell sx={{ fontSize: 13 }}>{event.actor_company?.name ?? '—'}</TableCell>
                  <TableCell>
                    <Mono sx={{ fontSize: 11.5, color: BRAND.muted }}>{shortSubject(event)}</Mono>
                  </TableCell>
                  <TableCell sx={{ fontSize: 12.5, color: BRAND.inkSoft, maxWidth: 280 }}>
                    {event.reason ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1.5 }}>
          <Typography sx={{ fontSize: 12, color: BRAND.muted }}>{result.total ?? rows.length} events</Typography>
          <Pagination
            count={result.last_page ?? 1}
            page={page}
            onChange={(_, value) => setPage(value)}
            size="small"
            color="primary"
          />
        </Box>
      </Paper>
    </Stack>
  );
}
