import { useSession, Gate } from "../../src/session";
import { Screen, Title, Copy, Nav, Muted } from "../../src/ui";
export default function Account() {
  const { me, signedIn } = useSession();
  if (!signedIn)
    return (
      <Screen>
        <Title>Your creative home.</Title>
        <Copy>Show your work. Find your people.</Copy>
        <Nav title="Sign in or create an account" href="/sign-in" />
      </Screen>
    );
  return (
    <Gate onboarding={false}>
      <Screen>
        <Title>{me?.full_name || "Your profile"}</Title>
        <Muted>@{me?.handle}</Muted>
        {me?.onboarding_completed ? (
          <Nav
            title="View your profile"
            href={{ pathname: "/u/[handle]", params: { handle: me.handle } }}
          />
        ) : null}
        <Nav
          title={
            me?.onboarding_completed
              ? "Edit your profile"
              : "Complete onboarding"
          }
          href="/onboarding"
        />
        <Nav title="Publish and manage films" href="/publish" />
        <Nav title="Credit invitations" href="/invitations" />
        <Nav title="Account settings & support" href="/settings" />
      </Screen>
    </Gate>
  );
}
