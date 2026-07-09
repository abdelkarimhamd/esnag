import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { isApiStatus, normalizeApiError } from '../utils/apiError';
import { BRAND, FONT_MONO, FONT_SANS } from '../theme';

// ---------------------------------------------------------------------------
// Frame 1d — Login (brand-forward entry).
// Two panels: a fixed navy brand rail (left) telling the Find it / Fix it /
// Sign it off lifecycle story with the snag status-colour palette, and a clean
// white sign-in form (right) centred on a ~372px column. All auth behaviour
// (login / mfa / error / submitting) is preserved verbatim.
// ---------------------------------------------------------------------------

// Lifecycle value-props on the rail. The three dots encode the status colour
// progression capture (teal) -> assign (mid-blue) -> close (light green),
// mirroring the snag lifecycle scale.
const VALUE_PROPS = [
  { color: BRAND.teal, label: 'Capture defects straight on the drawing' },
  { color: '#4F84C4', label: 'Assign, track and dispatch to the right trade' },
  { color: '#9DB86A', label: 'Close out with photo evidence and sign-off' },
];

// The tri-square brand mark: three rounded squares in an "L" (top-left,
// top-right, bottom-left; bottom-right intentionally empty). `colors` lets the
// same glyph render full-colour on the rail, monochrome-white as a watermark,
// or a compact version for the SSO button.
const TriSquareMark = ({ size = 34, sq = 14.5, rx = 3.2, colors, ...rest }) => {
  const gap = 34 - sq * 2; // remaining space between the two columns/rows
  const p2 = sq + gap;
  return (
    <Box component="svg" viewBox="0 0 34 34" width={size} height={size} aria-hidden {...rest}>
      <rect x="0" y="0" width={sq} height={sq} rx={rx} fill={colors[0]} />
      <rect x={p2} y="0" width={sq} height={sq} rx={rx} fill={colors[1]} />
      <rect x="0" y={p2} width={sq} height={sq} rx={rx} fill={colors[2]} />
    </Box>
  );
};

// Leading field icons (envelope / padlock), 24-unit viewBox line glyphs.
const EnvelopeIcon = ({ size = 17, stroke = BRAND.muted, ...rest }) => (
  <Box
    component="svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke={stroke}
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    sx={{ flex: 'none' }}
    {...rest}
  >
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </Box>
);

const LockIcon = ({ size = 17, stroke = BRAND.muted, sx, ...rest }) => (
  <Box
    component="svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke={stroke}
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    sx={{ flex: 'none', ...sx }}
    {...rest}
  >
    <rect x="4" y="10" width="16" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Box>
);

// Staggered slide+fade entrance. Base state is visible so the reduced-motion
// backstop (which cancels animations) never leaves content hidden.
const riseSx = (delay = 0) => ({
  '@keyframes kineticRise': {
    '0%': { opacity: 0, transform: 'translateY(12px)' },
    '100%': { opacity: 1, transform: 'translateY(0)' },
  },
  animation: `kineticRise 560ms cubic-bezier(0.16, 0.84, 0.44, 1) ${delay}ms both`,
});

