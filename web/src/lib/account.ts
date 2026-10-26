import type { GameTurnSoundOptions, TurnSoundUpdate } from "@/lib/turnSound";
import type { CardBackDisplayMode } from "@/lib/cardBackDisplay";
export function accountApiBase() {
  return import.meta.env.VITE_ACCOUNT_API_URL?.trim() || "/api/account";
}

export type AccountUser = {
  id: string;
  name: string;
  email?: string;
  email_verified?: boolean;
  profile_icon?: string;
  turn_sound?: Partial<Record<"golf" | "euchre" | "hearts", boolean>>;
  turn_sound_options?: GameTurnSoundOptions;
  card_backs?: Partial<Record<"golf" | "euchre" | "hearts", string>>;
  card_back_display?: Partial<Record<"golf" | "euchre" | "hearts", CardBackDisplayMode>>;
};
export type ProfileUpdate = {
  profile_icon?: string;
  email?: string;
  turn_sound?: TurnSoundUpdate & { game: "golf" | "euchre" | "hearts" };
  card_back?: { game: "golf"; design?: string; display?: CardBackDisplayMode };
};
export type AccountSession = {
  user: AccountUser | null;
  csrf_token: string;
  message?: string;
};
export function createAccountClient(
  base: string,
  fetcher: typeof fetch = fetch,
) {
  const url = base.replace(/\/$/, "");
  const request = async (
    path: string,
    options: RequestInit = {},
  ): Promise<AccountSession> => {
    const response = await fetcher(`${url}${path}`, {
      credentials: "include",
      ...options,
      headers: { Accept: "application/json", ...options.headers },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        typeof data?.error === "string"
          ? data.error
          : response.status === 401
            ? "Check your username and password."
            : "Unable to connect to your account. Please try again.",
      );
    if (
      !data ||
      typeof data.csrf_token !== "string" ||
      (data.user !== null &&
        (!data.user ||
          typeof data.user.id !== "string" ||
          typeof data.user.name !== "string"))
    )
      throw new Error("The account service returned an unexpected response.");
    return data;
  };
  return {
    session: (signal?: AbortSignal) =>
      request("/session", { signal, cache: "no-store" }),
    login: (username: string, password: string, csrf: string) =>
      request("/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({ username, password }),
      }),
    logout: (csrf: string) =>
      request("/logout", {
        method: "POST",
        headers: { "X-CSRF-Token": csrf },
      }),
    profile: (
      data: ProfileUpdate,
      csrf: string,
    ) =>
      request("/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify(data),
      }),
    deleteAccount: (password: string, csrf: string) =>
      request("/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({ password }),
      }),
  };
}
