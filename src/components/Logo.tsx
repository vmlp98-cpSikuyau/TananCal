export function Logo({ size = 32 }: { size?: number }) {
  // public/logo.png is a white silhouette used as a CSS mask, so it follows the theme accent colour.
  return (
    <span
      className="logo-mark"
      role="img"
      aria-label="TananCal logo"
      style={{ width: size * 1.39, height: size }}
    />
  );
}
