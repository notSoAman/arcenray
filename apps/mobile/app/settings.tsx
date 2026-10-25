import { Linking } from "react-native";
import { useCallback } from "react";
import { useClerk } from "@clerk/expo";
import { router } from "expo-router";
import { Gate, useSession } from "../src/session";
import {
  Screen,
  Title,
  Copy,
  Muted,
  Nav,
  Button,
  Notice,
  useAction,
  useResource,
} from "../src/ui";
function Settings() {
  const { signOut } = useClerk();
  const a = useAction();
  const { api } = useSession();
  const load = useCallback(async () => {
    const r = await api!.media.storage();
    if (r.error) throw r.error;
    return r.data;
  }, [api]);
  const storage = useResource(load);
  return (
    <Screen>
      <Title>Account & support</Title>
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
      <Nav title="Credit invitations" href="/invitations" />
      <Button
        title="Contact support"
        secondary
        onPress={() => {
          void Linking.openURL("mailto:office@arcenray.com");
        }}
      />
      <Button
        title="Privacy policy"
        secondary
        onPress={() => {
          void Linking.openURL("https://arcenray.com/privacy");
        }}
      />
      <Button
        title="Terms"
        secondary
        onPress={() => {
          void Linking.openURL("https://arcenray.com/terms");
        }}
      />
      <Title>Account deletion</Title>
      <Copy>
        Account deletion is available through the website’s secure confirmation
        flow. It requires a recent sign-in there.
      </Copy>
      <Button
        title="Open account deletion on the website"
        secondary
        onPress={() => {
          void Linking.openURL("https://arcenray.com/settings");
        }}
      />
      <Muted>
        Native deletion is not exposed by the current backend contract. No
        account is deleted by opening this link.
      </Muted>
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
