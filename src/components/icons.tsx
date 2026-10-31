import type { ReactNode } from "react";
import Svg, { Circle, Path } from "react-native-svg";

interface IconProps {
  color: string;
  size?: number;
}

function Icon({ color, size = 24, children }: IconProps & { children: ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

/** The clock beside how fresh the prices are, as on the website. */
export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M12 7.5V12l3 2" />
    </Icon>
  );
}

export function JournalIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Path d="M5 6.5h14M5 12h14M5 17.5h9" />
    </Icon>
  );
}

export function PortfolioIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M12 3.5V12l6 6" />
    </Icon>
  );
}

export function AccountIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Circle cx={12} cy={8.5} r={4} />
      <Path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.900 7.500 5.500" />
    </Icon>
  );
}
