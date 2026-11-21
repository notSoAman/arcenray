import {
  useEffect,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import * as Updates from "expo-updates";
import { downloadAppUpdate, prepareStartupUpdate } from "./update-delivery";

/** Never reload a running player, message draft or upload to apply an update. */
export function AppUpdates({
  children,
  fallback,
}: PropsWithChildren<{ fallback: ReactNode }>) {
  const [ready, setReady] = useState(!Updates.isEnabled);
  useEffect(() => {
    let checking = false;
    let lastCheck = Date.now();
    let mounted = true;
    async function check() {
      if (!mounted || checking || Date.now() - lastCheck < 15 * 60 * 1000)
        return;
      checking = true;
      lastCheck = Date.now();
      try {
        await downloadAppUpdate(Updates);
      } finally {
        checking = false;
      }
    }
    // This window ends before forms, drafts or players can be interacted with.
    if (Updates.isEnabled)
      void (async () => {
        try {
          const downloaded = await prepareStartupUpdate(Updates);
          if (downloaded && mounted) await Updates.reloadAsync();
        } catch {
          /* Start with the cached bundle when offline or a reload fails. */
        } finally {
          if (mounted) setReady(true);
          lastCheck = Date.now();
        }
      })();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return ready ? children : fallback;
}
