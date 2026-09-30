"use client";

import { useEffect, useRef } from "react";
import type { OrbState } from "@/lib/jarvis/types";

type LevelRef = { current: number } | null;

const THEME_COLORS: Record<string, { core: [number, number, number]; accent: [number, number, number] }> = {
  green: { core: [0, 255, 170], accent: [180, 255, 60] },
  cyan: { core: [0, 220, 255], accent: [120, 255, 240] },
  gold: { core: [255, 200, 60], accent: [255, 240, 120] },
  red: { core: [255, 70, 70], accent: [255, 160, 90] },
  violet: { core: [190, 120, 255], accent: [255, 120, 240] },
};

type Particle = {
  theta: number;
  phi: number;
  radius: number; // normalized 0..1
  speed: number;
  size: number;
  accent: boolean;
  jitter: number;
  phase: number;
};

export default function Orb({
  state,
  color = "green",
  label = true,
  levelRef = null,
}: {
  state: OrbState;
  color?: string;
  label?: boolean;
  levelRef?: LevelRef;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<OrbState>(state);
  const colorRef = useRef<string>(color);

  useEffect(() => {
    stateRef.current = state;
    colorRef.current = color;
  }, [state, color]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    let dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);

    const N = 900;
    const particles: Particle[] = [];
    for (let i = 0; i < N; i++) {
      const theta = Math.random() * Math.PI * 2;
      // bias towards sphere surface band (like the video's shell of particles)
      const surf = Math.random() < 0.82;
      const phi = Math.acos(2 * Math.random() - 1);
      particles.push({
        theta,
        phi,
        radius: surf ? 0.82 + Math.random() * 0.18 : 0.25 + Math.random() * 0.55,
        speed: 0.0015 + Math.random() * 0.004,
        size: 0.6 + Math.random() * 1.7,
        accent: Math.random() < 0.14,
        jitter: 0.004 + Math.random() * 0.012,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let t = 0;
    const render = () => {
      t += 1;
      const st = stateRef.current;
      const theme = THEME_COLORS[colorRef.current] || THEME_COLORS.green;

      const speakingBoost = st === "speaking" ? 1 : 0;
      const listening = st === "listening";
      const thinking = st === "thinking";
      const live = listening ? Math.min(1, levelRef?.current || 0) : 0; // real mic energy

      // energy of the orb
      const pulse = 0.5 + 0.5 * Math.sin(t * (st === "speaking" ? 0.09 : 0.03) + 1);
      const energy =
        st === "idle"
          ? 0.35 + 0.1 * pulse
          : listening
            ? 0.62 + 0.18 * pulse + live * 0.5
            : thinking
              ? 0.8 + 0.2 * pulse
              : 0.85 + 0.15 * pulse;

      const baseCol = listening ? [255, 170, 40] : thinking ? [80, 220, 255] : theme.core;
      const accCol = listening ? [255, 220, 120] : thinking ? [180, 250, 255] : theme.accent;

      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const R = Math.min(width, height) * 0.42;

      // ambient glow
      const glow = ctx.createRadialGradient(cx, cy, R * 0.05, cx, cy, R * 1.25);
      glow.addColorStop(0, `rgba(${baseCol[0]},${baseCol[1]},${baseCol[2]},${0.10 + 0.16 * energy * pulse})`);
      glow.addColorStop(0.55, `rgba(${baseCol[0]},${baseCol[1]},${baseCol[2]},0.05)`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      // core ball (breathes with live mic level while listening)
      const coreR = R * (0.16 + 0.035 * energy * pulse + live * 0.05);
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.2);
      core.addColorStop(0, `rgba(${baseCol[0]},${baseCol[1]},${baseCol[2]},${0.5 + 0.3 * energy})`);
      core.addColorStop(0.4, `rgba(${baseCol[0]},${baseCol[1]},${baseCol[2]},0.16)`);
      core.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 2.2, 0, Math.PI * 2);
      ctx.fill();

      // particles
      const rotA = t * (0.004 + speakingBoost * 0.006);
      const tilt = 0.45;
      ctx.globalCompositeOperation = "lighter";

      for (const p of particles) {
        p.theta += p.speed * (listening ? 2.4 : thinking ? 3.4 : 1) + (speakingBoost ? Math.sin(t * 0.05 + p.phase) * 0.002 : 0);

        const jr = listening || speakingBoost ? Math.sin(t * 0.08 + p.phase) * p.jitter : Math.sin(t * 0.02 + p.phase) * p.jitter * 0.3;
        const r = Math.min(1, Math.max(0.08, p.radius + jr * energy));

        // spherical coords -> 3d
        const sinPhi = Math.sin(p.phi);
        let x3 = r * sinPhi * Math.cos(p.theta);
        let y3 = r * Math.cos(p.phi);
        let z3 = r * sinPhi * Math.sin(p.theta);

        // rotate around Y
        const xr = x3 * Math.cos(rotA) - z3 * Math.sin(rotA);
        const zr = x3 * Math.sin(rotA) + z3 * Math.cos(rotA);
        // tilt around X
        const yr = y3 * Math.cos(tilt) - zr * Math.sin(tilt);
        const z2 = y3 * Math.sin(tilt) + zr * Math.cos(tilt);

        const persp = 1 / (1.6 - z2 * 0.55);
        const px = cx + xr * R * persp;
        const py = cy + yr * R * persp;

        const depth = (z2 + 1) / 2; // 0..1
        const col = p.accent ? accCol : baseCol;
        const alpha = (0.16 + depth * 0.7) * energy;

        ctx.beginPath();
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${Math.min(0.95, alpha)})`;
        ctx.arc(px, py, p.size * (0.7 + depth * 0.9) * (speakingBoost ? 1.15 : 1), 0, Math.PI * 2);
        ctx.fill();
      }

      // equator ring (like video's ring)
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(${baseCol[0]},${baseCol[1]},${baseCol[2]},${0.10 + 0.2 * energy})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, R * 1.02, R * 0.36, Math.sin(t * 0.004) * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${accCol[0]},${accCol[1]},${accCol[2]},${0.06 + 0.14 * energy})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, R * 1.08, R * 0.28, Math.cos(t * 0.003) * 0.4, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const labelMap: Record<OrbState, { text: string; cls: string }> = {
    idle: { text: "STANDBY", cls: "text-emerald-300/70" },
    listening: { text: "LISTENING", cls: "text-amber-300" },
    thinking: { text: "PROCESSING", cls: "text-cyan-300" },
    speaking: { text: "SPEAKING", cls: "text-emerald-200" },
  };
  const l = labelMap[state];

  return (
    <div className="relative w-full h-full select-none">
      <canvas ref={canvasRef} className="w-full h-full" aria-label="JARVIS core status orb" />
      {label && (
        <div className="absolute inset-x-0 bottom-[8%] flex justify-center pointer-events-none">
          <span className={`text-[10px] tracking-[0.35em] font-semibold ${l.cls} drop-shadow-[0_0_8px_rgba(0,255,170,0.6)]`}>
            • {l.text} •
          </span>
        </div>
      )}
    </div>
  );
}
