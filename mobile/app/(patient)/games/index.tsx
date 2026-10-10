// EchoVault mobile — memory games list (PAT-7).
// Optional activities. They are just for fun: no scores, no grades.

import { router } from "expo-router";
import { ScrollView, Text } from "react-native";

import BigButton from "../../../src/components/BigButton";
import { GAMES } from "../../../src/patient/games";
import { useTheme } from "../../../src/theme-context";

export default function Games() {
  const theme = useTheme();
  return (
    <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: 200 }}>
      <Text style={{ fontSize: theme.fontSizes.button, color: theme.colors.fg }}>
        Pick a game. It's just for fun, and you can stop any time.
      </Text>
      {GAMES.map((g) => (
        <BigButton
          key={g.type}
          icon={g.icon}
          label={g.title}
          hint={g.about}
          variant="secondary"
          onPress={() => router.push({ pathname: "/games/[type]", params: { type: g.type } })}
          theme={theme}
        />
      ))}
    </ScrollView>
  );
}
