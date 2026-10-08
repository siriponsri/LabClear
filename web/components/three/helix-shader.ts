/*
 * One point shader for the helix and the dust. The assembly (scatter -> helix) runs on the GPU from a
 * single uProgress uniform, so the CPU only updates a handful of uniforms per frame.
 * Colours arrive as sRGB 0..1 values read from the CSS tokens and are written out unchanged, so the
 * particles match --color-accent / --color-fg-soft exactly in both themes.
 */

export const helixVertex = /* glsl */ `
uniform float uTime;
uniform float uProgress;
uniform float uPixelRatio;
uniform float uSize;
uniform float uCamZ;
uniform vec4 uFocus;
attribute vec3 aScatter;
attribute float aSize;
attribute float aAlpha;
attribute float aDelay;
attribute float aKind;
attribute float aRung;
varying float vAlpha;
varying float vKind;
varying float vFocus;

void main() {
  float p = clamp((uProgress - aDelay) / 0.62, 0.0, 1.0);
  p = 1.0 - pow(1.0 - p, 4.0);
  vec3 pos = mix(aScatter, position, p);
  if (aKind > 1.5) {
    pos.x += sin(uTime * 0.11 + aDelay * 40.0) * 0.35;
    pos.y += cos(uTime * 0.09 + aDelay * 31.0) * 0.22;
  }
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  float focus = 0.0;
  if (aRung >= 0.0) {
    focus = max(step(abs(aRung - uFocus.x), 0.5) * uFocus.z, step(abs(aRung - uFocus.y), 0.5) * uFocus.w);
  }
  vFocus = focus;

  // Back of the helix is smaller and dimmer: depth reads without lighting.
  float depth = clamp((-mv.z - (uCamZ - 2.4)) / 4.8, 0.0, 1.0);
  float size = aSize * (1.0 + focus * 0.9) * mix(1.15, 0.7, depth);
  gl_PointSize = max(1.0, size * uSize * uPixelRatio / -mv.z);

  float arrive = aKind < 0.5 ? mix(0.35, 1.0, p) : (aKind < 1.5 ? p * p : 1.0);
  float twinkle = aKind > 1.5 ? 0.75 + 0.25 * sin(uTime * 0.7 + aDelay * 60.0) : 1.0;
  vAlpha = aAlpha * arrive * twinkle * mix(1.0, 0.6, depth) * (1.0 + focus * 0.6);
  vKind = aKind;
}
`;

export const helixFragment = /* glsl */ `
uniform vec3 uAccent;
uniform vec3 uSoft;
uniform float uOpacity;
varying float vAlpha;
varying float vKind;
varying float vFocus;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float disc = smoothstep(0.5, 0.12, d);
  float alpha = disc * vAlpha * uOpacity;
  if (alpha < 0.01) discard;
  vec3 color = vKind < 0.5 ? uAccent : mix(uSoft, uAccent, vFocus);
  gl_FragColor = vec4(color, alpha);
}
`;
