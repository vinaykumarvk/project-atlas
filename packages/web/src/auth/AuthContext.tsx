import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

export interface AuthUser {
  id: string;
  email: string;
  roles: string[];
  region?: string;
}

interface SessionResponse {
  user: AuthUser;
  expires_in: number;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const API_BASE_URL = import.meta.env.VITE_API_URL || '/v1';
const STORAGE_KEY_USER = 'atlas_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY_USER);
    return stored ? JSON.parse(stored) : null;
  });
  const [isLoading, setIsLoading] = useState(false);

  const accessToken = null;
  const isAuthenticated = !!user;

  const storeSession = useCallback((session: SessionResponse) => {
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(session.user));
    setUser(session.user);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_USER);
    setUser(null);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/auth/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.message || 'Login failed');
        }

        const session: SessionResponse = await response.json();
        storeSession(session);
      } finally {
        setIsLoading(false);
      }
    },
    [storeSession],
  );

  const logout = useCallback(() => {
    fetch(`${API_BASE_URL}/auth/session`, {
      method: 'DELETE',
      credentials: 'include',
    }).finally(() => {
      clearSession();
    });
  }, [clearSession]);

  const refreshToken = useCallback(async () => {
    // Session renewal is handled by the httpOnly cookie lifetime on the server.
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated,
        isLoading,
        login,
        logout,
        refreshToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
