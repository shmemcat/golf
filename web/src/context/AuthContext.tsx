import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  accountApiBase,
  createAccountClient,
  type AccountSession,
} from "@/lib/account";
const base = accountApiBase();
const Context = createContext<{
  user: AccountSession["user"];
  configured: boolean;
  loading: boolean;
  error: string;
  login: (name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: {
    profile_icon?: string;
    email?: string;
  }) => Promise<AccountSession>;
  deleteAccount: (password: string) => Promise<AccountSession>;
} | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => (base ? createAccountClient(base) : null));
  const [session, setSession] = useState<AccountSession>({
    user: null,
    csrf_token: "",
  });
  const [loading, setLoading] = useState(!!client);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!client) return;
    const controller = new AbortController();
    client
      .session(controller.signal)
      .then(setSession)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [client]);
  useEffect(() => {
    if (!client) return;
    const refresh = () => {
      if (document.visibilityState !== "hidden")
        client
          .session()
          .then((fresh) => {
            setSession(fresh);
            setError("");
          })
          .catch(() => {});
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, [client]);
  const login = async (username: string, password: string) => {
    if (!client) return;
    setError("");
    setLoading(true);
    try {
      const fresh = await client.session();
      setSession(await client.login(username, password, fresh.csrf_token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  };
  const logout = async () => {
    if (!client) return;
    setError("");
    setLoading(true);
    try {
      const fresh = await client.session();
      setSession(await client.logout(fresh.csrf_token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign out.");
    } finally {
      setLoading(false);
    }
  };
  const updateProfile = async (data: {
    profile_icon?: string;
    email?: string;
  }) => {
    if (!client) throw new Error("Accounts are not configured.");
    const fresh = await client.session();
    if (!session.user || fresh.user?.id !== session.user.id) {
      setSession(fresh);
      throw new Error("Your account changed. Please refresh and try again.");
    }
    const next = await client.profile(data, fresh.csrf_token);
    setSession(next);
    return next;
  };
  const deleteAccount = async (password: string) => {
    if (!client) throw new Error("Accounts are not configured.");
    const fresh = await client.session();
    if (!session.user || fresh.user?.id !== session.user.id) {
      setSession(fresh);
      throw new Error("Your account changed. Please refresh and try again.");
    }
    const next = await client.deleteAccount(password, fresh.csrf_token);
    setError("");
    setSession(next);
    return next;
  };
  return (
    <Context.Provider
      value={{
        user: session.user,
        configured: !!client,
        loading,
        error,
        login,
        logout,
        updateProfile,
        deleteAccount,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing AuthProvider");
  return value;
}
