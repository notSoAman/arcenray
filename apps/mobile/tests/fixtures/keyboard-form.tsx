import { View, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { KeyboardForm } from "../../src/keyboard-form";
import { Field } from "../../src/ui";
export default function KeyboardFixture() {
  const { field } = useLocalSearchParams<{ field: string }>();
  return (
    <View style={{ flex: 1, backgroundColor: "#0E0F0E" }}>
      <KeyboardForm
        contentContainerStyle={{
          paddingTop: 60,
          paddingHorizontal: 20,
          gap: 20,
        }}
      >
        <Text style={{ color: "#fff" }}>Local keyboard regression fixture</Text>
        <View style={{ height: 420 }} />
        <Field
          key={`${field}-email`}
          label="Fixture email"
          autoFocus={field === "email"}
          keyboardType="email-address"
        />
        <Field
          key={`${field}-password`}
          label="Fixture password"
          autoFocus={field === "password"}
          secureTextEntry
        />
        <Field
          key={`${field}-code`}
          label="Fixture code"
          autoFocus={field === "code"}
          keyboardType="number-pad"
        />
        <View style={{ height: 80 }} />
      </KeyboardForm>
    </View>
  );
}
