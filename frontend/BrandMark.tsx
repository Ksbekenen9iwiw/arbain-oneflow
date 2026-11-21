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
