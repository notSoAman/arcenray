import Svg, { Path, Circle, type SvgProps } from "react-native-svg";
/** Exact stroke paths from the accepted web icons, rendered with native SVG. */
export function TabIcon({
  name,
  color,
  size,
}: {
  name: "home" | "loop" | "search" | "chats" | "account";
  color: SvgProps["stroke"];
  size: number;
}) {
  return (
    <Svg
      accessible={false}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "home" ? (
        <Path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />
      ) : name === "loop" ? (
        <Path d="M12 12c-2-3-3.5-4.5-5.5-4.5a4.5 4.5 0 0 0 0 9c2 0 3.5-1.5 5.5-4.5s3.5-4.5 5.5-4.5a4.5 4.5 0 0 1 0 9c-2 0-3.5-1.5-5.5-4.5Z" />
      ) : name === "search" ? (
        <>
          <Circle cx={11} cy={11} r={7} />
          <Path d="m20 20-3.5-3.5" />
        </>
      ) : name === "chats" ? (
        <Path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z" />
      ) : (
        <>
          <Circle cx={12} cy={8} r={4} />
          <Path d="M4 21a8 8 0 0 1 16 0" />
        </>
      )}
    </Svg>
  );
}
