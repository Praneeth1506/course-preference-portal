import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  // A token the server just issued (sign-in or password change) needs no
  // /auth/me check; re-checking would briefly unmount the current page.
  const issuedToken = useRef(null);

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
    if (token === issuedToken.current) return undefined;

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
    issuedToken.current = data.access_token;
    storeToken(data.access_token);
    setUser({ username: data.username, role: "admin" });
    setToken(data.access_token);
    setChecking(false);
    return data;
  }, []);

  // Other sessions are signed out by the server; this one gets a new token.
  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const data = await api.changePassword(currentPassword, newPassword);
    issuedToken.current = data.access_token;
    storeToken(data.access_token);
    setToken(data.access_token);
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
      changePassword,
    }),
    [token, user, checking, login, logout, changePassword],
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
