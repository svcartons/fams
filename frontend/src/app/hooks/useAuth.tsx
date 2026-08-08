import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  completeOnboarding as apiCompleteOnboarding,
  getSession,
  logout as apiLogout,
  setStoredSessionToken,
} from '../../api/client';
import { disconnectSocket } from '../utils/socket';

export interface User {
  id: string;
  username: string;
  name: string;
  role: string;
  avatarUrl?: string;
  hasSeenOnboarding?: boolean;
  hasPassword?: boolean;
  authProvider?: string;
  mfaEnabled?: boolean;
  mfaEnrollmentSuggested?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
  updateUser: (updatedUser: Partial<User>) => void;
  completeOnboarding: () => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean;
  authReady: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    // Kiosk is device-token auth; skip admin session probe (expected 403 without login).
    if (window.location.pathname.startsWith('/kiosk')) {
      setAuthReady(true);
      return;
    }

    const storedUser = localStorage.getItem('fams_user');
    getSession()
      .then(({ user: sessionUser }) => {
        setUser(sessionUser);
        setToken('cookie-session');
        localStorage.setItem('fams_user', JSON.stringify(sessionUser));
      })
      .catch(() => {
        setUser(null);
        setToken(null);
        setStoredSessionToken(null);
        if (storedUser) localStorage.removeItem('fams_user');
      })
      .finally(() => setAuthReady(true));
  }, []);

  const login = (newUser: User, newToken: string) => {
    setUser(newUser);
    setToken('cookie-session');
    // Keep JWT for Authorization header — cookie alone can fail through Vercel→Render rewrites.
    if (newToken) setStoredSessionToken(newToken);
    localStorage.setItem('fams_user', JSON.stringify(newUser));
  };

  const updateUser = (updates: Partial<User>) => {
    if (!user) return;
    const newUser = { ...user, ...updates };
    setUser(newUser);
    localStorage.setItem('fams_user', JSON.stringify(newUser));
  };

  const completeOnboarding = async () => {
    try {
      await apiCompleteOnboarding();
      updateUser({ hasSeenOnboarding: true });
    } catch (e) {
      console.error('Failed to complete onboarding', e);
    }
  };

  const logout = () => {
    apiLogout().catch(() => {}).finally(() => {
      disconnectSocket();
      setUser(null);
      setToken(null);
      setStoredSessionToken(null);
      localStorage.removeItem('fams_user');
      window.location.assign('/');
    });
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      login,
      logout,
      updateUser,
      completeOnboarding,
      isAuthenticated: !!token,
      isAdmin: user?.role === 'admin',
      authReady,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
