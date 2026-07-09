import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import type { SnagsStackParamList } from './types'
import { AppHeader } from './AppHeader'
import { AttachmentAnnotationScreen } from '../screens/AttachmentAnnotationScreen'
import { AuditTrailScreen } from '../screens/AuditTrailScreen'
import { CreateSnagScreen } from '../screens/CreateSnagScreen'
import { FloorMapScreen } from '../screens/FloorMapScreen'
import { HandoverCreateScreen } from '../screens/HandoverCreateScreen'
import { HandoverDetailScreen } from '../screens/HandoverDetailScreen'
import { HandoverRequestsScreen } from '../screens/HandoverRequestsScreen'
import { InspectionLinkScreen } from '../screens/InspectionLinkScreen'
import { InspectionsListScreen } from '../screens/InspectionsListScreen'
import { MasterDataAdminScreen } from '../screens/MasterDataAdminScreen'
import { RoleMatrixScreen } from '../screens/RoleMatrixScreen'
import { SearchScreen } from '../screens/SearchScreen'
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
      {/* These screens render their own design header (frames 2b/2c/2g/2e) or are a
          full-bleed editor (2j markup), so the stack's AppHeader is suppressed to avoid
          a double header. Only SnagDetail (2d) pairs with the stack AppHeader. */}
      <SnagsStack.Screen name="SnagsHome" component={SnagsScreen} options={{ headerShown: false }} />
      <SnagsStack.Screen name="SnagCreate" component={CreateSnagScreen} options={{ headerShown: false }} />
      <SnagsStack.Screen name="SnagDetail" component={SnagDetailScreen} options={{ title: 'Snag Detail' }} />
      <SnagsStack.Screen name="FloorMap" component={FloorMapScreen} options={{ headerShown: false }} />
      <SnagsStack.Screen name="AnnotateAttachment" component={AttachmentAnnotationScreen} options={{ headerShown: false }} />
      <SnagsStack.Screen name="InspectionsList" component={InspectionsListScreen} options={{ headerShown: false }} />
      <SnagsStack.Screen name="InspectionDetail" component={InspectionLinkScreen} options={{ headerShown: false }} />
      <SnagsStack.Screen name="HandoverRequestsList" component={HandoverRequestsScreen} options={{ headerShown: false }} />
      <SnagsStack.Screen name="HandoverDetail" component={HandoverDetailScreen} options={{ title: 'Handover' }} />
      <SnagsStack.Screen name="HandoverCreate" component={HandoverCreateScreen} options={{ title: 'New handover' }} />
      <SnagsStack.Screen name="AuditTrail" component={AuditTrailScreen} options={{ title: 'Audit trail' }} />
      <SnagsStack.Screen name="MasterDataAdmin" component={MasterDataAdminScreen} options={{ title: 'Master data' }} />
      <SnagsStack.Screen name="RoleMatrix" component={RoleMatrixScreen} options={{ title: 'Roles & permissions' }} />
      <SnagsStack.Screen name="Search" component={SearchScreen} options={{ headerShown: false }} />
    </SnagsStack.Navigator>
  )
}
