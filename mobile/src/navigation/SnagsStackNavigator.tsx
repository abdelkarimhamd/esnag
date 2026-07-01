import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import type { SnagsStackParamList } from './types'
import { AppHeader } from './AppHeader'
import { AttachmentAnnotationScreen } from '../screens/AttachmentAnnotationScreen'
import { CreateSnagScreen } from '../screens/CreateSnagScreen'
import { FloorMapScreen } from '../screens/FloorMapScreen'
import { InspectionLinkScreen } from '../screens/InspectionLinkScreen'
import { SnagDetailScreen } from '../screens/SnagDetailScreen'
import { SnagsScreen } from '../screens/SnagsScreen'

const SnagsStack = createNativeStackNavigator<SnagsStackParamList>()

interface SnagsStackNavigatorProps {
  onOpenMore: () => void
  notificationsBadge: number
}

export const SnagsStackNavigator = ({ onOpenMore, notificationsBadge }: SnagsStackNavigatorProps) => {
  return (
    <SnagsStack.Navigator
      screenOptions={{
        header: ({ navigation, route, options, back }) => (
          <AppHeader
            title={options.title ?? route.name}
            canGoBack={Boolean(back)}
            onBack={() => navigation.goBack()}
            onOpenMenu={onOpenMore}
            onOpenNotifications={() => navigation.getParent()?.navigate('Notifications' as never)}
            onOpenProfile={() => navigation.getParent()?.navigate('Settings' as never)}
            notificationsBadge={notificationsBadge}
          />
        ),
      }}
    >
      <SnagsStack.Screen name="SnagsHome" component={SnagsScreen} options={{ title: 'Snags' }} />
      <SnagsStack.Screen name="SnagCreate" component={CreateSnagScreen} options={{ title: 'Create Snag' }} />
      <SnagsStack.Screen name="SnagDetail" component={SnagDetailScreen} options={{ title: 'Snag Detail' }} />
      <SnagsStack.Screen name="FloorMap" component={FloorMapScreen} options={{ title: 'Floor Map' }} />
      <SnagsStack.Screen name="AnnotateAttachment" component={AttachmentAnnotationScreen} options={{ title: 'Annotate Attachment' }} />
      <SnagsStack.Screen name="InspectionDetail" component={InspectionLinkScreen} options={{ title: 'Inspection' }} />
    </SnagsStack.Navigator>
  )
}