export const LoginPage = () => {
  const navigate = useNavigate();
  const { authenticated, login, requestEmailOtp, loginWithEmailOtp } = useAuth();
  const [email, setEmail] = useState('admin@sky.demo');
  const [password, setPassword] = useState('password');
  const [otpCode, setOtpCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [otpMode, setOtpMode] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  if (authenticated) {
    return <Navigate to="/" replace />;
  }

  const sendEmailOtp = async () => {
    if (!email || !password) {
      setError('Enter your email and password first.');
      return;
    }
    setOtpSending(true);
    setError(null);
    try {
      await requestEmailOtp(email, password);
      setOtpMode(true);
      setOtpSent(true);
      setOtpCode('');
    } catch (otpError) {
      setError(normalizeApiError(otpError, 'Unable to send the code.').message);
    } finally {
      setOtpSending(false);
    }
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (otpMode) {
        await loginWithEmailOtp(email, password, otpCode.trim());
      } else {
        await login(email, password, otpCode || undefined);
      }
      navigate('/', { replace: true });
    } catch (loginError) {
      const resolved = normalizeApiError(loginError, 'Login failed. Verify your credentials.');
      setError(resolved.message);
      const backendMfaRequired =
        typeof loginError === 'object' &&
        loginError &&
        'response' in loginError &&
        loginError.response?.data?.mfa_required === true;
      if (isApiStatus(loginError, 428) || backendMfaRequired) {
        setMfaRequired(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Field label: mono, small, letter-spaced, muted (EMAIL / PASSWORD).
  const fieldLabelSx = {
    fontFamily: FONT_MONO,
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: '0.12em',
    color: BRAND.muted,
    lineHeight: 1.2,
  };

  // Input shell: the outlined field is styled to the mockup's pill-radius shell
  // with a leading icon adornment. Resting border is soft; focus flips to a
  // 1.5px navy border + navy focus ring.
  const inputShellSx = {
    mt: 1,
    '& .MuiOutlinedInput-root': {
      backgroundColor: '#fff',
      borderRadius: '11px',
      paddingInlineStart: '14px',
      transition: 'box-shadow 200ms ease, border-color 200ms ease',
      '& fieldset': { borderColor: 'rgba(20,38,66,0.14)', borderWidth: 1 },
      '&:hover fieldset': { borderColor: 'rgba(36,72,143,0.4)' },
      '&.Mui-focused fieldset': { borderColor: '#24488F', borderWidth: 1.5 },
      '&.Mui-focused': { boxShadow: '0 0 0 3px rgba(36,72,143,0.1)' },
    },
    '& .MuiOutlinedInput-input': {
      fontFamily: FONT_SANS,
      fontSize: 14,
      color: BRAND.ink,
      padding: '12px 14px 12px 10px',
    },
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        // Rail (left) + form (right); flips naturally under theme RTL direction.
        background: BRAND.panel,
        overflow: 'hidden',
        // Reduced-motion backstop: neutralise every animation inside.
        '@media (prefers-reduced-motion: reduce)': {
          '& *, & *::before, & *::after': {
            animation: 'none !important',
            transition: 'none !important',
          },
        },
      }}
    >
      {/* ======================= A. Brand rail (left) ======================= */}
      <Box
        component="aside"
        sx={{
          position: 'relative',
          flex: 'none',
          width: { xs: '100%', md: 600 },
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          overflow: 'hidden',
          p: '48px 52px',
          background: BRAND.ink,
        }}
      >
        {/* A1. Decorative watermark glyph */}
        <TriSquareMark
          size={360}
          colors={['#FFFFFF', '#FFFFFF', '#FFFFFF']}
          sx={{
            position: 'absolute',
            insetInlineEnd: -70,
            bottom: -60,
            opacity: 0.05,
            pointerEvents: 'none',
          }}
        />

        {/* A2. Logo lockup (top) */}
        <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '13px', ...riseSx(80) }}>
          <TriSquareMark colors={['#6E8C3A', '#4F84C4', '#2F8FBE']} />
          <Box>
            <Typography
              component="div"
              sx={{ fontFamily: FONT_SANS, fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em', lineHeight: 1.1 }}
            >
              eSnagging
            </Typography>
            <Box
              component="div"
              dir="ltr"
              sx={{ fontFamily: FONT_MONO, fontSize: 9.5, fontWeight: 500, letterSpacing: '0.24em', color: '#8FA0BE', mt: '3px' }}
            >
              BY MORGANTI GCC
            </Box>
          </Box>
        </Box>

        {/* A3. Hero copy block (middle) */}
        <Box sx={{ position: 'relative', ...riseSx(160) }}>
          <Typography
            component="h1"
            sx={{
              fontFamily: FONT_SANS,
              fontSize: 40,
              fontWeight: 700,
              color: '#fff',
              letterSpacing: '-0.03em',
              lineHeight: 1.08,
              m: 0,
            }}
          >
            Find it.
            <br />
            Fix it.
            <br />
            Sign it off.
          </Typography>
          <Typography
            component="p"
            sx={{ fontFamily: FONT_SANS, fontSize: 15, color: '#B7C4D9', lineHeight: 1.55, maxWidth: 380, m: '22px 0 30px' }}
          >
            The quality &amp; snag lifecycle workspace for every Morganti site — from the first pin on a drawing to a fully
            evidenced closeout.
          </Typography>

          {/* Value-prop rows — lifecycle colour story */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
            {VALUE_PROPS.map((prop) => (
              <Box key={prop.label} sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', flex: 'none', background: prop.color }} />
                <Typography component="span" sx={{ fontFamily: FONT_SANS, fontSize: 14, color: '#D6DEEA' }}>
                  {prop.label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* A4. Rail footer */}
        <Box
          component="div"
          dir="ltr"
          sx={{ position: 'relative', fontFamily: FONT_MONO, fontSize: 11, color: '#6E7F9E', letterSpacing: '0.04em', ...riseSx(240) }}
        >
          © 2026 MORGANTI GCC · v4.0
        </Box>
      </Box>

      {/* ==================== B. Sign-in panel (right) ===================== */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: 3, md: 5 },
          background: BRAND.panel,
        }}
      >
        <Stack component="form" onSubmit={onSubmit} spacing={0} sx={{ width: 372, maxWidth: '100%' }}>
          {/* B1. Form header */}
          <Box sx={riseSx(60)}>
            <Typography
              component="h2"
              sx={{ fontFamily: FONT_SANS, fontSize: 27, fontWeight: 700, letterSpacing: '-0.02em', color: BRAND.ink, m: 0 }}
            >
              Welcome back
            </Typography>
            <Typography component="p" sx={{ fontFamily: FONT_SANS, fontSize: 14, color: BRAND.muted, m: '8px 0 30px' }}>
              Sign in to your Morganti workspace.
            </Typography>
          </Box>

          {error && (
            <Alert
              severity={mfaRequired ? 'warning' : 'error'}
              sx={{
                mb: 2.5,
                borderRadius: '11px',
                fontFamily: FONT_SANS,
                '@keyframes alertIn': {
                  '0%': { opacity: 0, transform: 'translateY(-6px)' },
                  '100%': { opacity: 1, transform: 'translateY(0)' },
                },
                animation: 'alertIn 260ms ease-out both',
                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
              }}
            >
              {error}
            </Alert>
          )}

          {/* B2. Email field */}
          <Box sx={{ mb: '18px', ...riseSx(140) }}>
            <Typography component="label" htmlFor="login-email" sx={fieldLabelSx}>
              EMAIL
            </Typography>
            <TextField
              id="login-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              fullWidth
              autoComplete="email"
              InputProps={{
                startAdornment: <EnvelopeIcon />,
              }}
              inputProps={{ dir: 'ltr' }}
              sx={inputShellSx}
            />
          </Box>

          {/* B3. Password field */}
          <Box sx={{ mb: '14px', ...riseSx(200) }}>
            <Typography component="label" htmlFor="login-password" sx={fieldLabelSx}>
              PASSWORD
            </Typography>
            <TextField
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              fullWidth
              autoComplete="current-password"
              InputProps={{
                startAdornment: <LockIcon />,
                endAdornment: (
                  <Box
                    component="span"
                    role="button"
                    tabIndex={0}
                    onClick={() => setShowPassword((prev) => !prev)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setShowPassword((prev) => !prev);
                      }
                    }}
                    sx={{
                      cursor: 'pointer',
                      userSelect: 'none',
                      fontFamily: FONT_SANS,
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: '#24488F',
                      flex: 'none',
                      pl: 1,
                      '&:hover': { color: BRAND.navyDark },
                    }}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </Box>
                ),
              }}
              sx={inputShellSx}
            />
          </Box>

          {/* MFA reveal — inserted above the options row / Sign in button on
              428 / mfa_required, preserving otpCode + maxLength 8 behaviour. */}
          {(mfaRequired || otpMode) && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateRows: '1fr',
                mb: '14px',
                '@keyframes mfaReveal': {
                  '0%': { gridTemplateRows: '0fr', opacity: 0, transform: 'translateY(-6px)' },
                  '100%': { gridTemplateRows: '1fr', opacity: 1, transform: 'translateY(0)' },
                },
                animation: 'mfaReveal 380ms cubic-bezier(0.16, 0.84, 0.44, 1) both',
                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
              }}
            >
              <Box sx={{ overflow: 'hidden', minHeight: 0 }}>
                <Typography component="label" htmlFor="login-mfa" sx={fieldLabelSx}>
                  {otpMode ? 'Email Code' : 'MFA Code'}
                </Typography>
                <TextField
                  id="login-mfa"
                  label={otpMode ? 'Email Code' : 'MFA Code'}
                  type="text"
                  value={otpCode}
                  onChange={(event) => setOtpCode(event.target.value)}
                  inputProps={{ maxLength: 8, dir: 'ltr' }}
                  required
                  fullWidth
                  sx={{ ...inputShellSx, '& .MuiInputLabel-root': { display: 'none' } }}
                />
                <Typography sx={{ fontFamily: FONT_SANS, fontSize: 12, color: BRAND.muted, mt: 1 }}>
                  {otpMode
                    ? 'We emailed a 6-digit code. Enter it to sign in.'
                    : 'Code required for this account. Enter the one-time code from your authenticator app.'}
                </Typography>
              </Box>
            </Box>
          )}

          {/* B4. Options row — keep signed in / forgot password */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: '24px', ...riseSx(240) }}>
            <Box
              component="span"
              role="checkbox"
              aria-checked={rememberMe}
              tabIndex={0}
              onClick={() => setRememberMe((prev) => !prev)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setRememberMe((prev) => !prev);
                }
              }}
              sx={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}
            >
              <Box
                component="span"
                sx={{
                  width: 17,
                  height: 17,
                  borderRadius: '5px',
                  flex: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: rememberMe ? '#24488F' : '#fff',
                  border: rememberMe ? '1px solid #24488F' : '1px solid rgba(20,38,66,0.14)',
                  transition: 'background 160ms ease, border-color 160ms ease',
                }}
              >
                {rememberMe && (
                  <Box component="svg" viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m5 12 5 5 9-10" />
                  </Box>
                )}
              </Box>
              <Typography component="span" sx={{ fontFamily: FONT_SANS, fontSize: 13, color: BRAND.inkSoft }}>
                Keep me signed in
              </Typography>
            </Box>
            <Box
              component="a"
              href="#"
              onClick={(event) => event.preventDefault()}
              sx={{
                fontFamily: FONT_SANS,
                fontSize: 13,
                fontWeight: 600,
                color: '#24488F',
                textDecoration: 'none',
                '&:hover': { color: BRAND.navyDark, textDecoration: 'underline' },
              }}
            >
              Forgot password?
            </Box>
          </Box>

          {/* B5. Primary "Sign in" button */}
          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={submitting}
            sx={{
              position: 'relative',
              overflow: 'hidden',
              p: '13px',
              borderRadius: '11px',
              border: 'none',
              background: '#24488F',
              color: '#fff',
              fontFamily: FONT_SANS,
              fontSize: 14.5,
              fontWeight: 600,
              textTransform: 'none',
              boxShadow: '0 12px 24px -12px rgba(36,72,143,0.7)',
              transition: 'transform 160ms ease, box-shadow 200ms ease, background 160ms ease',
              ...riseSx(280),
              '&:hover': {
                background: BRAND.navyDark,
                transform: 'translateY(-1px)',
                boxShadow: '0 16px 30px -12px rgba(36,72,143,0.8)',
              },
              '&:active': { transform: 'translateY(0)' },
              '&.Mui-disabled': { color: 'rgba(255,255,255,0.9)', background: BRAND.navyLight },
              // Loading affordance: a status-colour rail sweep along the base.
              '&::after': submitting
                ? {
                    content: '""',
                    position: 'absolute',
                    left: 0,
                    bottom: 0,
                    height: 3,
                    width: '40%',
                    borderRadius: 3,
                    background: `linear-gradient(90deg, ${BRAND.amber}, ${BRAND.teal}, ${BRAND.green})`,
                    '@keyframes railLoad': {
                      '0%': { left: '-40%' },
                      '100%': { left: '100%' },
                    },
                    animation: 'railLoad 1100ms ease-in-out infinite',
                  }
                : {},
              '@media (prefers-reduced-motion: reduce)': {
                transition: 'none',
                animation: 'none',
                '&:hover': { transform: 'none' },
                '&::after': { animation: 'none' },
              },
            }}
          >
            {submitting ? 'Signing in...' : otpMode ? 'Verify & sign in' : 'Sign in'}
          </Button>

          {/* B6. "or" divider */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '14px', m: '22px 0' }}>
            <Box component="span" sx={{ flex: 1, height: '1px', background: 'rgba(20,38,66,0.1)' }} />
            <Typography component="span" sx={{ fontFamily: FONT_SANS, fontSize: 12, color: '#B6BFCC' }}>
              or
            </Typography>
            <Box component="span" sx={{ flex: 1, height: '1px', background: 'rgba(20,38,66,0.1)' }} />
          </Box>

          {/* B7. SSO button */}
          <Button
            type="button"
            variant="outlined"
            fullWidth
            sx={{
              p: '12px',
              borderRadius: '11px',
              border: '1px solid rgba(20,38,66,0.16)',
              background: '#fff',
              color: BRAND.ink,
              fontFamily: FONT_SANS,
              fontSize: 14,
              fontWeight: 600,
              textTransform: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              boxShadow: 'none',
              '&:hover': { border: '1px solid rgba(20,38,66,0.28)', background: '#fff', boxShadow: 'none' },
            }}
          >
            <TriSquareMark size={17} sq={13} rx={2.5} colors={['#6E8C3A', '#24488F', '#2F8FBE']} />
            Continue with Morganti SSO
          </Button>

          {/* Email one-time-passcode sign-in (item 15) */}
          <Button
            type="button"
            variant="text"
            fullWidth
            disabled={otpSending}
            onClick={() => void sendEmailOtp()}
            sx={{
              mt: '10px',
              p: '10px',
              borderRadius: '11px',
              color: BRAND.navy,
              fontFamily: FONT_SANS,
              fontSize: 13.5,
              fontWeight: 600,
              textTransform: 'none',
              '&:hover': { background: 'rgba(36,72,143,0.06)' },
            }}
          >
            {otpSending ? 'Sending code…' : otpSent ? 'Resend email code' : 'Email me a sign-in code'}
          </Button>

          {/* B8. MFA reassurance footnote */}
          <Typography
            component="p"
            sx={{ fontFamily: FONT_SANS, fontSize: 12, color: '#A6B0BF', textAlign: 'center', lineHeight: 1.5, m: '26px 0 0' }}
          >
            <LockIcon size={13} stroke="#A6B0BF" sx={{ display: 'inline-block', verticalAlign: -2, marginInlineEnd: '3px' }} />
            Protected by multi-factor authentication
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
};
