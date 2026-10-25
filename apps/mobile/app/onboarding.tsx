import { useState, useRef, useEffect } from "react";
import { AppState } from "react-native";
import { router } from "expo-router";
import {
  creativeRoles,
  profileInputSchema,
  onboardingChoices,
  validOnboardingChoices,
} from "@repo/shared";
import { Gate, useSession } from "../src/session";
import { selectImage, smallMediaTask } from "../src/media";
import {
  Screen,
  Title,
  Field,
  Copy,
  Muted,
  Button,
  Notice,
  useAction,
} from "../src/ui";
function Editor() {
  const { api, me, refresh } = useSession();
  const [name, setName] = useState(me!.full_name);
  const [handle, setHandle] = useState(me!.handle);
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
      <Title>
        {editing ? "Your creative profile" : "Make yourself known."}
      </Title>
      <Field label="Name" value={name} onChangeText={setName} maxLength={100} />
      <Button
        title="Choose profile picture / retry upload"
        secondary
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
      />
      <Copy>Your roles — choose more than one.</Copy>
      {creativeRoles.map((role) => (
        <Button
          key={role}
          title={`${roles.includes(role) ? "✓ " : ""}${role.replaceAll("_", " ")}`}
          secondary={!roles.includes(role)}
          onPress={() =>
            setRoles((old) =>
              old.includes(role)
                ? old.filter((x) => x !== role)
                : [...old, role],
            )
          }
        />
      ))}
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
          <Title>Your visual vibe.</Title>
          <Muted>Choose exactly three references.</Muted>
          {onboardingChoices.map((c) => (
            <Button
              key={c.id}
              title={`${choices.includes(c.id) ? "✓ " : ""}${c.label} — ${c.detail}`}
              secondary={!choices.includes(c.id)}
              onPress={() =>
                setChoices((old) =>
                  old.includes(c.id)
                    ? old.filter((x) => x !== c.id)
                    : old.length < 3
                      ? [...old, c.id]
                      : old,
                )
              }
            />
          ))}
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
  return (
    <Gate onboarding={false}>
      <Editor />
    </Gate>
  );
}
