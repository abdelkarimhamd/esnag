import { Alert, Box, Chip, Stack, Tab, Tabs } from '@mui/material'
import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { PageHero } from '../components/ui/PageHero'
import { CloseoutTemplatesPage } from './CloseoutTemplatesPage'
import { InspectionTemplatesPage } from './InspectionTemplatesPage'

type TemplateTab = 'inspection' | 'closeout'

export const TemplatesHubPage = () => {
  const { permissions } = useAuth()

  const canViewInspection = permissions.includes('inspections.templates.view')
  const canViewCloseout = permissions.includes('closeout.templates.view') || permissions.includes('projects.view')

  const availableTabs = useMemo<TemplateTab[]>(() => {
    const tabs: TemplateTab[] = []
    if (canViewInspection) {
      tabs.push('inspection')
    }
    if (canViewCloseout) {
      tabs.push('closeout')
    }
    return tabs
  }, [canViewCloseout, canViewInspection])

  const [tab, setTab] = useState<TemplateTab>(availableTabs[0] ?? 'inspection')

  const activeTab = availableTabs.includes(tab) ? tab : (availableTabs[0] ?? 'inspection')

  if (availableTabs.length === 0) {
    return <Alert severity="warning">You do not have permission to view template libraries.</Alert>
  }

  return (
    <Stack spacing={2}>
      <PageHero
        title="Template Library"
        description="Manage inspection and closeout templates for consistent execution across projects and disciplines."
        badges={
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {canViewInspection && <Chip size="small" variant="outlined" sx={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.44)' }} label="Inspection Templates" />}
            {canViewCloseout && <Chip size="small" variant="outlined" sx={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.44)' }} label="Closeout Templates" />}
          </Stack>
        }
      />

      <Box>
        <Tabs value={activeTab} onChange={(_, value: TemplateTab) => setTab(value)}>
          {canViewInspection && <Tab value="inspection" label="Inspection Templates" />}
          {canViewCloseout && <Tab value="closeout" label="Closeout Templates" />}
        </Tabs>
      </Box>

      {activeTab === 'inspection' ? <InspectionTemplatesPage /> : <CloseoutTemplatesPage />}
    </Stack>
  )
}
