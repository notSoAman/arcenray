import { config } from "@repo/eslint-config/react-internal";

export default [
  ...config,
  { ignores: ["android/**", "ios/**", ".expo/**", "dist/**", "expo-env.d.ts"] },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        babelOptions: {
          parserOpts: { plugins: ["jsx"] },
        },
      },
    },
    rules: {
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },
];
