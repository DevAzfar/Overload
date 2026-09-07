type BrandLogoProps = {
  size?: "standard" | "compact";
  decorative?: boolean;
};

export default function BrandLogo({ size = "standard", decorative = true }: BrandLogoProps) {
  return (
    <img
      className={`brand-logo brand-logo-${size}`}
      src={`${import.meta.env.BASE_URL}icons/overload-192.png`}
      alt={decorative ? "" : "Overload fist and dumbbell logo"}
      width={size === "compact" ? 30 : 46}
      height={size === "compact" ? 30 : 46}
    />
  );
}
