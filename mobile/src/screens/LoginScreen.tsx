import { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ApiError, normalizeMobileApiError } from '../api/client'
import { useAuth } from '../providers/AuthProvider'
import { useAppTheme } from '../theme/ThemeProvider'

// The login frame (frame-2a) is a fixed dark-navy brand screen — it does not
// follow the light/dark scheme. Colours below map the frame's literal hexes to
// their nearest theme tokens (navy bg = theme.colors.text #142642, brand green
// = success, blue/teal = primary/secondary) with the frame's translucent-white
// surface treatment kept verbatim.
const FIELD_BG = 'rgba(255,255,255,0.08)'
const FIELD_BORDER = 'rgba(255,255,255,0.16)'
const OUTLINE_BORDER = 'rgba(255,255,255,0.22)'
const FACEID_BORDER = 'rgba(255,255,255,0.2)'
const MUTED = '#8FA0BE'
const SUBTLE = '#B7C4D9'
const FOOTNOTE = '#6E7F9E'
const ACCENT = '#69AFD4'
const PLACEHOLDER = '#8FA0BE'

// Three-square brand mark used by the logo, SSO button and watermark. The trio
// of rects reuse the brand green / blue / teal, matching the frame SVG.
const BrandMark = ({
  size,
  colored,
  fill,
  opacity = 1,
}: {
  size: number
  colored?: boolean
  fill?: string
  opacity?: number
}) => {
  const theme = useAppTheme()
  const unit = size * 0.426 // 14.5 / 34 of the viewBox
  const gap = size * 0.515 // 18.5 / 34
  const inset = size * 0.029 // 1 / 34
  const r = size * 0.094 // 3.2 / 34
  const squares: { top: number; left: number; color: string }[] = [
    { top: inset, left: inset, color: colored ? theme.colors.success : (fill ?? '#FFFFFF') },
    { top: inset, left: gap, color: colored ? '#4F84C4' : (fill ?? '#FFFFFF') },
    { top: gap, left: inset, color: colored ? theme.colors.secondary : (fill ?? '#FFFFFF') },
  ]
  return (
    <View style={{ width: size, height: size, opacity }}>
      {squares.map((square, index) => (
        <View
          key={index}
          style={{
            position: 'absolute',
            top: square.top,
            left: square.left,
            width: unit,
            height: unit,
            borderRadius: r,
            backgroundColor: square.color,
          }}
        />
      ))}
    </View>
  )
}

