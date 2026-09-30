"use client";

/* Cute JARVIS avatar — the robot IS JARVIS's face.
 * States: idle (float+blink) / listening (antenna pulses, eyes wide)
 *         thinking (eyes look around) / speaking (mouth talks, faster bob).
 * Pure SVG + CSS — no assets, works on every browser. */

import type { OrbState } from "@/lib/jarvis/types";

const ACCENTS: Record<string, string> = {
  green: "#34d399",
  cyan: "#22d3ee",
  gold: "#facc15",
  red: "#f87171",
  violet: "#c084fc",
};

export default function JarvisBot({
  state,
  color = "green",
}: {
  state: OrbState;
  color?: string;
}) {
  const accent = ACCENTS[color] || ACCENTS.green;

  return (
    <svg
      viewBox="0 0 200 200"
      className={`h-full w-full jarvis-bot jarvis-bot--${state}`}
      style={{ ["--bot-accent" as string]: accent }}
      aria-label="JARVIS"
      role="img"
    >
      <defs>
        <linearGradient id="botBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#e8fff6" />
          <stop offset="100%" stopColor="#bfeee0" />
        </linearGradient>
        <linearGradient id="botFace" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#04241c" />
          <stop offset="100%" stopColor="#0a3d2f" />
        </linearGradient>
        <radialGradient id="botGlow" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.55" />
          <stop offset="60%" stopColor={accent} stopOpacity="0.14" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* aura */}
      <ellipse cx="100" cy="92" rx="92" ry="88" fill="url(#botGlow)" className="jarvis-bot-aura" />

      <g className="jarvis-bot-floaty">
        {/* antenna */}
        <line x1="100" y1="18" x2="100" y2="40" stroke="#9adbc8" strokeWidth="4" strokeLinecap="round" />
        <circle cx="100" cy="14" r="7" fill={accent} className="jarvis-bot-antenna" />

        {/* ears */}
        <rect x="30" y="72" width="14" height="34" rx="7" fill="#cdeee2" />
        <rect x="156" y="72" width="14" height="34" rx="7" fill="#cdeee2" />
        <circle cx="37" cy="89" r="3.2" fill={accent} opacity="0.85" />
        <circle cx="163" cy="89" r="3.2" fill={accent} opacity="0.85" />

        {/* head */}
        <rect x="40" y="38" width="120" height="96" rx="40" fill="url(#botBody)" />
        {/* face screen */}
        <rect x="54" y="52" width="92" height="68" rx="26" fill="url(#botFace)" />

        {/* eyes (group moves when thinking, blinks always) */}
        <g className="jarvis-bot-eyes">
          <g className="jarvis-bot-eye">
            <rect x="68" y="70" width="18" height="26" rx="9" fill={accent} />
            <circle cx="74" cy="77" r="4.5" fill="#ffffff" opacity="0.9" />
            <circle cx="81" cy="88" r="2.2" fill="#ffffff" opacity="0.5" />
          </g>
          <g className="jarvis-bot-eye">
            <rect x="114" y="70" width="18" height="26" rx="9" fill={accent} />
            <circle cx="120" cy="77" r="4.5" fill="#ffffff" opacity="0.9" />
            <circle cx="127" cy="88" r="2.2" fill="#ffffff" opacity="0.5" />
          </g>
        </g>

        {/* blush */}
        <ellipse cx="64" cy="106" rx="6" ry="3.4" fill="#ff9db5" opacity="0.75" />
        <ellipse cx="136" cy="106" rx="6" ry="3.4" fill="#ff9db5" opacity="0.75" />

        {/* mouth: smile shape, talks when speaking */}
        <g className="jarvis-bot-mouth-wrap">
          <rect x="91" y="103" width="18" height="7" rx="3.5" fill={accent} className="jarvis-bot-mouth" />
        </g>

        {/* little body */}
        <rect x="72" y="132" width="56" height="34" rx="17" fill="url(#botBody)" />
        <circle cx="100" cy="149" r="9" fill="none" stroke={accent} strokeWidth="3" opacity="0.9" className="jarvis-bot-heart" />
        {/* hover shadow */}
        <ellipse cx="100" cy="182" rx="42" ry="7" fill="#000" opacity="0.35" className="jarvis-bot-shadow" />
      </g>
    </svg>
  );
}
