import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { ApiError, normalizeMobileApiError } from '../api/client'
import { useAuth } from '../providers/AuthProvider'
import { useAppTheme } from '../theme/ThemeProvider'
import { Button, Card, ErrorState, ScreenContainer, SectionHeader, TextField } from '../ui'

export const LoginScreen = () => {
  const theme = useAppTheme()
  const { login } = useAuth()
  const [email, setEmail] = useState('manager@sky.demo')
  const [password, setPassword] = useState('password')
  const [otpCode, setOtpCode] = useState('')
  const [mfaRequired, setMfaRequired] = useState(false)
  const [trustDevice, setTrustDevice] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorHint, setErrorHint] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setLoading(true)
    setError(null)
    setErrorHint(null)

    try {
      await login(email.trim(), password, otpCode || undefined, trustDevice)
    } catch (exception) {
      const resolved = normalizeMobileApiError(exception, 'Unable to login.')
      if (exception instanceof ApiError) {
        const details = typeof exception.details === 'object' && exception.details ? (exception.details as { mfa_required?: boolean }) : null
        if (exception.status === 428 || details?.mfa_required) {
          setMfaRequired(true)
          setError(resolved.message || 'MFA code is required for this account.')
        } else {
          setError(resolved.message)
        }
      } else {
        setError(resolved.message)
      }

      setErrorHint(resolved.hint)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScreenContainer scroll>
      <View style={styles.hero}>
        <Text style={[styles.brand, { color: theme.colors.primary }]}>MORGANTI GCC</Text>
        <SectionHeader
          title="eSnagging Mobile"
          subtitle="Offline-first snagging with queue-based sync and role-aware access."
        />
      </View>

      <Card elevated>
        <TextField
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          label="Email address"
          value={email}
          onChangeText={setEmail}
          accessibilityLabel="Email address"
        />
        <TextField
          secureTextEntry
          placeholder="Password"
          label="Password"
          value={password}
          onChangeText={setPassword}
          accessibilityLabel="Password"
        />
        {mfaRequired ? (
          <TextField
            placeholder="MFA code"
            value={otpCode}
            label="Verification code"
            onChangeText={setOtpCode}
            keyboardType="number-pad"
            maxLength={8}
            accessibilityLabel="MFA code"
            helperText="Code required for this account."
          />
        ) : null}

        <Button
          label={trustDevice ? 'Trusted device enabled' : 'Trust this device'}
          variant={trustDevice ? 'secondary' : 'ghost'}
          onPress={() => setTrustDevice((current) => !current)}
          accessibilityLabel="Toggle trusted device setting"
        />

        {error ? <ErrorState message={error} hint={errorHint} /> : null}
        <Button label="Sign in" loading={loading} onPress={() => void submit()} fullWidth />
      </Card>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  hero: {
    gap: 6,
  },
  brand: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
})
