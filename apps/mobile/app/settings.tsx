import { Linking, View } from "react-native";
import { useCallback, useState } from "react";
import { ChatPushSettings, usePushSignOut } from "../src/chat-push";
import * as Updates from "expo-updates";
import Constants from "expo-constants";
import { colors, radius } from "../src/theme";
import { router } from "expo-router";
import { Gate, useSession } from "../src/session";
import {
  Screen,
  PageTitle,
  SectionTitle,
  Copy,
  Muted,
  Nav,
  Button,
  Notice,
  useAction,
  useResource,
} from "../src/ui";
function Settings() {
  const signOut = usePushSignOut();
  const a = useAction();
  const [updateNote, setUpdateNote] = useState<string | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const { api } = useSession();
  const load = useCallback(async () => {
    const r = await api!.media.storage();
    if (r.error) throw r.error;
    return r.data;
  }, [api]);
  const storage = useResource(load);
  return (
    <Screen>
      <PageTitle>Account & support</PageTitle>
      {storage.data &&
      typeof storage.data === "object" &&
      !Array.isArray(storage.data) ? (
        <Muted>
          Storage:{" "}
          {typeof storage.data.used_bytes === "number"
            ? `${(storage.data.used_bytes / 1024 ** 3).toFixed(2)} GiB used`
            : "usage unavailable"}{" "}
          ·{" "}
          {storage.data.quota_bytes === null
            ? "No account-wide cap"
            : typeof storage.data.quota_bytes === "number"
              ? `${(storage.data.quota_bytes / 1024 ** 3).toFixed(2)} GiB allowance`
              : "allowance unavailable"}
          . Pending uploads and per-file processing limits still apply.
        </Muted>
      ) : null}
      <Notice message={storage.error} retry={storage.reload} />
      <Nav title="Edit creative profile" href="/onboarding" />
      <ChatPushSettings />
      <View
        style={{
          gap: 12,
          padding: 18,
          borderRadius: radius.cardSm,
          backgroundColor: colors.graphite,
        }}
      >
        <SectionTitle>App updates</SectionTitle>
        <Copy>
          Improvements download automatically and take effect when you next
          reopen the app.
        </Copy>
        <Muted>
          Version {Constants.expoConfig?.version ?? "0.1.0"} ·{" "}
          {Updates.isEmbeddedLaunch ? "Store edition" : "Updated edition"}
        </Muted>
        <Button
          title={updateReady ? "Restart to apply update" : "Check for updates"}
          variant="ghost"
          busy={updateBusy}
          disabled={updateBusy || !Updates.isEnabled}
          onPress={() => {
            if (updateReady) {
              void Updates.reloadAsync().catch(() =>
                setUpdateNote("Could not restart. Close and reopen the app."),
              );
              return;
            }
            setUpdateBusy(true);
            void (async () => {
              try {
                const result = await Updates.checkForUpdateAsync();
                if (result.isAvailable || result.isRollBackToEmbedded) {
                  await Updates.fetchUpdateAsync();
                  setUpdateReady(true);
                  setUpdateNote(
                    "Your update is ready. Restart whenever you're ready.",
                  );
                } else setUpdateNote("You're up to date.");
              } catch {
                setUpdateNote(
                  "Couldn't check for updates. Check your connection and try again.",
                );
              } finally {
                setUpdateBusy(false);
              }
            })();
          }}
        />
        {updateNote ? <Copy>{updateNote}</Copy> : null}
      </View>
      <Button
        title="Contact support"
        variant="ghost"
        onPress={() => {
          void Linking.openURL("mailto:office@arcenray.com");
        }}
      />
      <Button
        title="Privacy policy"
        variant="ghost"
        onPress={() => {
          void Linking.openURL("https://arcenray.com/privacy");
        }}
      />
      <Button
        title="Terms"
        variant="ghost"
        onPress={() => {
          void Linking.openURL("https://arcenray.com/terms");
        }}
      />
      <SectionTitle>Account deletion</SectionTitle>
      <Copy>
        Account deletion is available through the website’s secure confirmation
        flow. It requires a recent sign-in there.
      </Copy>
      <Button
        title="Open account deletion on the website"
        variant="ghost"
        onPress={() => {
          void Linking.openURL("https://arcenray.com/settings");
        }}
      />

      <Button
        title={a.busy ? "Signing out…" : "Sign out"}
        disabled={a.busy}
        onPress={() =>
          a.run(async () => {
            await signOut();
            router.replace("/home");
          })
        }
      />
      <Notice message={a.error} />
    </Screen>
  );
}
export default function Route() {
  return (
    <Gate onboarding={false}>
      <Settings />
    </Gate>
  );
}
