import type { RouteProp } from '@react-navigation/native'
import { Text } from 'react-native'
import type { SnagsStackParamList } from '../navigation/types'
import { useAppTheme } from '../theme/ThemeProvider'
import { Card, ScreenContainer, SectionHeader } from '../ui'

interface Props {
  route: RouteProp<SnagsStackParamList, 'InspectionDetail'>
}

export const InspectionLinkScreen = ({ route }: Props) => {
  const theme = useAppTheme()

  return (
    <ScreenContainer scroll>
      <SectionHeader title="Inspection Deep Link" subtitle={`Inspection #${route.params?.inspectionId ?? 'N/A'}`} />
      <Card elevated>
        <Text style={{ color: theme.colors.text }}>
          This screen was opened from a deep link or push notification and keeps route compatibility with the
          existing inspection flow.
        </Text>
      </Card>
    </ScreenContainer>
  )
}
