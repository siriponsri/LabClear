import { helixSvgPaths } from "./helix-data";

/* Static helix drawn on the server: shown without JavaScript, without WebGL, with Save-Data, and
   while the 3D helix loads under reduced motion. Dots are zero-length round-capped segments. */
const W = 1440;
const H = 640;
const paths = helixSvgPaths(W, H);

export function HelixSvg() {
  return (
    <svg className="lc-helix-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <path className="lc-helix-svg-rungs" d={paths.rungs} />
      <path className="lc-helix-svg-back" d={paths.back} />
      <path className="lc-helix-svg-front" d={paths.front} />
    </svg>
  );
}
