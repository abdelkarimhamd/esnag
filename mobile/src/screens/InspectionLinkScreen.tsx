import type { RouteProp } from '@react-navigation/native'
import { StyleSheet, Text, View } from 'react-native'
import type { SnagsStackParamList } from '../navigation/types'

interface Props {
  route: RouteProp<SnagsStackParamList, 'InspectionDetail'>
}

export const InspectionLinkScreen = ({ route }: Props) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Inspection Deep Link</Text>
      <Text style={styles.body}>
        Inspection #{route.params?.inspectionId ?? 'N/A'} was opened from a push notification.
      </Text>
      <Text style={styles.body}>
        Offline inspection forms are available in the web module. Mobile currently focuses on snagging and equipment in this phase.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 20,
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  body: {
    color: '#334155',
    lineHeight: 20,
  },
})
