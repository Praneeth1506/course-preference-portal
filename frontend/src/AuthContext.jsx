import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  api,
  clearStoredToken,
  getStoredToken,
  storeToken,
} from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getStoredToken());
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(() => Boolean(getStoredToken()));

  const resetSession = useCallback(() => {
    clearStoredToken();
    setToken(null);
    setUser(null);
    setChecking(false);
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => resetSession();
    window.addEventListener("cpp:unauthorized", handleUnauthorized);
    return () =>
      window.removeEventListener("cpp:unauthorized", handleUnauthorized);
  }, [resetSession]);

  useEffect(() => {
    if (!token) {
      setChecking(false);
      setUser(null);
      return undefined;
    }

    let active = true;
    setChecking(true);
    api
      .me()
      .then((data) => {
        if (active) setUser(data);
      })
      .catch(() => {
        if (active) resetSession();
      })
      .finally(() => {
        if (active) setChecking(false);
      });

    return () => {
      active = false;
    };
  }, [token, resetSession]);

  const login = useCallback(async (username, password) => {
    const data = await api.login(username, password);
    storeToken(data.access_token);
    setUser({ username: data.username, role: "admin" });
    setToken(data.access_token);
    setChecking(false);
    return data;
  }, []);

  const logout = useCallback(() => {
    resetSession();
  }, [resetSession]);

  const value = useMemo(
    () => ({
      token,
      user,
      checking,
      isAuthenticated: Boolean(token && user),
      login,
      logout,
    }),
    [token, user, checking, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