export const LoginScreen = () => {
  const theme = useAppTheme()
  const { login, requestEmailOtp, loginWithEmailOtp } = useAuth()
  const [email, setEmail] = useState('manager@sky.demo')
  const [password, setPassword] = useState('password')
  const [otpCode, setOtpCode] = useState('')
  const [mfaRequired, setMfaRequired] = useState(false)
  const [otpMode, setOtpMode] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [otpSending, setOtpSending] = useState(false)
  const [trustDevice, setTrustDevice] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorHint, setErrorHint] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const navy = theme.colors.text // #142642 — frame background

  const sendEmailOtp = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password first.')
      return
    }
    setOtpSending(true)
    setError(null)
    setErrorHint(null)
    try {
      await requestEmailOtp(email.trim(), password)
      setOtpMode(true)
      setOtpSent(true)
      setOtpCode('')
    } catch (exception) {
      const resolved = normalizeMobileApiError(exception, 'Unable to send the code.')
      setError(resolved.message)
      setErrorHint(resolved.hint)
    } finally {
      setOtpSending(false)
    }
  }

  const submit = async () => {
    setLoading(true)
    setError(null)
    setErrorHint(null)

    try {
      if (otpMode) {
        await loginWithEmailOtp(email.trim(), password, otpCode.trim(), trustDevice)
      } else {
        await login(email.trim(), password, otpCode || undefined, trustDevice)
      }
    } catch (exception) {
      const resolved = normalizeMobileApiError(exception, 'Unable to login.')
      if (exception instanceof ApiError) {
        const details =
          typeof exception.details === 'object' && exception.details
            ? (exception.details as { mfa_required?: boolean })
            : null
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
    <SafeAreaView style={[styles.root, { backgroundColor: navy }]} edges={['top', 'bottom', 'left', 'right']}>
      {/* Faint 3-square watermark bottom-right (opacity .05) */}
      <View style={styles.watermark} pointerEvents="none">
        <BrandMark size={300} opacity={0.05} />
      </View>

      <View style={styles.body}>
        {/* Brand lockup */}
        <View style={styles.brandBlock}>
          <BrandMark size={46} colored />
          <View style={styles.brandText}>
            <Text style={[styles.brandName, { fontFamily: theme.fonts.sansBold }]}>eSnagging</Text>
            <Text style={[styles.brandTag, { fontFamily: theme.fonts.mono, color: MUTED }]}>
              BY MORGANTI GCC
            </Text>
          </View>
        </View>

        {/* Welcome */}
        <View style={styles.welcome}>
          <Text style={[styles.welcomeTitle, { fontFamily: theme.fonts.sansBold }]}>Welcome back</Text>
          <Text style={[styles.welcomeSub, { fontFamily: theme.fonts.sans, color: SUBTLE }]}>
            Sign in to your site workspace.
          </Text>
        </View>

        {/* Fields */}
        <View style={styles.fields}>
          <View style={styles.field}>
            <Ionicons name="mail-outline" size={18} color={MUTED} />
            <TextInput
              style={[styles.fieldInput, { fontFamily: theme.fonts.sans }]}
              value={email}
              onChangeText={setEmail}
              placeholder="you@morganti.com"
              placeholderTextColor={PLACEHOLDER}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              accessibilityLabel="Email address"
            />
          </View>

          <View style={styles.field}>
            <Ionicons name="lock-closed-outline" size={18} color={MUTED} />
            <TextInput
              style={[styles.fieldInput, styles.passwordInput, { fontFamily: theme.fonts.sans }]}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={PLACEHOLDER}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Password"
            />
            <Pressable
              onPress={() => setShowPassword((current) => !current)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              hitSlop={8}
            >
              <Text style={[styles.showToggle, { fontFamily: theme.fonts.sansSemiBold, color: ACCENT }]}>
                {showPassword ? 'Hide' : 'Show'}
              </Text>
            </Pressable>
          </View>

          {mfaRequired || otpMode ? (
            <View style={styles.field}>
              <Ionicons name="shield-checkmark-outline" size={18} color={MUTED} />
              <TextInput
                style={[styles.fieldInput, { fontFamily: theme.fonts.sans, letterSpacing: 3 }]}
                value={otpCode}
                onChangeText={setOtpCode}
                placeholder={otpMode ? 'Email code' : 'MFA code'}
                placeholderTextColor={PLACEHOLDER}
                keyboardType="number-pad"
                maxLength={8}
                accessibilityLabel={otpMode ? 'Email verification code' : 'MFA code'}
              />
            </View>
          ) : null}

          {otpSent ? (
            <Text style={[styles.mfaLabel, { fontFamily: theme.fonts.sans, color: SUBTLE, marginTop: 6 }]}>
              We emailed a 6-digit code. Enter it above to sign in.
            </Text>
          ) : null}

          {/* Trust device toggle — preserves existing trustDevice wiring */}
          <Pressable
            onPress={() => setTrustDevice((current) => !current)}
            style={styles.trustRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: trustDevice }}
            accessibilityLabel="Trust this device"
            hitSlop={6}
          >
            <Ionicons
              name={trustDevice ? 'checkbox' : 'square-outline'}
              size={18}
              color={trustDevice ? ACCENT : MUTED}
            />
            <Text style={[styles.trustLabel, { fontFamily: theme.fonts.sans, color: SUBTLE }]}>
              Trust this device
            </Text>
          </Pressable>
        </View>

        {/* Error + hint (preserved states) */}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={[styles.errorText, { fontFamily: theme.fonts.sansSemiBold, color: theme.colors.danger }]}>
              {error}
            </Text>
            {errorHint ? (
              <Text style={[styles.errorHint, { fontFamily: theme.fonts.sans, color: SUBTLE }]}>{errorHint}</Text>
            ) : null}
          </View>
        ) : null}

        {/* Sign in */}
        <Pressable
          onPress={() => void submit()}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
          style={({ pressed }) => [styles.signIn, (pressed || loading) && styles.signInPressed]}
        >
          {loading ? (
            <ActivityIndicator color={navy} />
          ) : (
            <Text style={[styles.signInLabel, { fontFamily: theme.fonts.sansBold, color: navy }]}>{otpMode ? 'Verify & sign in' : 'Sign in'}</Text>
          )}
        </Pressable>

        {/* Email one-time-passcode sign-in (item 15) */}
        <Pressable
          onPress={() => void sendEmailOtp()}
          disabled={otpSending}
          accessibilityRole="button"
          accessibilityLabel="Email me a sign-in code"
          style={({ pressed }) => [styles.sso, (pressed || otpSending) && styles.ssoPressed]}
        >
          <Ionicons name="mail-outline" size={17} color={ACCENT} />
          <Text style={[styles.ssoLabel, { fontFamily: theme.fonts.sansSemiBold }]}>
            {otpSending ? 'Sending code…' : otpSent ? 'Resend email code' : 'Email me a sign-in code'}
          </Text>
        </Pressable>

        {/* Face ID + MFA footnote */}
        <View style={styles.footer}>
          <View style={styles.faceIdBlock}>
            <View style={[styles.faceIdButton, { borderColor: FACEID_BORDER }]}>
              <Ionicons name="scan-outline" size={26} color={ACCENT} />
            </View>
            <Text style={[styles.faceIdLabel, { fontFamily: theme.fonts.sans, color: MUTED }]}>Use Face ID</Text>
          </View>
          <View style={styles.mfaRow}>
            <Ionicons name="lock-closed-outline" size={13} color={FOOTNOTE} />
            <Text style={[styles.mfaLabel, { fontFamily: theme.fonts.sans, color: FOOTNOTE }]}>
              Protected by multi-factor authentication
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  watermark: {
    position: 'absolute',
    right: -80,
    bottom: -30,
  },
  body: {
    flex: 1,
    paddingHorizontal: 30,
    paddingTop: 40,
    paddingBottom: 42,
  },
  brandBlock: {
    alignItems: 'center',
    gap: 14,
    marginTop: 40,
  },
  brandText: {
    alignItems: 'center',
  },
  brandName: {
    fontSize: 23,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  brandTag: {
    fontSize: 9.5,
    letterSpacing: 2.3,
    marginTop: 3,
  },
  welcome: {
    marginTop: 40,
  },
  welcomeTitle: {
    fontSize: 25,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  welcomeSub: {
    fontSize: 14,
    marginTop: 7,
  },
  fields: {
    marginTop: 24,
    gap: 13,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: FIELD_BG,
    borderWidth: 1,
    borderColor: FIELD_BORDER,
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    color: '#FFFFFF',
    padding: 0,
  },
  passwordInput: {
    letterSpacing: 1,
  },
  showToggle: {
    fontSize: 13,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 2,
    paddingVertical: 2,
  },
  trustLabel: {
    fontSize: 13.5,
  },
  errorBox: {
    marginTop: 16,
    padding: 13,
    borderRadius: 12,
    backgroundColor: 'rgba(178,59,59,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(178,59,59,0.32)',
    gap: 3,
  },
  errorText: {
    fontSize: 13.5,
  },
  errorHint: {
    fontSize: 12.5,
  },
  signIn: {
    marginTop: 20,
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInPressed: {
    opacity: 0.85,
  },
  signInLabel: {
    fontSize: 15.5,
  },
  sso: {
    marginTop: 12,
    width: '100%',
    paddingVertical: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: OUTLINE_BORDER,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  ssoPressed: {
    opacity: 0.7,
  },
  ssoLabel: {
    fontSize: 14.5,
    color: '#FFFFFF',
  },
  footer: {
    marginTop: 'auto',
    alignItems: 'center',
    gap: 18,
  },
  faceIdBlock: {
    alignItems: 'center',
    gap: 8,
  },
  faceIdButton: {
    width: 52,
    height: 52,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceIdLabel: {
    fontSize: 12.5,
  },
  mfaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mfaLabel: {
    fontSize: 11.5,
  },
})
