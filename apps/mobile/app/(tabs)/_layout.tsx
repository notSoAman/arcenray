import { TabIcon } from "../../src/icons";
import { Tabs } from "expo-router";
import { Image } from "react-native";
import { colors } from "../../src/theme";
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.void },
        headerTintColor: colors.bone,
        tabBarActiveTintColor: colors.bone,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.graphite },
        headerLeft: () => (
          <Image
            source={require("../../assets/arcenray-mark.webp")}
            style={{ width: 23, height: 27, marginLeft: 20 }}
          />
        ),
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="home" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="loop"
        options={{
          title: "Loop",
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="loop" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="search" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: "Chats",
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="chats" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "You",
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="account" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
