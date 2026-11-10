import { Link } from "expo-router";
import { Screen, PageTitle, Copy, Nav } from "../src/ui";

export default function NotFound() {
  return (
    <Screen>
      <PageTitle>Page unavailable</PageTitle>
      <Copy>That screen doesn’t exist or has moved.</Copy>
      <Nav title="Return to films" href="/" />
    </Screen>
  );
}
