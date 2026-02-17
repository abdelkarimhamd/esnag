import 'react-native-gesture-handler'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import * as Linking from 'expo-linking'
import * as Notifications from 'expo-notifications'
import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { initializeDatabase } from './src/db/database'
import type { RootTabParamList, SnagsStackParamList } from './src/navigation/types'
import { AuthProvider, useAuth } from './src/providers/AuthProvider'
import { CreateSnagScreen } from './src/screens/CreateSnagScreen'
import { EquipmentScreen } from './src/screens/EquipmentScreen'
import { FloorMapScreen } from './src/screens/FloorMapScreen'
import { InspectionLinkScreen } from './src/screens/InspectionLinkScreen'
import { LoginScreen } from './src/screens/LoginScreen'
import { SettingsScreen } from './src/screens/SettingsScreen'
import { SyncConflictsScreen } from './src/screens/SyncConflictsScreen'
import { AttachmentAnnotationScreen } from './src/screens/AttachmentAnnotationScreen'
import { SnagDetailScreen } from './src/screens/SnagDetailScreen'
import { SnagsScreen } from './src/screens/SnagsScreen'
import { SyncProvider } from './src/sync/SyncProvider'

const SnagsStack = createNativeStackNavigator<SnagsStackParamList>()
const Tab = createBottomTabNavigator<RootTabParamList>()

const linking: any = {
  prefixes: [Linking.createURL('/'), 'esnagging://'],
  config: {
    screens: {
      Snags: {
        screens: {
          SnagsHome: 'snags',
          SnagCreate: 'snags/create',
          SnagDetail: 'snags/:serverId',
          FloorMap: 'snags/floors',
          AnnotateAttachment: 'snags/annotate',
          InspectionDetail: 'inspections/submissions/:inspectionId',
        },
      },
      Equipment: 'equipment',
      Conflicts: 'conflicts',
      Settings: 'settings',
    },
  },
}

const SnagsStackNavigator = () => (
  <SnagsStack.Navigator>
    <SnagsStack.Screen name="SnagsHome" component={SnagsScreen} options={{ title: 'Snags' }} />
    <SnagsStack.Screen name="SnagCreate" component={CreateSnagScreen} options={{ title: 'Create Snag' }} />
    <SnagsStack.Screen name="SnagDetail" component={SnagDetailScreen} options={{ title: 'Snag Detail' }} />
    <SnagsStack.Screen name="FloorMap" component={FloorMapScreen} options={{ title: 'Floor Map' }} />
    <SnagsStack.Screen name="AnnotateAttachment" component={AttachmentAnnotationScreen} options={{ title: 'Annotate Attachment' }} />
    <SnagsStack.Screen name="InspectionDetail" component={InspectionLinkScreen} options={{ title: 'Inspection' }} />
  </SnagsStack.Navigator>
)

const AuthedNavigator = () => {
  useEffect(() => {
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      const deepLink = response?.notification.request.content.data?.deep_link
      if (typeof deepLink === 'string' && deepLink.startsWith('esnagging://')) {
        void Linking.openURL(deepLink)
      }
    })

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const deepLink = response.notification.request.content.data?.deep_link
      if (typeof deepLink === 'string' && deepLink.startsWith('esnagging://')) {
        void Linking.openURL(deepLink)
      }
    })

    return () => {
      subscription.remove()
    }
  }, [])

  return (
    <SyncProvider>
      <Tab.Navigator>
        <Tab.Screen name="Snags" component={SnagsStackNavigator} options={{ headerShown: false }} />
        <Tab.Screen name="Equipment" component={EquipmentScreen} />
        <Tab.Screen name="Conflicts" component={SyncConflictsScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </SyncProvider>
  )
}

const AppShell = () => {
  const { loading, token } = useAuth()

  if (loading) {
    return (
      <View style={styles.loadingShell}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  return <NavigationContainer linking={linking}>{token ? <AuthedNavigator /> : <LoginScreen />}</NavigationContainer>
}

export default function App() {
  useEffect(() => {
    initializeDatabase()
  }, [])

  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

const styles = StyleSheet.create({
  loadingShell: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
})
