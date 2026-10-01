import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { auth, tokens } from "../services/api";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tokens.access) { setLoading(false); return; }
    auth.me().then(setUser).catch(() => tokens.clear()).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    await auth.login(email, password);
    setUser(await auth.me());
  }, []);

  const register = useCallback(async (data) => {
    await auth.register(data);
    await login(data.email, data.password);
  }, [login]);

  const logout = useCallback(() => { auth.logout(); setUser(null); }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
