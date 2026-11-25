import { floatingTabBarLayout } from "./native-layout.ts";

type AccountProfile = {
  id: string;
  handle: string;
  full_name: string;
  onboarding_completed: boolean;
};

export function accountIdentity(profile: AccountProfile) {
  const fullName = profile.full_name.trim();
  const generatedHandle = profile.handle === profile.id.replaceAll("-", "");
  const publicHandle = generatedHandle ? null : `@${profile.handle}`;

  if (!profile.onboarding_completed && !fullName) {
    return {
      title: "Your creative profile",
      handle: publicHandle,
      avatarName: "Arcenray creator",
    };
  }

  return {
    title: fullName || publicHandle || "Your creative profile",
    handle: publicHandle,
    avatarName: fullName || publicHandle || "Arcenray creator",
  };
}

export function accountScrollPadding(bottomInset: number) {
  const { height, marginBottom } = floatingTabBarLayout(bottomInset);
  return height + marginBottom + 24;
}
