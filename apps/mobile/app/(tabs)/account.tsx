import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { usePushSignOut } from "../../src/chat-push";
import { useSession, Gate } from "../../src/session";
import {
  PageTitle,
  Kicker,
  Copy,
  Muted,
  Button,
  SectionTitle,
  haptic,
} from "../../src/ui";
import { Avatar, Spectrum } from "../../src/visuals";
import { LogoTile } from "../../src/brand";
import { personRole } from "../../src/data";
import { IconChevron, IconPlus, IconSettings } from "../../src/icons";
import { colors, fonts, radius } from "../../src/theme";

function Row({
  title,
  body,
  icon,
  onPress,
}: {
  title: string;
  body?: string;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptic();
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        padding: 16,
        borderRadius: radius.cardSm,
        backgroundColor: pressed ? colors.graphiteRaised : colors.graphite,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(243,239,233,0.06)",
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text
          style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 16 }}
        >
          {title}
        </Text>
        {body ? (
          <Text
            style={{
              color: colors.muted,
              fontFamily: fonts.regular,
              fontSize: 13,
            }}
          >
            {body}
          </Text>
        ) : null}
      </View>
      <IconChevron size={16} color={colors.faint} />
    </Pressable>
  );
}

export default function Account() {
  const { me, signedIn } = useSession();
  const signOut = usePushSignOut();

  if (!signedIn)
    return (
      <View style={{ flex: 1, backgroundColor: colors.void }}>
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: 24 }}
        >
          <View style={{ borderRadius: 30, overflow: "hidden", height: 260 }}>
            <Spectrum
              kind="hero"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
              }}
            />
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                backgroundColor: "rgba(14,15,14,0.5)",
              }}
            />
            <View
              style={{ flex: 1, padding: 24, justifyContent: "space-between" }}
            >
              <LogoTile size={92} />
              <Text
                style={{
                  color: colors.bone,
                  fontFamily: fonts.extraBold,
                  fontSize: 30,
                  lineHeight: 32,
                  letterSpacing: -1.1,
                }}
              >
                Find your people.{"\n"}
                <Text style={{ color: colors.pink }}>Make your art.</Text>
              </Text>
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Kicker color={colors.pink}>Your creative home</Kicker>
            <PageTitle size={34}>Show your work. Find your people.</PageTitle>
          </View>
          <Copy>
            Sign in to publish films, follow creatives, save what moves you and
            start private conversations. You can browse as a guest.
          </Copy>
          <Button
            title="Sign in or create an account"
            onPress={() => router.push("/sign-in")}
          />
        </ScrollView>
      </View>
    );

  return (
    <Gate onboarding={false}>
      <View style={{ flex: 1, backgroundColor: colors.void }}>
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: 24 }}
        >
          <View style={{ borderRadius: radius.card, overflow: "hidden" }}>
            <View style={{ height: 120 }}>
              <Spectrum
                kind="hero"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                }}
              />
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  backgroundColor: "rgba(14,15,14,0.35)",
                }}
              />
            </View>
            <View
              style={{
                backgroundColor: colors.graphite,
                padding: 20,
                paddingTop: 0,
                gap: 14,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-end",
                  gap: 16,
                  marginTop: -44,
                }}
              >
                <Avatar
                  picKey={me?.profile_pic_key}
                  name={me?.full_name || me?.handle || "a"}
                  size={92}
                  style={{ borderWidth: 4, borderColor: colors.graphite }}
                />
                <View
                  style={{ flex: 1, paddingBottom: 4, gap: 2, minWidth: 0 }}
                >
                  <Text
                    numberOfLines={2}
                    style={{
                      color: colors.text,
                      fontFamily: fonts.extraBold,
                      fontSize: 27,
                      letterSpacing: -0.9,
                    }}
                  >
                    {me?.full_name || `@${me?.handle}`}
                  </Text>
                  <Text
                    style={{
                      color: colors.faint,
                      fontFamily: fonts.regular,
                      fontSize: 13,
                    }}
                  >
                    @{me?.handle}
                  </Text>
                </View>
              </View>
              {me?.roles?.length ? (
                <Text
                  style={{
                    color: colors.textSoft,
                    fontFamily: fonts.regular,
                    fontSize: 15,
                  }}
                >
                  {me.roles.map(personRole).filter(Boolean).join(" · ")}
                </Text>
              ) : null}
              {me?.location_city ? (
                <Text
                  style={{
                    color: colors.muted,
                    fontFamily: fonts.regular,
                    fontSize: 14,
                  }}
                >
                  {me.location_city}
                </Text>
              ) : null}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Edit profile"
                    variant="ghost"
                    size="md"
                    block
                    onPress={() => router.push("/onboarding")}
                  />
                </View>
                {me?.onboarding_completed ? (
                  <View style={{ flex: 1 }}>
                    <Button
                      title="View profile"
                      variant="accent"
                      size="md"
                      block
                      onPress={() =>
                        router.push({
                          pathname: "/u/[handle]",
                          params: { handle: me.handle },
                        })
                      }
                    />
                  </View>
                ) : null}
              </View>
              {!me?.onboarding_completed ? (
                <Button
                  title="Complete onboarding"
                  block
                  onPress={() => router.push("/onboarding")}
                />
              ) : null}
            </View>
          </View>

          <View style={{ gap: 10 }}>
            <SectionTitle size={22}>Creator tools</SectionTitle>
            <Row
              title="Publish and manage films"
              body="Uploads, drafts, posters and credits"
              icon={<IconPlus size={18} color={colors.pink} />}
              onPress={() => router.push("/publish")}
            />
            <Row
              title="Account settings & support"
              body="Profile, privacy, account and help"
              icon={<IconSettings size={18} color={colors.bone} />}
              onPress={() => router.push("/settings")}
            />
          </View>

          <Muted>
            Your profile, films and credits are public. Messages stay private.
          </Muted>

          <Pressable
            accessibilityRole="button"
            onPress={() => void signOut()}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text
              style={{
                color: colors.faint,
                fontFamily: fonts.regular,
                fontSize: 13,
              }}
            >
              Sign out
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </Gate>
  );
}
