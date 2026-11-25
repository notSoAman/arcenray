import { useState, useRef, useEffect, useMemo } from "react";
import { Keyboard, Linking, Pressable, Text, View } from "react-native";
import { AppState } from "react-native";
import { router } from "expo-router";
import {
  profileInputSchema,
  onboardingChoices,
  initialProfileHandle,
} from "@repo/shared";
import {
  createCityLoader,
  searchCities,
  type CityRecord,
} from "@repo/shared/locations";
import { useUser } from "@clerk/expo";
import { Gate, useSession } from "../src/session";
import { selectImage, smallMediaTask } from "../src/media";
import {
  Screen,
  PageTitle,
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
import { validateOnboardingStep } from "../src/onboarding-flow";
const loadCities = createCityLoader(
  fetch,
  "https://arcenray.com/data/cities-v1.json",
);
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
  const [step, setStep] = useState(0);
  const [validation, setValidation] = useState<string | null>(null);
  const a = useAction();
  const editing = me!.onboarding_completed;
  const stepCount = editing ? 2 : 3;
  const currentStep = Math.min(step, stepCount - 1);
  const photoTask = useRef<ReturnType<typeof smallMediaTask> | null>(null);
  const [photoStatus, setPhotoStatus] = useState("");
  const [cities, setCities] = useState<CityRecord[]>([]);
  const [cityOpen, setCityOpen] = useState(false);
  const [cityStatus, setCityStatus] = useState("");
  const citySuggestions = useMemo(
    () => searchCities(cities, city, 8),
    [cities, city],
  );
  useEffect(() => {
    if (!cityOpen || city.trim().length < 2 || cities.length) return;
    let cancelled = false;
    loadCities()
      .then((data) => {
        if (!cancelled) {
          setCities(data);
          setCityStatus("");
        }
      })
      .catch(() => {
        if (!cancelled)
          setCityStatus(
            "Suggestions unavailable. You can still type your city.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [cityOpen, city, cities.length]);
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
    <Screen key={currentStep}>
      <PageTitle size={32}>
        {editing
          ? "Your creative profile"
          : currentStep === 0
            ? "Make yourself known."
            : currentStep === 1
              ? "What do you create?"
              : "Set your first mood."}
      </PageTitle>
      <View style={{ gap: 10, marginTop: -12 }}>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Profile setup"
          accessibilityValue={{ min: 1, max: stepCount, now: currentStep + 1 }}
          style={{ flexDirection: "row", gap: 6 }}
        >
          {Array.from({ length: stepCount }, (_, index) => (
            <View
              key={index}
              style={{
                height: 4,
                flex: 1,
                borderRadius: 4,
                backgroundColor:
                  index <= currentStep ? colors.pink : colors.line,
              }}
            />
          ))}
        </View>
        <Muted>
          {editing
            ? `Step ${currentStep + 1} of ${stepCount} · Profile details`
            : currentStep === 0
              ? `Step 1 of ${stepCount} · Your details`
              : currentStep === 1
                ? `Step 2 of ${stepCount} · Your creative work`
                : `Step 3 of ${stepCount} · Your visual references`}
        </Muted>
      </View>
      {currentStep === 0 ? (
        <>
          <Field
            label="Name"
            value={name}
            onChangeText={(value) => {
              setName(value);
              setValidation(null);
            }}
            maxLength={100}
          />
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
            onChangeText={(value) => {
              setHandle(value.toLowerCase().replace(/\s+/g, "_"));
              setValidation(null);
            }}
            autoCapitalize="none"
            maxLength={32}
            hint="Your sign-in username becomes your public handle. Edit it if you prefer."
          />
        </>
      ) : null}
      {currentStep === 1 ? (
        <>
          <View style={{ gap: 8 }}>
            <Field
              label="City (optional)"
              value={city}
              onChangeText={(value) => {
                setCity(value);
                setCityOpen(true);
                setCityStatus("");
                setValidation(null);
              }}
              onFocus={() => setCityOpen(true)}
              maxLength={100}
              autoComplete="off"
              placeholder="e.g. Bengaluru"
              hint="Helps nearby creatives find you. You can enter any city."
            />
            {cityOpen && city.trim().length >= 2 ? (
              <View
                accessibilityRole="list"
                style={{
                  backgroundColor: colors.graphite,
                  borderRadius: radius.cardSm,
                  borderWidth: 1,
                  borderColor: colors.line,
                  overflow: "hidden",
                }}
              >
                {citySuggestions.map((suggestion) => (
                  <Pressable
                    key={suggestion.id}
                    accessibilityRole="button"
                    accessibilityLabel={suggestion.label}
                    onPress={() => {
                      setCity(suggestion.value);
                      setCityOpen(false);
                      Keyboard.dismiss();
                    }}
                    style={({ pressed }) => ({
                      minHeight: 48,
                      justifyContent: "center",
                      paddingHorizontal: 14,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.line,
                      backgroundColor: pressed
                        ? colors.graphiteRaised
                        : "transparent",
                    })}
                  >
                    <Text
                      style={{ color: colors.text, fontFamily: fonts.regular }}
                    >
                      {suggestion.label}
                    </Text>
                  </Pressable>
                ))}
                <Muted>
                  {cityStatus ||
                    (cities.length
                      ? citySuggestions.length
                        ? "Choose a city or keep your own entry."
                        : "No matching city. You can enter it manually."
                      : "Loading city suggestions…")}
                </Muted>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="GeoNames city data attribution"
                  onPress={() =>
                    void Linking.openURL("https://www.geonames.org/").catch(
                      () => {},
                    )
                  }
                  style={{ paddingHorizontal: 12, paddingBottom: 8 }}
                >
                  <Text
                    style={{
                      color: colors.faint,
                      fontFamily: fonts.regular,
                      fontSize: 12,
                    }}
                  >
                    City data: GeoNames · CC BY 4.0
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          <View style={{ gap: 10 }}>
            <Kicker>People · role</Kicker>
            <Muted>Roles are additive. Select every craft that fits.</Muted>
            <Muted>
              Choose at least one role · {roles.length} of {roleOptions.length}{" "}
              selected
            </Muted>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {roleOptions.map((role) => (
                <Pill
                  key={role}
                  label={roleLabels[role] ?? role}
                  on={roles.includes(role)}
                  disabled={
                    !roles.includes(role) && roles.length >= roleOptions.length
                  }
                  onPress={() => {
                    setRoles((old) =>
                      old.includes(role)
                        ? old.filter((x) => x !== role)
                        : [...old, role],
                    );
                    setValidation(null);
                  }}
                />
              ))}
            </View>
          </View>
          <Field
            label="Bio"
            value={bio}
            onChangeText={setBio}
            onFocus={() => setCityOpen(false)}
            multiline
            maxLength={2000}
          />
          <Field
            label="Skills & gear (optional)"
            value={skills}
            onChangeText={(value) => {
              setSkills(value);
              setValidation(null);
            }}
            onFocus={() => setCityOpen(false)}
            multiline
            hint={`${
              skills
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean).length
            } / 30 · Up to 30 items, 80 characters each. Separate with commas.`}
          />
        </>
      ) : null}
      {!editing ? (
        currentStep === 2 ? (
          <>
            <Muted>Choose exactly 3 of these 12 mood references.</Muted>
            <Text
              accessibilityLiveRegion="polite"
              style={{ color: colors.pink, fontFamily: fonts.bold }}
            >
              {choices.length} of 3 selected
              {choices.length === 3 ? " · Deselect a card to change." : ""}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {onboardingChoices.map((c) => {
                const on = choices.includes(c.id);
                return (
                  <Pressable
                    key={c.id}
                    accessibilityRole="checkbox"
                    accessibilityLabel={c.label}
                    accessibilityHint={c.detail}
                    accessibilityState={{
                      checked: on,
                      disabled: !on && choices.length === 3,
                    }}
                    disabled={!on && choices.length === 3}
                    onPress={() => {
                      setChoices((old) =>
                        old.includes(c.id)
                          ? old.filter((x) => x !== c.id)
                          : old.length < 3
                            ? [...old, c.id]
                            : old,
                      );
                      setValidation(null);
                    }}
                    style={({ pressed }) => ({
                      padding: 12,
                      width: "47%",
                      minHeight: 104,
                      borderRadius: radius.cardSm,
                      borderColor: on ? colors.pink : colors.line,
                      borderWidth: on ? 2 : 1,
                      backgroundColor: on
                        ? "rgba(232,82,122,0.16)"
                        : colors.graphite,
                      gap: 4,
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <Text
                      style={{
                        color: on ? colors.bone : colors.text,
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
        ) : null
      ) : null}
      <Notice message={validation ?? a.error} />
      {currentStep > 0 ? (
        <Button
          title="Back"
          variant="ghost"
          disabled={a.busy}
          onPress={() => {
            setValidation(null);
            Keyboard.dismiss();
            setStep(currentStep - 1);
          }}
        />
      ) : null}
      <Button
        title={
          a.busy
            ? "Saving…"
            : currentStep < stepCount - 1
              ? "Continue"
              : editing
                ? "Save profile"
                : currentStep === 2 && choices.length < 3
                  ? `Choose 3 · ${choices.length}/3`
                  : "Find my people"
        }
        disabled={a.busy}
        onPress={() => {
          if (currentStep < stepCount - 1) {
            const stepError = validateOnboardingStep(currentStep, {
              name,
              handle,
              roles,
              choices,
              skills: skills
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            });
            if (stepError) {
              setValidation(stepError);
              return;
            }
            setValidation(null);
            Keyboard.dismiss();
            setStep(currentStep + 1);
            return;
          }
          const finalStepError = validateOnboardingStep(currentStep, {
            name,
            handle,
            roles,
            choices,
            skills: skills
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          });
          if (finalStepError) {
            setValidation(finalStepError);
            return;
          }
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
            const issue = parsed.error.issues[0];
            const field = issue?.path[0];
            if (field === "handle") {
              setStep(0);
              setValidation(
                "Choose a handle with 3–32 letters, numbers or underscores.",
              );
            } else if (field === "roles") {
              setStep(1);
              setValidation("Choose at least one creative role.");
            } else if (field === "skills_gear") {
              setStep(1);
              setValidation(
                "Keep each skill or interest under 80 characters, with up to 30 items.",
              );
            } else if (field === "full_name") {
              setStep(0);
              setValidation("Add your name to continue.");
            } else {
              setStep(1);
              setValidation("Check your profile details and try again.");
            }
            return;
          }
          setValidation(null);
          void a.run(async () => {
            const p = await api!.profiles.update(parsed.data);
            if (
              p.error?.code === "23514" &&
              p.error.message.endsWith("is reserved for Arcenray.")
            ) {
              setStep(0);
              setValidation(p.error.message);
              return;
            }
            if (p.error?.code === "23505") {
              setStep(0);
              setValidation("That handle is already in use. Choose another.");
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
