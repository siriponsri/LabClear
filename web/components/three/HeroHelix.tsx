"use client";
/*
 * The hero DNA helix in React Three Fiber (port of the 3.x static/js/hero3d.js, raised).
 * - ~1,800 particles scatter, then the strands assemble and the base pairs zip in (GPU-driven).
 * - Spring-damped pointer parallax, scroll tilt and lift, slow spin about the helix axis.
 * - Theme-aware colours from --color-accent / --color-fg-soft; additive glow in dark mode.
 * - Pauses when off-screen or when the tab is hidden; one static assembled frame under reduced motion.
 * - Signature touch: near the pointer, a few rungs light up and carry a test label (mouse only).
 * All per-frame work mutates refs and uniforms; React state changes only on visibility changes.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { buildDust, buildHelix, labelledRungs, type ParticleSet } from "./helix-data";
import { helixFragment, helixVertex } from "./helix-shader";

const ASSEMBLE_SECONDS = 2.6;
const LABEL_RADIUS = 210;

type Pointer = { x: number; y: number; nx: number; ny: number; active: boolean; fine: boolean; rect: DOMRect | null };

function geometryFrom(set: ParticleSet) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(set.position, 3));
  g.setAttribute("aScatter", new THREE.BufferAttribute(set.scatter, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(set.size, 1));
  g.setAttribute("aAlpha", new THREE.BufferAttribute(set.alpha, 1));
  g.setAttribute("aDelay", new THREE.BufferAttribute(set.delay, 1));
  g.setAttribute("aKind", new THREE.BufferAttribute(set.kind, 1));
  g.setAttribute("aRung", new THREE.BufferAttribute(set.rung, 1));
  return g;
}

function material() {
  return new THREE.ShaderMaterial({
    vertexShader: helixVertex,
    fragmentShader: helixFragment,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uPixelRatio: { value: 1 },
      uSize: { value: 64 },
      uCamZ: { value: 16 },
      uFocus: { value: new THREE.Vector4(-1, -1, 0, 0) },
      uAccent: { value: new THREE.Vector3(0.4, 0.22, 0.66) },
      uSoft: { value: new THREE.Vector3(0.46, 0.45, 0.48) },
      uOpacity: { value: 0.9 },
    },
  });
}

/** Resolve any CSS colour (oklch included) to sRGB 0..1 through a 1x1 canvas. */
function cssColor(name: string, fallback: string, out: THREE.Vector3) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return out;
  ctx.fillStyle = fallback;
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return out.set(r / 255, g / 255, b / 255);
}

const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
};

type SceneProps = { reduced: boolean; pointer: React.RefObject<Pointer>; labels: React.RefObject<(HTMLSpanElement | null)[]>; onFirstFrame: () => void };

