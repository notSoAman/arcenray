import { Pressable, StyleSheet, Text, View } from "react-native";
import { Tabs, router } from "expo-router";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SvgProps } from "react-native-svg";
import { useChatActivity } from "../../src/chat-activity";
import { TabIcon } from "../../src/icons";
import { Avatar } from "../../src/visuals";
import { Lockup } from "../../src/brand";
import { useSession } from "../../src/session";
import { colors, fonts, radius } from "../../src/theme";
import { floatingTabBarLayout } from "../../src/native-layout";

function TabBarIcon({
  name,
  color,
  size,
  focused,
}: {
  name: "home" | "loop" | "search" | "chats" | "account";
  color: SvgProps["stroke"];
  size: number;
  focused: boolean;
}) {
  return (
    <View style={{ alignItems: "center", gap: 3 }}>
      <TabIcon name={name} color={color} size={size} />
      {focused ? (
        <View
          style={{
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.ember,
          }}
        />
      ) : null}
    </View>
  );
}

function HeaderActions() {
  const { signedIn } = useSession();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={signedIn ? "Publish a film" : "Sign in to publish"}
      onPress={() => router.push(signedIn ? "/publish" : "/sign-in")}
      style={({ pressed }) => ({
        minHeight: 40,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.lineStrong,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 12,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ color: colors.bone, fontFamily: fonts.semibold, fontSize: 12 }}>
        {signedIn ? "Publish" : "Sign in"}
      </Text>
    </Pressable>
  );
}

export default function TabLayout() {
  const { me } = useSession();
  const { unreadCount } = useChatActivity();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      safeAreaInsets={{ bottom: 0 }}
      screenOptions={{
        headerStyle: { backgroundColor: colors.void },
        headerShadowVisible: false,
        headerTitle: "",
        headerLeft: () => (
          <View style={{ marginLeft: 20 }}>
            <Lockup size={26} />
          </View>
        ),
        headerRight: () => <HeaderActions />,
        tabBarActiveTintColor: colors.bone,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 10, marginTop: 1 },
        tabBarItemStyle: { paddingTop: 4 },
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          position: "absolute",
          marginHorizontal: 12,
          ...floatingTabBarLayout(insets.bottom),
          borderRadius: 33,
          backgroundColor: "transparent",
          borderWidth: 0,
          borderTopWidth: 0,
          elevation: 0,
        },
        tabBarBackground: () => (
          <View
            style={{
              flex: 1,
              borderRadius: 33,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: "rgba(243,239,233,0.12)",
              backgroundColor: "rgba(26,26,27,0.72)",
            }}
          >
            <BlurView
              tint="dark"
              intensity={44}
              blurMethod="none"
              style={StyleSheet.absoluteFill}
            />
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size, focused }) => (
            <TabBarIcon name="home" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="loop"
        options={{
          title: "Loop",
          tabBarIcon: ({ color, size, focused }) => (
            <TabBarIcon name="loop" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color, size, focused }) => (
            <TabBarIcon name="search" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: "Chats",
          tabBarBadge: unreadCount ? Math.min(unreadCount, 99) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.orange, color: colors.void },
          tabBarIcon: ({ color, size, focused }) => (
            <TabBarIcon name="chats" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "You",
          tabBarIcon: ({ color, size, focused }) =>
            me ? (
              <View
                style={{
                  borderRadius: 16,
                  borderWidth: focused ? 1.5 : 0,
                  borderColor: colors.ember,
                  padding: focused ? 1.5 : 0,
                }}
              >
                <Avatar
                  picKey={me.profile_pic_key}
                  name={me.full_name || me.handle}
                  size={25}
                />
              </View>
            ) : (
              <TabBarIcon name="account" color={color} size={size} focused={focused} />
            ),
        }}
      />
    </Tabs>
  );
}
