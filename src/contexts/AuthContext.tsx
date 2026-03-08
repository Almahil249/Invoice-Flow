import React, { createContext, useContext, useState, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

interface UserProfile {
  email: string;
  name: string;
  role: "super_admin" | "admin";
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: UserProfile | null;
  token: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(() => {
    const stored = localStorage.getItem("admin_user");
    return stored ? JSON.parse(stored) : null;
  });

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem("admin_token");
  });

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) return false;

      const data = await res.json();
      const u: UserProfile = {
        email: data.user.email,
        name: data.user.name || data.user.email.split("@")[0],
        role: data.user.role,
      };

      setUser(u);
      setToken(data.token);
      localStorage.setItem("admin_user", JSON.stringify(u));
      localStorage.setItem("admin_token", data.token);
      return true;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("admin_user");
    localStorage.removeItem("admin_token");
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!user && !!token,
        user,
        token,
        login,
        logout,
        isSuperAdmin: user?.role === "super_admin",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
