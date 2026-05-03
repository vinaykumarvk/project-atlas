import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Shield, BarChart3, Zap, Lock, Eye, EyeOff, Loader2, AlertCircle, Mail } from 'lucide-react';

const quotes = [
  { text: 'Streamline email classification with AI-powered intelligence.', author: 'Efficiency' },
  { text: 'Reduce manual triage time by 80% with automated routing.', author: 'Automation' },
  { text: 'Full audit trail for every decision, every action.', author: 'Compliance' },
  { text: 'Real-time dashboards for operational visibility.', author: 'Insight' },
];

const features = [
  { icon: Shield, label: 'Enterprise Security' },
  { icon: BarChart3, label: 'Real-time Analytics' },
  { icon: Zap, label: 'AI Classification' },
  { icon: Lock, label: 'Audit Compliance' },
];

const REMEMBER_KEY = 'atlas_remember_user';

export function LoginPage() {
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem(REMEMBER_KEY) ?? ''; } catch { return ''; }
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    try { return !!localStorage.getItem(REMEMBER_KEY); } catch { return false; }
  });
  const [error, setError] = useState<string | null>(null);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const showDevCredentials = import.meta.env.VITE_SHOW_DEV_CREDENTIALS === 'true';

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % quotes.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  function clearError() {
    if (error) setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      if (rememberMe) {
        localStorage.setItem(REMEMBER_KEY, email);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  return (
    <main className="flex min-h-dvh">
      {/* Left branding panel — hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-gradient-to-br from-primary via-primary/90 to-accent p-12 text-white">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Project Atlas</h1>
          <p className="mt-2 text-white/70 text-lg">Email Classification Platform</p>
        </div>

        <div className="space-y-8">
          <div className="relative h-24">
            {quotes.map((quote, i) => (
              <blockquote
                key={i}
                className={`absolute inset-0 transition-opacity duration-700 ${
                  i === quoteIndex ? 'opacity-100' : 'opacity-0'
                }`}
              >
                <p className="text-xl font-medium leading-relaxed italic">"{quote.text}"</p>
                <footer className="mt-3 text-sm text-white/60">— {quote.author}</footer>
              </blockquote>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {features.map((feature) => (
              <div
                key={feature.label}
                className="flex items-center gap-3 rounded-lg bg-white/10 px-4 py-3 backdrop-blur-sm"
              >
                <feature.icon className="h-5 w-5 text-white/80" />
                <span className="text-sm font-medium">{feature.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-white/40">&copy; {new Date().getFullYear()} Project Atlas. All rights reserved.</p>
      </div>

      {/* Right login panel */}
      <div className="flex w-full items-center justify-center bg-background p-6 lg:w-1/2">
        <Card className="w-full max-w-[420px] shadow-lg">
          <CardHeader className="space-y-1 text-center">
            <div className="mb-2 lg:hidden">
              <h2 className="text-2xl font-bold text-primary">Project Atlas</h2>
            </div>
            <CardTitle className="text-2xl">Sign in</CardTitle>
            <CardDescription>Enter your credentials to access the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive" role="alert" aria-live="assertive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clearError(); }}
                    placeholder="admin@atlas.dev"
                    required
                    autoComplete="username"
                    autoFocus={!email}
                    disabled={isLoading}
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearError(); }}
                    placeholder="Enter your password"
                    required
                    minLength={6}
                    autoComplete="current-password"
                    autoFocus={!!email}
                    disabled={isLoading}
                    className="pl-9 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                />
                <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">
                  Remember me
                </Label>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

            {showDevCredentials && (
              <div className="mt-6 rounded-md border bg-muted/50 p-3">
                <p className="mb-1 text-xs font-semibold text-muted-foreground">Dev Credentials:</p>
                <code className="text-xs text-muted-foreground">admin@atlas.dev / local dev password</code>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
