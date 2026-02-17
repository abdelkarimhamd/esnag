import { Alert, Box, Button, Grid, Paper, Stack, TextField, Typography } from '@mui/material'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { useAuth } from '../hooks/useAuth'

const resolveLoginError = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { status?: number; data?: { message?: string; mfa_required?: boolean } } }).response

    return {
      message: response?.data?.message ?? fallback,
      mfaRequired: response?.status === 428 || response?.data?.mfa_required === true,
    }
  }

  return {
    message: fallback,
    mfaRequired: false,
  }
}

export const LoginPage = () => {
  const navigate = useNavigate()
  const { authenticated, login } = useAuth()

  const [email, setEmail] = useState('admin@sky.demo')
  const [password, setPassword] = useState('password')
  const [otpCode, setOtpCode] = useState('')
  const [mfaRequired, setMfaRequired] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (authenticated) {
    return <Navigate to="/" replace />
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await login(email, password, otpCode || undefined)
      navigate('/', { replace: true })
    } catch (loginError) {
      const resolved = resolveLoginError(loginError, 'Login failed. Verify your credentials.')
      setError(resolved.message)
      if (resolved.mfaRequired) {
        setMfaRequired(true)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box
      minHeight="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      sx={{
        p: 2,
        background:
          'radial-gradient(circle at 10% 10%, rgba(36, 72, 143, 0.28) 0%, rgba(36, 72, 143, 0) 45%), radial-gradient(circle at 95% 0, rgba(122, 147, 61, 0.2) 0%, rgba(122, 147, 61, 0) 38%), linear-gradient(180deg, #F8FAFF 0%, #EEF3FB 100%)',
      }}
    >
      <Paper sx={{ width: '100%', maxWidth: 920, borderRadius: 4, overflow: 'hidden' }}>
        <Grid container>
          <Grid
            size={{ xs: 12, md: 5 }}
            sx={{
              color: '#FFFFFF',
              p: 4,
              background: 'linear-gradient(145deg, #24488F 0%, #2F8FBE 64%, #7A933D 100%)',
            }}
          >
            <Stack spacing={2}>
              <Box sx={{ bgcolor: 'rgba(255,255,255,0.96)', borderRadius: 2, p: 1.2, width: 'fit-content' }}>
                <BrandLogo sx={{ width: { xs: 180, sm: 220 } }} />
              </Box>
              <Typography sx={{ color: 'rgba(255,255,255,0.9)' }}>
                Inspection and snagging workspace for consultants, contractors, and owners.
              </Typography>

              <Box sx={{ pt: 1.5 }}>
                <Typography variant="subtitle2" sx={{ color: '#FFFFFF' }}>
                  Demo access
                </Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.88)' }}>
                  admin@sky.demo
                </Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.88)' }}>
                  manager@sky.demo
                </Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.88)' }}>
                  Password: password
                </Typography>
              </Box>
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, md: 7 }}>
            <Stack spacing={2.2} component="form" onSubmit={onSubmit} sx={{ p: { xs: 3, md: 4 } }}>
              <Box>
                <Typography variant="h5">Sign in</Typography>
                <Typography color="text.secondary">Use your organization credentials to continue.</Typography>
              </Box>

              {error && <Alert severity={mfaRequired ? 'warning' : 'error'}>{error}</Alert>}

              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />

              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />

              {mfaRequired && (
                <TextField
                  label="MFA Code"
                  type="text"
                  value={otpCode}
                  onChange={(event) => setOtpCode(event.target.value)}
                  inputProps={{ maxLength: 8 }}
                  required
                />
              )}

              <Button type="submit" variant="contained" disabled={submitting} sx={{ height: 44 }}>
                {submitting ? 'Signing in...' : 'Sign in'}
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  )
}
