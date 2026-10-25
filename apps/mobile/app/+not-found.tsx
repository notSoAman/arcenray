import { Link } from "expo-router";
import { Text, View } from "react-native";
import { styles } from "../src/theme";

export default function NotFound() {
  return (
    <View style={[styles.screen, styles.content]}>
      <Text style={styles.title}>Page unavailable</Text>
      <Link href="/" style={styles.body}>
        Return to films
      </Link>
    </View>
  );
}
