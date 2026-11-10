import { View, Text } from "react-native";
import { useSession, Gate } from "../../src/session";
import { Screen, PageTitle, Copy, Muted, Nav, Kicker } from "../../src/ui";
import { Avatar, Spectrum } from "../../src/visuals";
import { LogoTile } from "../../src/brand";
import { colors, fonts, radius } from "../../src/theme";

export default function Account() {
  const { me, signedIn } = useSession();

  if (!signedIn)
    return (
      <Screen>
        <LogoTile size={96} />
        <View style={{ gap: 8 }}>
          <Kicker color={colors.pink}>Your creative home</Kicker>
          <PageTitle>Show your work. Find your people.</PageTitle>
        </View>
        <Copy>
          Sign in to publish films, follow creatives and start conversations.
          You can browse as a guest.
        </Copy>
        <Nav title="Sign in or create an account" href="/sign-in" />
      </Screen>
    );

  return (
    <Gate onboarding={false}>
      <Screen>
        <View style={{ borderRadius: radius.card, overflow: "hidden" }}>
          <View style={{ height: 120 }}>
            <Spectrum kind="hero" />
          </View>
          <View style={{ backgroundColor: colors.graphite, padding: 20, gap: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 16, marginTop: -48 }}>
              <Avatar
                picKey={me?.profile_pic_key}
                name={me?.full_name || me?.handle || "a"}
                size={88}
                style={{ borderWidth: 4, borderColor: colors.graphite }}
              />
              <View style={{ flex: 1, paddingBottom: 4, gap: 2 }}>
                <Text style={{ color: colors.text, fontFamily: fonts.extraBold, fontSize: 26, letterSpacing: -0.8 }}>
                  {me?.full_name || `@${me?.handle}`}
                </Text>
                <Text style={{ color: colors.faint, fontFamily: fonts.regular, fontSize: 14 }}>
                  @{me?.handle}
                </Text>
              </View>
            </View>
            {me?.roles?.length ? (
              <Text style={{ color: colors.textSoft, fontFamily: fonts.regular, fontSize: 15 }}>
                {me.roles.join(" · ")}
              </Text>
            ) : null}
            {me?.location_city ? (
              <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 14 }}>
                {me.location_city}
              </Text>
            ) : null}
          </View>
        </View>

        {me?.onboarding_completed ? (
          <Nav
            title="View your profile"
            href={{ pathname: "/u/[handle]", params: { handle: me.handle } }}
          />
        ) : null}
        <Nav
          title={
            me?.onboarding_completed ? "Edit your profile" : "Complete onboarding"
          }
          href="/onboarding"
        />
        <Nav title="Publish and manage films" href="/publish" />
        <Nav title="Account settings & support" href="/settings" />
        <Muted>
          Your profile, films and credits are public. Messages stay private.
        </Muted>
      </Screen>
    </Gate>
  );
}
