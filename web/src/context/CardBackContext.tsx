import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { normalizeCardBack, type CardBackId } from "@/lib/cardBacks";

const Context = createContext<{
  cardBack: CardBackId;
  saving: boolean;
  error: string;
  available: boolean;
  choose: (id: CardBackId) => Promise<void>;
}>({ cardBack: "argyle", saving: false, error: "", available: false, choose: async () => {} });

export function CardBackProvider({ children }: { children: ReactNode }) {
  const { user, loading, updateProfile } = useAuth();
  const accountId = user?.id ?? null;
  const value = normalizeCardBack(user?.card_backs?.golf);
  const available = !!user && !loading;
  const [operation, setOperation] = useState({ accountId, value, saving: false, error: "" });
  const pending = useRef<{ accountId: string } | null>(null);
  const currentAccount = useRef(accountId);
  currentAccount.current = accountId;
  const owned = operation.accountId === accountId;
  const cardBack = available && owned ? operation.value : available ? value : "argyle";
  const saving = owned && operation.saving;
  const error = owned ? operation.error : "";

  useEffect(() => {
    if (!pending.current || pending.current.accountId !== accountId)
      setOperation({ accountId, value, saving: false, error: "" });
  }, [accountId, value]);

  const choose = async (id: CardBackId) => {
    if (!available || !accountId || pending.current?.accountId === accountId) return;
    const request = { accountId };
    pending.current = request;
    setOperation({ accountId, value: normalizeCardBack(id), saving: true, error: "" });
    try {
      const result = await updateProfile({ card_back: { game: "golf", design: id } });
      if (currentAccount.current === accountId && pending.current === request)
        setOperation({ accountId, value: normalizeCardBack(result.user?.card_backs?.golf), saving: false, error: "" });
    } catch (error) {
      if (currentAccount.current === accountId && pending.current === request)
        setOperation({ accountId, value, saving: false, error: error instanceof Error ? error.message : "Unable to save your card back. Please try again." });
    } finally {
      if (pending.current === request) pending.current = null;
    }
  };
  return <Context.Provider value={{ cardBack, saving, error, available, choose }}>{children}</Context.Provider>;
}

export function useCardBack() { return useContext(Context); }
