import Svg, { Path, Circle, type SvgProps } from "react-native-svg";

/** Exact stroke paths from the accepted web icons (apps/web/components/icons.tsx). */
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

type IconProps = {
  size?: number;
  color?: string;
};

function Base({
  size = 20,
  color = "currentColor",
  children,
  fill = "none",
  strokeWidth = 1.7,
}: IconProps & {
  children: React.ReactNode;
  fill?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg
      accessible={false}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

export const IconPlay = ({ size = 16, color = "currentColor" }: IconProps) => (
  <Base size={size} color={color} fill="currentColor" strokeWidth={0}>
    <Path d="M8 5v14l11-7z" />
  </Base>
);

export const IconHeart = ({
  size = 18,
  color = "currentColor",
  filled = false,
}: IconProps & { filled?: boolean }) => (
  <Base size={size} color={color} fill={filled ? "currentColor" : "none"}>
    <Path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
  </Base>
);

export const IconBookmark = ({
  size = 18,
  color = "currentColor",
  filled = false,
}: IconProps & { filled?: boolean }) => (
  <Base size={size} color={color} fill={filled ? "currentColor" : "none"}>
    <Path d="M6 4h12v17l-6-4-6 4z" />
  </Base>
);

export const IconShare = ({ size = 18, color = "currentColor" }: IconProps) => (
  <Base size={size} color={color}>
    <Path d="M12 15V4M8 8l4-4 4 4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" />
  </Base>
);

export const IconFlag = ({ size = 16, color = "currentColor" }: IconProps) => (
  <Base size={size} color={color}>
    <Path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </Base>
);

export const IconPin = ({ size = 16, color = "currentColor" }: IconProps) => (
  <Base size={size} color={color}>
    <Path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z" />
    <Circle cx={12} cy={10} r={2.2} />
  </Base>
);

export const IconCheck = ({ size = 18, color = "currentColor" }: IconProps) => (
  <Base size={size} color={color}>
    <Path d="M5 12.5 10 17l9-10" />
  </Base>
);

export const IconSend = ({ size = 18, color = "currentColor" }: IconProps) => (
  <Base size={size} color={color}>
    <Path d="M4 12 20 4l-6 16-3-7z" />
  </Base>
);

export const IconSearch = ({ size = 18, color = "currentColor" }: IconProps) => (
  <Base size={size} color={color}>
    <Circle cx={11} cy={11} r={7} />
    <Path d="m20 20-3.5-3.5" />
  </Base>
);

export const IconChevron = ({ size = 18, color = "currentColor" }: IconProps) => (
  <Base size={size} color={color}>
    <Path d="M9 5l7 7-7 7" />
  </Base>
);

/** Google "G" mark for the OAuth button (brand colours). */
export const IconGoogle = ({ size = 18 }: { size?: number }) => (
  <Svg accessible={false} width={size} height={size} viewBox="0 0 24 24">
    <Path
      fill="#4285F4"
      d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
    />
    <Path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z"
    />
    <Path
      fill="#FBBC05"
      d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a11.99 11.99 0 0 0 0 10.76l3.98-3.09z"
    />
    <Path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
    />
  </Svg>
);
