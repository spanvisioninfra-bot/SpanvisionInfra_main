import { ORGANIZATION_NAME } from "../branding";

/** SI monogram: an open span with a vertical infrastructure pier. */
export default function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={ORGANIZATION_NAME}>
      <rect width="64" height="64" rx="12" fill="#FFFFFF" />
      <path d="M37 17H24a9 9 0 0 0 0 18h7a6 6 0 0 1 0 12H17M46 17v30" fill="none" stroke="#000000" strokeWidth="5" strokeLinecap="square" />
      <path d="M41 17h10M41 47h10" stroke="#000000" strokeWidth="4" />
    </svg>
  );
}
