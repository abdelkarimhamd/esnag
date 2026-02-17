import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { ApiError } from '../api/client'
import { useAuth } from '../providers/AuthProvider'

export const LoginScreen = () => {
  const { login } = useAuth()
  const [email, setEmail] = useState('manager@sky.demo')
  const [password, setPassword] = useState('password')
  const [otpCode, setOtpCode] = useState('')
  const [mfaRequired, setMfaRequired] = useState(false)
  const [trustDevice, setTrustDevice] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setLoading(true)
    setError(null)

    try {
      await login(email.trim(), password, otpCode || undefined, trustDevice)
    } catch (exception) {
      if (exception instanceof ApiError) {
        const details = typeof exception.details === 'object' && exception.details ? (exception.details as { mfa_required?: boolean }) : null
        if (exception.status === 428 || details?.mfa_required) {
          setMfaRequired(true)
          setError(exception.message || 'MFA code is required for this account.')
        } else {
          setError(exception.message)
        }
      } else {
        setError(exception instanceof Error ? exception.message : 'Unable to login.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>eSnagging Mobile</Text>
      <Text style={styles.subtitle}>Offline-first snagging with queue-based sync.</Text>

      <TextInput
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
      />
      <TextInput
        secureTextEntry
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        style={styles.input}
      />

      {mfaRequired ? (
        <TextInput
          placeholder="MFA code"
          value={otpCode}
          onChangeText={setOtpCode}
          style={styles.input}
          keyboardType="number-pad"
          maxLength={8}
        />
      ) : null}

      <Pressable style={[styles.toggle, trustDevice && styles.toggleActive]} onPress={() => setTrustDevice((current) => !current)}>
        <Text style={[styles.toggleText, trustDevice && styles.toggleTextActive]}>
          Trust this device for future mobile logins
        </Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable disabled={loading} onPress={() => void submit()} style={[styles.button, loading && styles.buttonDisabled]}>
        {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Login</Text>}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  brand: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    color: '#475569',
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  toggle: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  toggleActive: {
    borderColor: '#0F766E',
    backgroundColor: '#CCFBF1',
  },
  toggleText: {
    color: '#475569',
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#115E59',
  },
  button: {
    backgroundColor: '#0F766E',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  error: {
    color: '#B91C1C',
  },
})
