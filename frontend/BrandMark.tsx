import type { SVGProps } from "react";

/** OneFlow mark: a honeycomb cell holding a single drop. */
export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 2.75 20 7.4v9.2l-8 4.65-8-4.65V7.4z" />
      <path
        d="M12 7.5c1.9 2.3 3 3.9 3 5.4a3 3 0 0 1-6 0c0-1.5 1.1-3.1 3-5.4z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

/** Empty-state illustration: a small honeycomb cluster with one filled cell. */
export function HoneycombArt({
  tone = "accent",
}: {
  tone?: "accent" | "success";
}) {
  const cell = "M0 -13 11.26 -6.5v13L0 13-11.26 6.5v-13z";
  const fill =
    tone === "success" ? "var(--color-icon-green)" : "var(--color-accent)";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 72 60"
      width="72"
      height="60"
      fill="none"
      stroke="var(--color-border-emphasized)"
      strokeWidth={1.5}
      strokeLinejoin="round"
      aria-hidden="true"
      data-honeycomb
    >
      <path d={cell} transform="translate(24.5 17)" />
      <path d={cell} transform="translate(47.5 17)" />
      <path
        d={cell}
        transform="translate(36 37)"
        fill={fill}
        fillOpacity={0.18}
        stroke={fill}
      />
      <path d={cell} transform="translate(13 37)" strokeOpacity={0.5} />
      <path d={cell} transform="translate(59 37)" strokeOpacity={0.5} />
      {tone === "success" ? (
        <path
          d="m31 37 3.5 3.5 6.5-7"
          stroke={fill}
          strokeWidth={2}
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M36 31.5c1.9 2.3 3 3.9 3 5.4a3 3 0 0 1-6 0c0-1.5 1.1-3.1 3-5.4z"
          fill={fill}
          stroke="none"
        />
      )}
    </svg>
  );
}
