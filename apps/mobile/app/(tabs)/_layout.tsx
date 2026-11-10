import { View } from "react-native";
import { Tabs } from "expo-router";
import type { SvgProps } from "react-native-svg";
import { TabIcon } from "../../src/icons";
import { Lockup } from "../../src/brand";
import { colors, fonts } from "../../src/theme";

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
    <View style={{ alignItems: "center", gap: 4 }}>
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

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.void },
        headerShadowVisible: false,
        headerTitle: "",
        headerLeft: () => (
          <View style={{ marginLeft: 20 }}>
            <Lockup size={26} />
          </View>
        ),
        tabBarActiveTintColor: colors.bone,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        tabBarStyle: {
          position: "absolute",
          marginHorizontal: 12,
          marginBottom: 12,
          height: 66,
          borderRadius: 33,
          backgroundColor: "rgba(26, 26, 27, 0.86)",
          borderWidth: 1,
          borderColor: "rgba(243, 239, 233, 0.12)",
          borderTopWidth: 0,
        },
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
          tabBarIcon: ({ color, size, focused }) => (
            <TabBarIcon name="chats" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "You",
          tabBarIcon: ({ color, size, focused }) => (
            <TabBarIcon name="account" color={color} size={size} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
