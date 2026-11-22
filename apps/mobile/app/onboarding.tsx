import { useState, useRef, useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { AppState } from "react-native";
import { router } from "expo-router";
import {
  profileInputSchema,
  onboardingChoices,
  initialProfileHandle,
  validOnboardingChoices,
} from "@repo/shared";
import { useUser } from "@clerk/expo";
import { Gate, useSession } from "../src/session";
import { selectImage, smallMediaTask } from "../src/media";
import {
  Screen,
  PageTitle,
  SectionTitle,
  Field,
  Copy,
  Muted,
  Button,
  Notice,
  Pill,
  Kicker,
  useAction,
} from "../src/ui";
import { roleLabels, roleOptions } from "../src/data";
import { colors, fonts, radius } from "../src/theme";
function Editor({
  clerkName,
  clerkUsername,
}: {
  clerkName?: string | null;
  clerkUsername?: string | null;
}) {
  const { api, me, refresh } = useSession();
  const [name, setName] = useState(me!.full_name || clerkName || "");
  const [handle, setHandle] = useState(() =>
    initialProfileHandle(me!, clerkUsername),
  );
  const [bio, setBio] = useState(me!.bio);
  const [city, setCity] = useState(me!.location_city ?? "");
  const [skills, setSkills] = useState(me!.skills_gear.join(", "));
  const [roles, setRoles] = useState<string[]>(me!.roles);
  const [choices, setChoices] = useState<string[]>([]);
  const [validation, setValidation] = useState<string | null>(null);
  const a = useAction();
  const editing = me!.onboarding_completed;
  const photoTask = useRef<ReturnType<typeof smallMediaTask> | null>(null);
  const [photoStatus, setPhotoStatus] = useState("");
  useEffect(() => {
    const ref = photoTask;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") ref.current?.cancel();
    });
    return () => {
      sub.remove();
      ref.current?.cancel();
    };
  }, []);
  return (
    <Screen>
      <PageTitle>
        {editing ? "Your creative profile" : "Make yourself known."}
      </PageTitle>
      <Field label="Name" value={name} onChangeText={setName} maxLength={100} />
      <Button
        title="Choose profile picture / retry upload"
        variant="ghost"
        disabled={a.busy}
        onPress={() =>
          a.run(async () => {
            if (!photoTask.current) {
              const image = await selectImage("profile_picture");
              if (!image) return;
              photoTask.current = smallMediaTask(
                image,
                "profile_picture",
                api!,
                (next) => setPhotoStatus(`Profile picture: ${next.stage}`),
              );
            }
            const receipt = await photoTask.current.start();
            if (receipt.status !== "ready" || !receipt.public_key)
              throw new Error("Image is not ready");
            setPhotoStatus("Profile picture updated.");
            photoTask.current = null;
          })
        }
      />
      {photoStatus ? <Muted>{photoStatus}</Muted> : null}
      <Field
        label="Handle"
        value={handle}
        onChangeText={setHandle}
        autoCapitalize="none"
        maxLength={32}
        hint="Your sign-in username becomes your public handle. Edit it if you prefer."
      />
      <View style={{ gap: 10 }}>
        <Kicker>People · role</Kicker>
        <Text
          style={{
            color: colors.textSoft,
            fontFamily: fonts.regular,
            fontSize: 14,
          }}
        >
          Choose every craft you work in — roles are additive.
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {roleOptions.map((role) => (
            <Pill
              key={role}
              label={roleLabels[role] ?? role}
              on={roles.includes(role)}
              onPress={() =>
                setRoles((old) =>
                  old.includes(role)
                    ? old.filter((x) => x !== role)
                    : [...old, role],
                )
              }
            />
          ))}
        </View>
      </View>
      <Field label="City" value={city} onChangeText={setCity} maxLength={100} />
      <Field
        label="Bio"
        value={bio}
        onChangeText={setBio}
        multiline
        maxLength={2000}
      />
      <Field
        label="Skills and gear, separated by commas"
        value={skills}
        onChangeText={setSkills}
        multiline
      />
      {!editing ? (
        <>
          <SectionTitle>Your visual vibe.</SectionTitle>
          <Muted>Choose exactly three references that feel like you.</Muted>
          <View style={{ gap: 8 }}>
            {onboardingChoices.map((c) => {
              const on = choices.includes(c.id);
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() =>
                    setChoices((old) =>
                      old.includes(c.id)
                        ? old.filter((x) => x !== c.id)
                        : old.length < 3
                          ? [...old, c.id]
                          : old,
                    )
                  }
                  style={({ pressed }) => ({
                    padding: 16,
                    borderRadius: radius.cardSm,
                    borderWidth: 1,
                    borderColor: on ? colors.pink : colors.line,
                    backgroundColor: on
                      ? "rgba(232,82,122,0.1)"
                      : colors.graphite,
                    gap: 4,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text
                    style={{
                      color: on ? colors.pink : colors.text,
                      fontFamily: fonts.bold,
                      fontSize: 15,
                    }}
                  >
                    {on ? "✓ " : ""}
                    {c.label}
                  </Text>
                  <Text
                    style={{
                      color: colors.muted,
                      fontFamily: fonts.regular,
                      fontSize: 13,
                    }}
                  >
                    {c.detail}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
      <Notice message={validation ?? a.error} />
      <Button
        title={a.busy ? "Saving…" : editing ? "Save profile" : "Find my people"}
        disabled={a.busy}
        onPress={() => {
          const parsed = profileInputSchema.safeParse({
            handle: handle.trim().toLowerCase(),
            full_name: name.trim(),
            bio: bio.trim(),
            roles,
            location_city: city.trim() || null,
            skills_gear: skills
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
            onboarding_completed: editing,
          });
          if (!parsed.success) {
            setValidation(
              parsed.error.issues[0]?.message ?? "Check your profile.",
            );
            return;
          }
          if (!editing && !validOnboardingChoices(choices)) {
            setValidation("Choose exactly three references.");
            return;
          }
          setValidation(null);
          void a.run(async () => {
            const p = await api!.profiles.update(parsed.data);
            if (
              p.error?.code === "23514" &&
              p.error.message.endsWith("is reserved for Arcenray.")
            ) {
              setValidation(p.error.message);
              return;
            }
            if (p.error) throw p.error;
            if (!editing) {
              const seed = await api!.supabase.rpc(
                "set_onboarding_preferences",
                { p_choices: choices },
              );
              if (seed.error) throw seed.error;
              const done = await api!.profiles.update({
                ...parsed.data,
                onboarding_completed: true,
              });
              if (done.error) throw done.error;
            }
            void api!.index("profile", me!.id).catch(() => {});
            refresh();
            router.replace("/home");
          });
        }}
      />
    </Screen>
  );
}
export default function Onboarding() {
  const { user } = useUser();
  return (
    <Gate onboarding={false}>
      <Editor
        key={`${user?.id ?? "pending"}:${user?.username ?? "pending"}`}
        clerkName={user?.fullName}
        clerkUsername={user?.username}
      />
    </Gate>
  );
}
