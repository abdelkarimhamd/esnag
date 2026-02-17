import {
  Box,
  Checkbox,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import type { InspectionTemplateField, InspectionTemplateRecord } from '../types'

interface DynamicInspectionFormProps {
  template?: InspectionTemplateRecord | null
  value: Record<string, unknown>
  onChange?: (nextValue: Record<string, unknown>) => void
  disabled?: boolean
}

const normalizeFieldValue = (field: InspectionTemplateField, source: Record<string, unknown>) => {
  const raw = source[field.key]

  if (field.type === 'checkbox') {
    return Boolean(raw)
  }

  if (field.type === 'number') {
    if (typeof raw === 'number') {
      return raw
    }

    if (typeof raw === 'string' && raw !== '') {
      const parsed = Number(raw)
      return Number.isNaN(parsed) ? '' : parsed
    }

    return ''
  }

  return typeof raw === 'string' ? raw : ''
}

export const DynamicInspectionForm = ({ template, value, onChange, disabled = false }: DynamicInspectionFormProps) => {
  const updateField = (fieldKey: string, fieldValue: unknown) => {
    if (!onChange) {
      return
    }

    onChange({
      ...value,
      [fieldKey]: fieldValue,
    })
  }

  if (!template) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography color="text.secondary">Select an inspection template to render the form.</Typography>
      </Paper>
    )
  }

  const sections = template.schema?.sections ?? []

  return (
    <Stack spacing={2}>
      {sections.map((section, sectionIndex) => (
        <Paper key={`${section.title}-${sectionIndex}`} sx={{ p: 2 }}>
          <Stack spacing={1.5}>
            <Box>
              <Typography variant="h6">{section.title || `Section ${sectionIndex + 1}`}</Typography>
            </Box>

            <Grid container spacing={1.5}>
              {section.fields.map((field, fieldIndex) => (
                <Grid key={`${field.key}-${fieldIndex}`} size={{ xs: 12, md: field.type === 'textarea' ? 12 : 6 }}>
                  {field.type === 'checkbox' ? (
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={Boolean(normalizeFieldValue(field, value))}
                          onChange={(event) => updateField(field.key, event.target.checked)}
                          disabled={disabled}
                        />
                      }
                      label={
                        <>
                          {field.label}
                          {field.required ? ' *' : ''}
                        </>
                      }
                    />
                  ) : field.type === 'select' ? (
                    <FormControl fullWidth size="small">
                      <InputLabel id={`field-label-${field.key}`}>
                        {field.label}
                        {field.required ? ' *' : ''}
                      </InputLabel>
                      <Select
                        labelId={`field-label-${field.key}`}
                        label={`${field.label}${field.required ? ' *' : ''}`}
                        value={String(normalizeFieldValue(field, value))}
                        onChange={(event) => updateField(field.key, event.target.value)}
                        disabled={disabled}
                      >
                        {(field.options ?? []).map((option) => (
                          <MenuItem key={option} value={option}>
                            {option}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ) : (
                    <TextField
                      fullWidth
                      size="small"
                      required={Boolean(field.required)}
                      label={field.label}
                      type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                      value={normalizeFieldValue(field, value)}
                      onChange={(event) =>
                        updateField(
                          field.key,
                          field.type === 'number'
                            ? (event.target.value === '' ? '' : Number(event.target.value))
                            : event.target.value,
                        )
                      }
                      multiline={field.type === 'textarea'}
                      minRows={field.type === 'textarea' ? 3 : undefined}
                      InputLabelProps={field.type === 'date' ? { shrink: true } : undefined}
                      disabled={disabled}
                    />
                  )}
                </Grid>
              ))}
            </Grid>
          </Stack>
        </Paper>
      ))}
    </Stack>
  )
}

