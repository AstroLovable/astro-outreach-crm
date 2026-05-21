import logo from "@/assets/astrolabs-logo.png";

export function SaturnLogo({ size = 28 }: { size?: number }) {
  return (
    <img
      src={logo}
      width={size}
      height={size}
      alt="AstroLabs"
      className="rounded-md"
      style={{ width: size, height: size }}
    />
  );
}
