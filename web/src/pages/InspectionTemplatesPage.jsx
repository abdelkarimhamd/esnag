import { Alert, Box, Button, Card, CardContent, Checkbox, FormControl, FormControlLabel, Grid, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography, } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { PageHero } from '../components/ui/PageHero';
import { StatCard } from '../components/ui/StatCard';
import { useAuth } from '../hooks/useAuth';
import { parseApiError } from '../utils/apiError';
const emptyField = () => ({
    key: '',
    label: '',
    type: 'text',
    required: false,
});
const emptySection = () => ({
    title: '',
    fields: [emptyField()],
});
const emptyWorkflowStep = (stepOrder) => ({
    step_order: stepOrder,
    step_name: '',
    role_name: 'inspector',
    requires_signature: false,
});
const initialDraft = () => ({
    project_id: '',
    name: '',
    code: '',
    type: 'ncr',
    discipline: '',
    description: '',
    is_active: true,
    sections: [emptySection()],
    approval_workflow: [emptyWorkflowStep(1)],
});
const toDraft = (template) => ({
    project_id: template.project_id ?? '',
    name: template.name,
    code: template.code ?? '',
    type: template.type,
    discipline: template.discipline ?? '',
    description: template.description ?? '',
    is_active: template.is_active,
    sections: template.schema?.sections?.map((section) => ({
        title: section.title,
        fields: section.fields.map((field) => ({
            key: field.key,
            label: field.label,
            type: field.type,
            required: Boolean(field.required),
            options: field.options ?? [],
        })),
    })) ?? [emptySection()],
    approval_workflow: template.approval_workflow?.map((step, index) => ({
        step_order: step.step_order ?? index + 1,
        step_name: step.step_name ?? '',
        role_name: step.role_name,
        requires_signature: Boolean(step.requires_signature),
    })) ?? [emptyWorkflowStep(1)],
});
export const InspectionTemplatesPage = () => {
    const { permissions } = useAuth();
    const canManage = permissions.includes('inspections.templates.manage');
    const [projects, setProjects] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState(null);
    const [projectFilter, setProjectFilter] = useState('');
    const [disciplineFilter, setDisciplineFilter] = useState('');
    const [libraryOnly, setLibraryOnly] = useState(false);
    const [draft, setDraft] = useState(initialDraft());
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const selectedTemplate = useMemo(() => templates.find((template) => template.id === selectedTemplateId) ?? null, [selectedTemplateId, templates]);
    const selectedTemplateIsLibrary = Boolean(selectedTemplate?.is_library);
    const formLocked = !canManage || selectedTemplateIsLibrary;
    const loadProjects = useCallback(async () => {
        const response = await api.get('/api/projects', { params: { per_page: 100 } });
        setProjects(response.data.data);
    }, []);
    const loadTemplates = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.get('/api/inspections/templates', {
                params: {
                    project_id: projectFilter || undefined,
                    discipline: disciplineFilter || undefined,
                    library_only: libraryOnly || undefined,
                },
            });
            setTemplates(response.data.data);
        }
        catch (requestError) {
            setError(parseApiError(requestError, 'Unable to load inspection templates.'));
        }
        finally {
            setLoading(false);
        }
    }, [disciplineFilter, libraryOnly, projectFilter]);
    useEffect(() => {
        void loadProjects();
    }, [loadProjects]);
    useEffect(() => {
        void loadTemplates();
    }, [loadTemplates]);
    useEffect(() => {
        if (!selectedTemplate) {
            return;
        }
        setDraft(toDraft(selectedTemplate));
    }, [selectedTemplate]);
    const resetForm = () => {
        setSelectedTemplateId(null);
        setDraft(initialDraft());
    };
    const saveTemplate = async () => {
        if (!canManage) {
            return;
        }
        if (selectedTemplateId && selectedTemplateIsLibrary) {
            setError('Library templates are read-only. Clone the template to create a project copy.');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const payload = {
                project_id: draft.project_id || null,
                name: draft.name,
                code: draft.code || null,
                type: draft.type,
                discipline: draft.discipline || null,
                description: draft.description || null,
                is_active: draft.is_active,
                schema: {
                    sections: draft.sections.map((section, sectionIndex) => ({
                        title: section.title || `Section ${sectionIndex + 1}`,
                        fields: section.fields.map((field, fieldIndex) => ({
                            key: field.key || `field_${sectionIndex + 1}_${fieldIndex + 1}`,
                            label: field.label || `Field ${fieldIndex + 1}`,
                            type: field.type,
                            required: Boolean(field.required),
                            options: field.type === 'select'
                                ? (field.options ?? []).filter((option) => option.trim() !== '')
                                : undefined,
                        })),
                    })),
                },
                approval_workflow: draft.approval_workflow
                    .filter((step) => step.role_name.trim() !== '')
                    .map((step, index) => ({
                    step_order: index + 1,
                    step_name: step.step_name || null,
                    role_name: step.role_name,
                    requires_signature: Boolean(step.requires_signature),
                })),
            };
            if (selectedTemplateId) {
                await api.put(`/api/inspections/templates/${selectedTemplateId}`, payload);
            }
            else {
                const response = await api.post('/api/inspections/templates', payload);
                setSelectedTemplateId(response.data.data.id);
            }
            await loadTemplates();
        }
        catch (requestError) {
            setError(parseApiError(requestError, 'Unable to save template.'));
        }
        finally {
            setSaving(false);
        }
    };
    const cloneTemplate = async () => {
        if (!canManage || !selectedTemplateId || !selectedTemplateIsLibrary) {
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await api.post(`/api/inspections/templates/${selectedTemplateId}/clone`, {
                project_id: draft.project_id || projectFilter || null,
                name: draft.name.trim() || undefined,
            });
            await loadTemplates();
            setError(null);
        }
        catch (requestError) {
            setError(parseApiError(requestError, 'Unable to clone library template.'));
        }
        finally {
            setSaving(false);
        }
    };
    const deleteTemplate = async () => {
        if (!canManage || !selectedTemplateId || selectedTemplateIsLibrary) {
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await api.delete(`/api/inspections/templates/${selectedTemplateId}`);
            resetForm();
            await loadTemplates();
        }
        catch (requestError) {
            setError(parseApiError(requestError, 'Unable to delete template.'));
        }
        finally {
            setSaving(false);
        }
    };
    const updateSection = (index, updater) => {
        setDraft((current) => ({
            ...current,
            sections: current.sections.map((section, sectionIndex) => (sectionIndex === index ? updater(section) : section)),
        }));
    };
    const updateWorkflow = (index, updater) => {
        setDraft((current) => ({
            ...current,
            approval_workflow: current.approval_workflow.map((step, stepIndex) => stepIndex === index ? updater(step) : step),
        }));
    };
    const columns = useMemo(() => [
        { field: 'name', headerName: 'Name', minWidth: 200, flex: 1 },
        { field: 'type', headerName: 'Type', width: 120 },
        { field: 'discipline', headerName: 'Discipline', width: 140, valueGetter: (_, row) => row.discipline ?? '-' },
        {
            field: 'project',
            headerName: 'Project',
            minWidth: 160,
            flex: 1,
            valueGetter: (_, row) => row.project?.code ?? 'Org default',
        },
        {
            field: 'is_library',
            headerName: 'Library',
            width: 100,
            valueFormatter: (value) => (value ? 'Yes' : 'No'),
        },
        {
            field: 'is_active',
            headerName: 'Active',
            width: 100,
            valueFormatter: (value) => (value ? 'Yes' : 'No'),
        },
        { field: 'version', headerName: 'Version', width: 90 },
    ], []);
    const metrics = useMemo(() => ({
        total: templates.length,
        library: templates.filter((template) => Boolean(template.is_library)).length,
        active: templates.filter((template) => template.is_active).length,
        versioned: templates.filter((template) => template.version > 1).length,
    }), [templates]);
    return (<Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}

      <PageHero title="Inspection Templates" description="Build JSON-schema forms and role-based approval workflows for repeatable, auditable inspections." actions={<Stack direction={{ xs: 'column', md: 'row' }} spacing={1} width={{ xs: '100%', md: 'auto' }}>
            <FormControl size="small" sx={{ minWidth: 220, bgcolor: 'rgba(255,255,255,0.14)', borderRadius: 1.5 }}>
              <InputLabel id="inspection-template-project-filter" sx={{ color: 'rgba(255,255,255,0.92)' }}>
                Project
              </InputLabel>
              <Select labelId="inspection-template-project-filter" label="Project" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value ? Number(event.target.value) : '')} sx={{
                color: '#FFFFFF',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.42)' },
                '& .MuiSvgIcon-root': { color: '#FFFFFF' },
            }}>
                <MenuItem value="">All projects</MenuItem>
                {projects.map((project) => (<MenuItem key={project.id} value={project.id}>
                    {project.code} - {project.name}
                  </MenuItem>))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 160, bgcolor: 'rgba(255,255,255,0.14)', borderRadius: 1.5 }}>
              <InputLabel id="inspection-template-discipline-filter" sx={{ color: 'rgba(255,255,255,0.92)' }}>
                Discipline
              </InputLabel>
              <Select labelId="inspection-template-discipline-filter" label="Discipline" value={disciplineFilter} onChange={(event) => setDisciplineFilter(String(event.target.value))} sx={{
                color: '#FFFFFF',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.42)' },
                '& .MuiSvgIcon-root': { color: '#FFFFFF' },
            }}>
                <MenuItem value="">All</MenuItem>
                <MenuItem value="Architectural">Architectural</MenuItem>
                <MenuItem value="Civil">Civil</MenuItem>
                <MenuItem value="MEP">MEP</MenuItem>
                <MenuItem value="Mechanical">Mechanical</MenuItem>
                <MenuItem value="Electrical">Electrical</MenuItem>
                <MenuItem value="Safety">Safety</MenuItem>
                <MenuItem value="QA/QC">QA/QC</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 170, bgcolor: 'rgba(255,255,255,0.14)', borderRadius: 1.5 }}>
              <InputLabel id="inspection-template-library-filter" sx={{ color: 'rgba(255,255,255,0.92)' }}>
                Scope
              </InputLabel>
              <Select labelId="inspection-template-library-filter" label="Scope" value={libraryOnly ? 'library' : 'all'} onChange={(event) => setLibraryOnly(String(event.target.value) === 'library')} sx={{
                color: '#FFFFFF',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.42)' },
                '& .MuiSvgIcon-root': { color: '#FFFFFF' },
            }}>
                <MenuItem value="all">All templates</MenuItem>
                <MenuItem value="library">Library only</MenuItem>
              </Select>
            </FormControl>
          </Stack>}/>

      <Grid container spacing={1.2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard label="Total Templates" value={metrics.total} tone="primary"/>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard label="Library Templates" value={metrics.library} tone="secondary"/>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard label="Active Templates" value={metrics.active} tone="success"/>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard label="Version > 1" value={metrics.versioned} tone="neutral"/>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Paper sx={{ p: 1.5 }}>
            <DataGrid autoHeight rows={templates} columns={columns} loading={loading} disableRowSelectionOnClick onRowClick={(params) => {
            setSelectedTemplateId(params.row.id);
        }} pageSizeOptions={[10, 20, 50]} sx={{ border: 0 }}/>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 7 }}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="h6">{selectedTemplateId ? 'Edit Template' : 'Create Template'}</Typography>
                    {selectedTemplateIsLibrary && <Alert severity="info">Library template</Alert>}
                  </Stack>
                  <Button variant="outlined" onClick={resetForm}>
                    New Template
                  </Button>
                </Box>

                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, md: 8 }}>
                    <TextField fullWidth size="small" label="Template Name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} disabled={formLocked}/>
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField fullWidth size="small" label="Code" value={draft.code} onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))} disabled={formLocked}/>
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField fullWidth size="small" label="Type" value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))} disabled={formLocked}/>
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField fullWidth size="small" label="Discipline" value={draft.discipline} onChange={(event) => setDraft((current) => ({ ...current, discipline: event.target.value }))} disabled={formLocked}/>
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="inspection-template-project-id">Project</InputLabel>
                      <Select labelId="inspection-template-project-id" label="Project" value={draft.project_id} onChange={(event) => setDraft((current) => ({
            ...current,
            project_id: event.target.value ? Number(event.target.value) : '',
        }))} disabled={formLocked}>
                        <MenuItem value="">Organization default</MenuItem>
                        {projects.map((project) => (<MenuItem key={project.id} value={project.id}>
                            {project.code} - {project.name}
                          </MenuItem>))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <TextField fullWidth multiline minRows={2} size="small" label="Description" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} disabled={formLocked}/>
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <FormControlLabel control={<Checkbox checked={draft.is_active} onChange={(event) => setDraft((current) => ({ ...current, is_active: event.target.checked }))} disabled={formLocked}/>} label="Template is active"/>
                  </Grid>
                </Grid>

                <Typography variant="subtitle1">Sections & Fields</Typography>

                <Stack spacing={1.5}>
                  {draft.sections.map((section, sectionIndex) => (<Paper key={`section-${sectionIndex}`} variant="outlined" sx={{ p: 1.5 }}>
                      <Stack spacing={1}>
                        <Box display="flex" gap={1} alignItems="center">
                          <TextField fullWidth size="small" label={`Section ${sectionIndex + 1} Title`} value={section.title} onChange={(event) => updateSection(sectionIndex, (current) => ({
                ...current,
                title: event.target.value,
            }))} disabled={formLocked}/>
                          {!formLocked && draft.sections.length > 1 && (<Button color="error" variant="outlined" onClick={() => setDraft((current) => ({
                    ...current,
                    sections: current.sections.filter((_, index) => index !== sectionIndex),
                }))}>
                              Remove
                            </Button>)}
                        </Box>

                        {section.fields.map((field, fieldIndex) => (<Grid container spacing={1} key={`field-${sectionIndex}-${fieldIndex}`}>
                            <Grid size={{ xs: 12, md: 3 }}>
                              <TextField fullWidth size="small" label="Key" value={field.key} onChange={(event) => updateSection(sectionIndex, (current) => ({
                    ...current,
                    fields: current.fields.map((inner, index) => index === fieldIndex
                        ? {
                            ...inner,
                            key: event.target.value,
                        }
                        : inner),
                }))} disabled={formLocked}/>
                            </Grid>
                            <Grid size={{ xs: 12, md: 3 }}>
                              <TextField fullWidth size="small" label="Label" value={field.label} onChange={(event) => updateSection(sectionIndex, (current) => ({
                    ...current,
                    fields: current.fields.map((inner, index) => index === fieldIndex
                        ? {
                            ...inner,
                            label: event.target.value,
                        }
                        : inner),
                }))} disabled={formLocked}/>
                            </Grid>
                            <Grid size={{ xs: 12, md: 3 }}>
                              <FormControl fullWidth size="small">
                                <InputLabel id={`field-type-${sectionIndex}-${fieldIndex}`}>Type</InputLabel>
                                <Select labelId={`field-type-${sectionIndex}-${fieldIndex}`} label="Type" value={field.type} onChange={(event) => updateSection(sectionIndex, (current) => ({
                    ...current,
                    fields: current.fields.map((inner, index) => index === fieldIndex
                        ? {
                            ...inner,
                            type: event.target.value,
                        }
                        : inner),
                }))} disabled={formLocked}>
                                  <MenuItem value="text">Text</MenuItem>
                                  <MenuItem value="textarea">Textarea</MenuItem>
                                  <MenuItem value="number">Number</MenuItem>
                                  <MenuItem value="select">Select</MenuItem>
                                  <MenuItem value="date">Date</MenuItem>
                                  <MenuItem value="checkbox">Checkbox</MenuItem>
                                </Select>
                              </FormControl>
                            </Grid>
                            <Grid size={{ xs: 12, md: 2 }}>
                              <FormControlLabel control={<Checkbox checked={Boolean(field.required)} onChange={(event) => updateSection(sectionIndex, (current) => ({
                        ...current,
                        fields: current.fields.map((inner, index) => index === fieldIndex
                            ? {
                                ...inner,
                                required: event.target.checked,
                            }
                            : inner),
                    }))} disabled={formLocked}/>} label="Required"/>
                            </Grid>
                            <Grid size={{ xs: 12, md: 1 }}>
                              {!formLocked && section.fields.length > 1 && (<Button size="small" color="error" onClick={() => updateSection(sectionIndex, (current) => ({
                        ...current,
                        fields: current.fields.filter((_, index) => index !== fieldIndex),
                    }))}>
                                  Del
                                </Button>)}
                            </Grid>

                            {field.type === 'select' && (<Grid size={{ xs: 12 }}>
                                <TextField fullWidth size="small" label="Options (comma separated)" value={(field.options ?? []).join(', ')} onChange={(event) => updateSection(sectionIndex, (current) => ({
                        ...current,
                        fields: current.fields.map((inner, index) => index === fieldIndex
                            ? {
                                ...inner,
                                options: event.target.value
                                    .split(',')
                                    .map((option) => option.trim())
                                    .filter((option) => option !== ''),
                            }
                            : inner),
                    }))} disabled={formLocked}/>
                              </Grid>)}
                          </Grid>))}

                        {!formLocked && (<Button size="small" variant="outlined" onClick={() => updateSection(sectionIndex, (current) => ({
                    ...current,
                    fields: [...current.fields, emptyField()],
                }))}>
                            Add Field
                          </Button>)}
                      </Stack>
                    </Paper>))}

                  {!formLocked && (<Button variant="outlined" onClick={() => setDraft((current) => ({
                ...current,
                sections: [...current.sections, emptySection()],
            }))}>
                      Add Section
                    </Button>)}
                </Stack>

                <Typography variant="subtitle1">Approval Workflow</Typography>
                <Stack spacing={1.2}>
                  {draft.approval_workflow.map((step, stepIndex) => (<Grid container spacing={1} key={`workflow-${stepIndex}`}>
                      <Grid size={{ xs: 12, md: 1 }}>
                        <TextField fullWidth size="small" label="#" value={stepIndex + 1} disabled/>
                      </Grid>
                      <Grid size={{ xs: 12, md: 4 }}>
                        <TextField fullWidth size="small" label="Step Name" value={step.step_name ?? ''} onChange={(event) => updateWorkflow(stepIndex, (current) => ({
                ...current,
                step_name: event.target.value,
            }))} disabled={formLocked}/>
                      </Grid>
                      <Grid size={{ xs: 12, md: 3 }}>
                        <FormControl fullWidth size="small">
                          <InputLabel id={`workflow-role-${stepIndex}`}>Role</InputLabel>
                          <Select labelId={`workflow-role-${stepIndex}`} label="Role" value={step.role_name} onChange={(event) => updateWorkflow(stepIndex, (current) => ({
                ...current,
                role_name: event.target.value,
            }))} disabled={formLocked}>
                            <MenuItem value="org_admin">org_admin</MenuItem>
                            <MenuItem value="project_manager">project_manager</MenuItem>
                            <MenuItem value="engineer">engineer</MenuItem>
                            <MenuItem value="inspector">inspector</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid size={{ xs: 12, md: 3 }}>
                        <FormControlLabel control={<Checkbox checked={Boolean(step.requires_signature)} onChange={(event) => updateWorkflow(stepIndex, (current) => ({
                    ...current,
                    requires_signature: event.target.checked,
                }))} disabled={formLocked}/>} label="Needs Signature"/>
                      </Grid>
                      <Grid size={{ xs: 12, md: 1 }}>
                        {!formLocked && draft.approval_workflow.length > 1 && (<Button color="error" onClick={() => setDraft((current) => ({
                    ...current,
                    approval_workflow: current.approval_workflow.filter((_, index) => index !== stepIndex),
                }))}>
                            Del
                          </Button>)}
                      </Grid>
                    </Grid>))}

                  {!formLocked && (<Button size="small" variant="outlined" onClick={() => setDraft((current) => ({
                ...current,
                approval_workflow: [...current.approval_workflow, emptyWorkflowStep(current.approval_workflow.length + 1)],
            }))}>
                      Add Approval Step
                    </Button>)}
                </Stack>

                {canManage && (<Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                    <Button variant="outlined" onClick={() => void loadTemplates()}>
                      Refresh
                    </Button>
                    {selectedTemplateId && !selectedTemplateIsLibrary && (<Button color="error" variant="outlined" onClick={() => void deleteTemplate()} disabled={saving}>
                        Delete
                      </Button>)}
                    {selectedTemplateIsLibrary ? (<Button variant="contained" onClick={() => void cloneTemplate()} disabled={saving}>
                        {saving ? 'Cloning...' : 'Clone Library Template'}
                      </Button>) : (<Button variant="contained" onClick={() => void saveTemplate()} disabled={saving}>
                        {saving ? 'Saving...' : selectedTemplateId ? 'Update Template' : 'Create Template'}
                      </Button>)}
                  </Stack>)}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>);
};