function Scene({ reduced, pointer, labels, onFirstFrame }: SceneProps) {
  const { camera, size, viewport, invalidate } = useThree();
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const helix = useMemo(() => geometryFrom(buildHelix(7)), []);
  const dust = useMemo(() => geometryFrom(buildDust(11)), []);
  const helixMat = useMemo(material, []);
  const dustMat = useMemo(material, []);
  const rungs = useMemo(labelledRungs, []);
  const motion = useRef({ t: 0, px: 0, py: 0, vx: 0, vy: 0, scroll: 0, first: false });
  const slots = useRef([
    { rung: -1, alpha: 0, want: 0, label: "" },
    { rung: -1, alpha: 0, want: 0, label: "" },
  ]);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const portrait = size.width < size.height * 0.9;

  useEffect(
    () => () => {
      helix.dispose();
      dust.dispose();
      helixMat.dispose();
      dustMat.dispose();
    },
    [helix, dust, helixMat, dustMat],
  );

  // Framing: farther on narrow screens; points keep the same on-screen size.
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const z = size.width < 700 ? 22 : 17.5;
    cam.position.set(0, 0, z);
    cam.updateProjectionMatrix();
    for (const m of [helixMat, dustMat]) {
      m.uniforms.uCamZ.value = z;
      m.uniforms.uSize.value = 68 * (z / 16) * (size.width < 700 ? 0.85 : 1);
      m.uniforms.uPixelRatio.value = viewport.dpr;
    }
    invalidate();
  }, [camera, size.width, size.height, viewport.dpr, helixMat, dustMat, invalidate]);

  // Theme: read the CSS tokens again whenever the theme can change.
  useEffect(() => {
    const apply = () => {
      const dark = isDark();
      for (const m of [helixMat, dustMat]) {
        cssColor("--color-accent", "#6539a9", m.uniforms.uAccent.value);
        cssColor("--color-fg-soft", "#75737b", m.uniforms.uSoft.value);
        m.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
        m.needsUpdate = true;
      }
      helixMat.uniforms.uOpacity.value = dark ? 1 : 0.9;
      dustMat.uniforms.uOpacity.value = dark ? 0.7 : 0.6;
      invalidate();
    };
    apply();
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const mo = new MutationObserver(apply);
    window.addEventListener("labclear-theme", apply);
    mq.addEventListener("change", apply);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      window.removeEventListener("labclear-theme", apply);
      mq.removeEventListener("change", apply);
      mo.disconnect();
    };
  }, [helixMat, dustMat, invalidate]);

  useFrame((state, delta) => {
    const o = outer.current;
    const n = inner.current;
    if (!o || !n) return;
    const m = motion.current;
    const baseZ = portrait ? -1.02 : -0.12;

    if (reduced) {
      helixMat.uniforms.uProgress.value = 10;
      dustMat.uniforms.uProgress.value = 10;
      o.rotation.set(0.6, 0, baseZ);
      o.position.set(0, 0, 0);
      n.rotation.set(0, 0, 0);
    } else {
      // Real time drives the assembly (slow devices still finish on time); a long pause counts as one frame.
      m.t += delta > 0.25 ? 1 / 60 : delta;
      const dt = Math.min(delta, 1 / 30);
      helixMat.uniforms.uTime.value = m.t;
      dustMat.uniforms.uTime.value = m.t;
      helixMat.uniforms.uProgress.value = m.t / ASSEMBLE_SECONDS;
      dustMat.uniforms.uProgress.value = 10;

      // Spring toward the pointer (slightly under-damped so it feels alive, never bouncy).
      const p = pointer.current;
      const tx = p.active ? p.nx : 0;
      const ty = p.active ? p.ny : 0;
      const k = 28;
      const c = 9.5;
      m.vx += ((tx - m.px) * k - m.vx * c) * dt;
      m.vy += ((ty - m.py) * k - m.vy * c) * dt;
      m.px += m.vx * dt;
      m.py += m.vy * dt;

      // Scroll tilts the helix back and lets it sink behind the content.
      const h = state.size.height || 1;
      const target = Math.min(1, Math.max(0, window.scrollY / h));
      m.scroll += (target - m.scroll) * (1 - Math.exp(-dt * 8));

      n.rotation.x = m.t * 0.22;
      o.rotation.x = 0.18 + m.scroll * 1.1 + m.py * 0.08;
      o.rotation.y = m.px * 0.2;
      o.rotation.z = baseZ + m.py * 0.05;
      o.position.y = -m.scroll * 2.4;
      updateLabels(dt, state.camera, state.size);
    }

    if (!m.first) {
      m.first = true;
      onFirstFrame();
    }
  });

  function updateLabels(dt: number, cam: THREE.Camera, sz: { width: number; height: number }) {
    const els = labels.current;
    const p = pointer.current;
    const n = inner.current;
    if (!els || !n) return;
    const ready = p.active && p.fine && motion.current.t > ASSEMBLE_SECONDS * 0.9;
    const rect = p.rect;
    const px = rect ? p.x - rect.left : -1e4;
    const py = rect ? p.y - rect.top : -1e4;
    // Project the labelled rung midpoints and keep the two nearest to the pointer.
    let best0 = -1;
    let best1 = -1;
    let d0 = Infinity;
    let d1 = Infinity;
    const screen: [number, number, number][] = [];
    for (let i = 0; i < rungs.length; i++) {
      tmp.set(rungs[i].x, 0, 0).applyMatrix4(n.matrixWorld).project(cam);
      const sx = (tmp.x * 0.5 + 0.5) * sz.width;
      const sy = (-tmp.y * 0.5 + 0.5) * sz.height;
      const d = Math.hypot(sx - px, sy - py);
      screen.push([sx, sy, d]);
      if (!ready || d > LABEL_RADIUS) continue;
      if (d < d0) {
        best1 = best0;
        d1 = d0;
        best0 = i;
        d0 = d;
      } else if (d < d1) {
        best1 = i;
        d1 = d;
      }
    }
    const wanted = [best0, best1].filter((i) => i >= 0);
    const ss = slots.current;
    for (const s of ss) s.want = 0;
    for (const w of wanted) {
      const strength = Math.min(1, Math.max(0, (LABEL_RADIUS - screen[w][2]) / (LABEL_RADIUS * 0.55)));
      const held = ss.find((s) => s.rung === w);
      if (held) {
        held.want = strength;
        continue;
      }
      const free = ss.find((s) => s.want === 0 && s.alpha < 0.03 && !wanted.includes(s.rung));
      if (free) {
        free.rung = w;
        free.want = strength;
        free.label = rungs[w].label;
      }
    }
    const ease = 1 - Math.exp(-dt * 9);
    ss.forEach((s, k) => {
      s.alpha += (s.want - s.alpha) * ease;
      const el = els[k];
      if (!el) return;
      if (s.rung < 0 || s.alpha < 0.01) {
        if (el.style.opacity !== "0") el.style.opacity = "0";
        return;
      }
      if (el.dataset.label !== s.label) {
        el.dataset.label = s.label;
        const text = el.querySelector("b");
        if (text) text.textContent = s.label;
      }
      const [sx, sy] = screen[s.rung];
      el.style.opacity = s.alpha.toFixed(3);
      el.style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0)`;
    });
    const f = helixMat.uniforms.uFocus.value as THREE.Vector4;
    f.set(ss[0].alpha > 0.01 ? rungs[ss[0].rung].rung : -1, ss[1].alpha > 0.01 && ss[1].rung >= 0 ? rungs[ss[1].rung].rung : -1, ss[0].alpha, ss[1].alpha);
  }

  return (
    <>
      <group ref={outer}>
        <group ref={inner}>
          <points geometry={helix} material={helixMat} frustumCulled={false} />
        </group>
      </group>
      <points geometry={dust} material={dustMat} frustumCulled={false} />
    </>
  );
}

export default function HeroHelix({ onReady, onFail }: { onReady: () => void; onFail: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<(HTMLSpanElement | null)[]>([]);
  const pointer = useRef<Pointer>({ x: 0, y: 0, nx: 0, ny: 0, active: false, fine: false, rect: null });
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [onScreen, setOnScreen] = useState(true);
  const [tabVisible, setTabVisible] = useState(() => !document.hidden);

  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    const onReduce = () => setReduced(mq.matches);
    const measure = () => {
      if (host.current) pointer.current.rect = host.current.getBoundingClientRect();
    };
    const move = (e: PointerEvent) => {
      const p = pointer.current;
      p.x = e.clientX;
      p.y = e.clientY;
      p.nx = (e.clientX / innerWidth - 0.5) * 2;
      p.ny = (e.clientY / innerHeight - 0.5) * 2;
      p.active = true;
      p.fine = e.pointerType === "mouse" && fine.matches;
      measure();
    };
    const leave = () => {
      pointer.current.active = false;
    };
    const vis = () => setTabVisible(!document.hidden);
    mq.addEventListener("change", onReduce);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    document.documentElement.addEventListener("pointerleave", leave);
    document.addEventListener("visibilitychange", vis);
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { rootMargin: "80px" });
    if (host.current) io.observe(host.current);
    return () => {
      mq.removeEventListener("change", onReduce);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      document.documentElement.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", vis);
      io.disconnect();
    };
  }, []);

  const frameloop = reduced ? "demand" : onScreen && tabVisible ? "always" : "never";

  return (
    <div ref={host} className="lc-helix-host">
      <Canvas
        className="lc-helix-canvas"
        dpr={[1, 1.75]}
        frameloop={frameloop}
        flat
        camera={{ fov: 38, near: 0.1, far: 100, position: [0, 0, 16] }}
        gl={{ antialias: false, alpha: true, powerPreference: "low-power", premultipliedAlpha: true }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.domElement.setAttribute("aria-hidden", "true");
          gl.domElement.addEventListener("webglcontextlost", onFail, { once: true });
        }}
        fallback={null}
      >
        <Scene reduced={reduced} pointer={pointer} labels={labels} onFirstFrame={onReady} />
      </Canvas>
      {!reduced && (
        <div className="lc-helix-labels">
          {[0, 1].map((k) => (
            <span
              key={k}
              className="lc-helix-label"
              style={{ opacity: 0 }}
              ref={(el) => {
                labels.current[k] = el;
              }}
            >
              <i />
              <b />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
