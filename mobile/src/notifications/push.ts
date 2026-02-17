import * as Notifications from 'expo-notifications'
import { apiClient } from '../api/client'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

export const registerForPushNotifications = async (token: string, organizationId: number) => {
  const permissionResponse = await Notifications.requestPermissionsAsync()
  if (permissionResponse.status !== 'granted') {
    throw new Error('Push notification permission was not granted.')
  }

  const pushToken = await Notifications.getExpoPushTokenAsync()
  await apiClient.registerPushToken(token, organizationId, pushToken.data, '1.0.0', 'expo-device')

  return pushToken.data
}
