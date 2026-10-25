import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import {
  createContext,
  useContext,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  type PropsWithChildren,
} from "react";
import { createMobileApi } from "./api";
import type { Database } from "@repo/shared";
import { config } from "./config";
import { useResource, Screen, Copy, Nav, Notice, Busy } from "./ui";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Api = ReturnType<typeof createMobileApi>;
export const guestApi = config.backend ? createMobileApi(config.backend) : null;
type Session = {
  api: Api | null;
  me: Profile | null;
  signedIn: boolean;
  pending: boolean;
  problem: string | null;
  refresh: () => void;
};
const guest: Session = {
  api: guestApi,
  me: null,
  signedIn: false,
  pending: false,
  problem: null,
  refresh: () => {},
};
const Context = createContext<Session>(guest);
function ActiveSession({ children }: PropsWithChildren) {
  const { getToken, isLoaded, userId } = useAuth();
  // Clerk Expo wraps getToken on every render. Keep requests on one client per account.
  const tokenGetter = useRef(getToken);
  useEffect(() => {
    tokenGetter.current = getToken;
  }, [getToken]);
  const accessToken = useCallback(
    () => (userId ? tokenGetter.current() : Promise.resolve(null)),
    [userId],
  );
  const api = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- Supabase stores this callback; only async requests invoke it after render.
      config.backend ? createMobileApi(config.backend, accessToken) : null,
    [accessToken],
  );
  const load = useCallback(async () => {
    if (!isLoaded || !userId || !api) return null;
    const identity = await api.supabase.rpc("ensure_current_profile");
    if (identity.error || !identity.data)
      throw new Error("Account unavailable");
    const row = await api.profiles.get(identity.data);
    if (row.error) throw row.error;
    return { userId, profile: row.data };
  }, [api, isLoaded, userId]);
  const resource = useResource(load);
  const current =
    resource.data && resource.data.userId === userId
      ? resource.data.profile
      : null;
  return (
    <Context.Provider
      value={{
        api,
        me: current,
        signedIn: !!userId,
        pending:
          !isLoaded ||
          (!!userId && (resource.loading || (!current && !resource.error))),
        problem: resource.error,
        refresh: resource.reload,
      }}
    >
      <ContextBoundary key={userId ?? "guest"}>{children}</ContextBoundary>
    </Context.Provider>
  );
}
function ContextBoundary({ children }: PropsWithChildren) {
  return children;
}
export function SessionProvider({ children }: PropsWithChildren) {
  return config.clerkKey ? (
    <ClerkProvider publishableKey={config.clerkKey} tokenCache={tokenCache}>
      <ActiveSession>{children}</ActiveSession>
    </ClerkProvider>
  ) : (
    <Context.Provider value={guest}>{children}</Context.Provider>
  );
}
export function useSession() {
  return useContext(Context);
}
export function useMobileApi() {
  return useSession().api;
}
export function Gate({
  children,
  onboarding = true,
}: PropsWithChildren<{ onboarding?: boolean }>) {
  const s = useSession();
  if (s.pending)
    return (
      <Screen>
        <Busy />
      </Screen>
    );
  if (!s.signedIn)
    return (
      <Screen>
        <Copy>
          Sign in to continue. Public films and people are available without an
          account.
        </Copy>
        <Nav title="Sign in" href="/sign-in" />
      </Screen>
    );
  if (s.problem || !s.me || !s.api)
    return (
      <Screen>
        <Notice
          message={s.problem ?? "Could not initialize your account."}
          retry={s.refresh}
        />
      </Screen>
    );
  if (onboarding && !s.me.onboarding_completed)
    return (
      <Screen>
        <Copy>Finish your creative profile to continue.</Copy>
        <Nav title="Complete your profile" href="/onboarding" />
      </Screen>
    );
  return children;
}
