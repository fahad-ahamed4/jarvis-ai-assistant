"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Send, Trash2, Volume2, Mic, Bot, User, Download, Languages, Palette, Gauge, Radio,
  CheckCircle2, Circle, Waves, MessageSquareQuote, MonitorSmartphone, Smartphone, Laptop, Globe,
  Signal, SignalHigh, Trash,
} from "lucide-react";
import { speechSupported, isIOS, deviceVoiceStatus, speak, VoiceListener, type VoiceMode } from "@/lib/jarvis/speech";
import type { DeviceInfo, Message, Settings, Task } from "@/lib/jarvis/types";

type ScreenKey = "memory" | "chat" | "soul" | "setting";

const TITLES: Record<ScreenKey, string> = {
  memory: "MEMORY CORE",
  chat: "COMMS LINK",
  soul: "SOUL MATRIX",
  setting: "SYSTEM SETTINGS",
};

const VOICE_MODE_INFO: Record<VoiceMode, string> = {
  auto: "Smart — JARVIS AI voice (English) + device voice (বাংলা/हिंदी)",
  cloud: "JARVIS AI voice everywhere it can (English + বাংলা), auto-fallback otherwise",
  device: "Your device's own voice for every language (works offline)",
};

/* ---------- TASKS (inside MEMORY — home cards are hidden by request) ---------- */
function TasksSection() {
  const [tasks, setTasks] = useState<Task[]>([]);

  const load = () => {
    fetch("/api/tasks")
      .then((r) => r.json())
      .then((d) => setTasks(d.tasks || []))
      .catch(() => {});
  };

  useEffect(() => {
    load();
    window.addEventListener("jarvis-refresh-tasks", load);
    return () => window.removeEventListener("jarvis-refresh-tasks", load);
  }, []);

  const toggle = async (t: Task) => {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    try {
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id, done: !t.done }),
      });
    } catch {
      /* noop */
    }
  };

  const remove = async (t: Task) => {
    setTasks((prev) => prev.filter((x) => x.id !== t.id));
    try {
      await fetch(`/api/tasks?id=${t.id}`, { method: "DELETE" });
    } catch {
      /* noop */
    }
  };

  const doneCount = tasks.filter((t) => t.done).length;

  return (
    <div className="rounded-xl border border-cyan-400/20 bg-black/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.2em] text-cyan-300/90">
          <CheckCircle2 className="h-3.5 w-3.5" /> TODAY TASKS {doneCount}/{tasks.length}
        </p>
      </div>
      <ul className="max-h-44 space-y-1.5 overflow-y-auto pr-1 jarvis-scroll">
        {tasks.length === 0 && (
          <li className="text-[10px] text-emerald-100/40">No tasks — say “add a task, sir”</li>
        )}
        {tasks.map((t) => (
          <li key={t.id} className="group flex items-center gap-1.5">
            <button onClick={() => toggle(t)} aria-label="toggle task" className="shrink-0">
              {t.done ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-emerald-300/60" />
              )}
            </button>
            <span className={`flex-1 truncate text-[11px] ${t.done ? "text-emerald-100/35 line-through" : "text-emerald-100/85"}`}>
              {t.title}
            </span>
            <button onClick={() => remove(t)} aria-label="delete task" className="shrink-0 opacity-60 sm:opacity-100">
              <Trash2 className="h-3 w-3 text-red-400/80" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- CHAT ---------- */
function ChatView({
  settings,
  onCommand,
}: {
  settings: Settings;
  onCommand: (text: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const listenerRef = useRef<VoiceListener | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/messages")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setMessages(d.messages || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startVoiceInput = () => {
    if (!speechSupported()) {
      toast.error("Voice input needs Chrome / Edge / Samsung Internet — please type here.");
      return;
    }
    if (listening) {
      listenerRef.current?.stop();
      setListening(false);
      return;
    }
    if (!listenerRef.current) {
      listenerRef.current = new VoiceListener();
      listenerRef.current.configure({
        onResult: (text, isFinal) => {
          if (isFinal) {
            setListening(false);
            listenerRef.current?.stop();
            if (text.trim().length > 1) {
              setInput("");
              onCommand(text.trim());
            }
          } else {
            setInput(text);
          }
        },
        onEnd: () => setListening(false), // engine stopped by itself — never stay stuck
      });
    }
    listenerRef.current.setLang(
      settings.lang === "en" ? "en-US" : settings.lang === "hi" ? "hi-IN" : "bn-BD"
    );
    const ok = listenerRef.current.start(false);
    if (ok) setListening(true);
    else toast.error("Mic could not start — tap again, sir.");
  };

  const speakMessage = async (text: string, lang: "bn" | "en" | "hi") => {
    toast("Speaking…", { icon: "🔊", duration: 2500 });
    await speak(text, lang, settings.speed, settings.volume, settings.voiceMode);
  };

  return (
    <>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-3 jarvis-scroll">
        {messages.length === 0 && (
          <div className="pt-16 text-center">
            <Bot className="mx-auto mb-3 h-10 w-10 text-emerald-500/50" />
            <p className="text-xs text-emerald-100/40">Comms link established. Say or type anything, sir.</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex items-start gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <div
              className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                m.role === "user" ? "bg-emerald-600/30 text-emerald-300" : "bg-cyan-500/20 text-cyan-300"
              }`}
            >
              {m.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            </div>
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed ${
                m.role === "user"
                  ? "rounded-tr-sm border border-emerald-500/25 bg-emerald-900/40 text-emerald-50"
                  : "rounded-tl-sm border border-emerald-400/20 bg-black/50 text-emerald-100/90"
              }`}
            >
              {m.content}
              {m.role === "assistant" && (
                <button
                  onClick={() => speakMessage(m.content, (m.language as "bn" | "en" | "hi") || "en")}
                  className="ml-2 inline-flex align-middle text-emerald-400/60 hover:text-emerald-300"
                  aria-label="Speak message"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const t = input.trim();
          if (!t) return;
          setInput("");
          onCommand(t);
        }}
        className="flex items-center gap-2 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1"
      >
        <button
          type="button"
          onClick={startVoiceInput}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${
            listening ? "animate-pulse border-amber-300/70 bg-amber-400/20 text-amber-200" : "border-emerald-400/40 text-emerald-300"
          }`}
          aria-label="Voice input"
        >
          <Mic className="h-4 w-4" />
        </button>
        <div className="flex flex-1 items-center rounded-full border border-emerald-400/30 bg-black/60 px-4 py-2.5 focus-within:border-emerald-300/60">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={listening ? "Listening…" : "Message JARVIS…"}
            className="w-full bg-transparent text-[12.5px] text-emerald-100 placeholder:text-emerald-100/30 outline-none"
          />
        </div>
        <button
          type="submit"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-black shadow-[0_0_14px_rgba(16,185,129,0.5)] active:scale-95"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </>
  );
}

/* ---------- MEMORY ---------- */
function MemoryView() {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/messages")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setMessages(d.messages || []);
      })
      .catch(() => {});
    const onWipe = () => {
      setMessages([]);
    };
    window.addEventListener("jarvis-refresh-memory", onWipe);
    return () => {
      cancelled = true;
      window.removeEventListener("jarvis-refresh-memory", onWipe);
    };
  }, []);

  return (
    <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-8 jarvis-scroll">
      <TasksSection />
      <p className="pt-2 text-[10px] font-bold tracking-[0.2em] text-cyan-300/70">▸ CONVERSATION ARCHIVE</p>
      {messages.length === 0 && (
        <p className="pt-6 text-center text-xs text-emerald-100/40">
          Memory core empty, sir. Everything I hear gets archived here.
        </p>
      )}
      {messages.map((m) => (
        <div key={m.id} className="rounded-lg border border-emerald-400/15 bg-black/40 px-3 py-2">
          <p className="text-[9px] font-bold tracking-[0.2em] text-emerald-400/60">
            {m.role === "user" ? "▸ BOSS" : "▸ JARVIS"} • {new Date(m.createdAt).toLocaleString()} •{" "}
            {m.language.toUpperCase()}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-emerald-50/85">{m.content}</p>
        </div>
      ))}
    </div>
  );
}

/* ---------- SOUL ---------- */
function SoulView({ initial, onSave }: { initial: string; onSave: (s: string) => void }) {
  const [draft, setDraft] = useState(initial);
  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-8 pt-2 jarvis-scroll">
      <p className="text-[11px] leading-relaxed text-emerald-100/60">
        Define who JARVIS is for you. This personality overlay has the highest priority in his brain.
        <span className="mt-1 block text-emerald-300/70">
          যেমন: “আমার বন্ধুর মতো কথা বলবে, মাঝে মাঝে রসিকতা করবে, আমাকে ‘বস’ বলবে।”
        </span>
      </p>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={8}
        maxLength={1000}
        placeholder="Write JARVIS's soul… (any language)"
        className="w-full rounded-xl border border-emerald-400/30 bg-black/60 p-4 text-[12.5px] text-emerald-50 outline-none placeholder:text-emerald-100/25 focus:border-emerald-300/60"
      />
      <button
        onClick={() => onSave(draft)}
        className="w-full rounded-full bg-emerald-500 py-3 text-[12px] font-bold tracking-[0.2em] text-black active:scale-95"
      >
        SAVE SOUL
      </button>
    </div>
  );
}

/* ---------- MIC TEST (proves permission + live capture) ---------- */
function MicTestRow() {
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<"" | "granted" | "denied" | "unavailable">("");

  const runTest = async () => {
    if (testing) return;
    setTesting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setStatus("granted");
      toast.success("Microphone works, sir. JARVIS can hear you!", { icon: "🎙️", duration: 4000 });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "NotAllowedError") {
        setStatus("denied");
        toast.error("Mic permission BLOCKED. Browser settings → Site permissions → Microphone → Allow, then reload.", { duration: 7000 });
      } else {
        setStatus("unavailable");
        toast.error("No microphone found on this device, sir.", { duration: 5000 });
      }
    } finally {
      setTesting(false);
    }
  };

  const label =
    status === "granted" ? "MIC OK" : status === "denied" ? "MIC BLOCKED" : status === "unavailable" ? "NO MIC" : "TEST MICROPHONE";

  return (
    <div className="rounded-xl border border-emerald-400/25 bg-black/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.15em] text-emerald-200">
            <Waves className="h-4 w-4" /> MICROPHONE
          </p>
          <p className="mt-1 text-[9.5px] leading-relaxed text-emerald-100/45">
            {isIOS()
              ? "iOS: mic works with Siri & Dictation enabled (Settings → Safari → Microphone)."
              : "Live connection: JARVIS listens continuously and auto-reconnects."}
          </p>
        </div>
        <button
          onClick={runTest}
          disabled={testing}
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[10px] font-bold tracking-[0.12em] active:scale-95 transition ${
            status === "granted"
              ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200"
              : status === "denied" || status === "unavailable"
                ? "border-red-400/60 bg-red-500/15 text-red-300"
                : "border-emerald-400/50 text-emerald-200"
          }`}
        >
          {testing ? "TESTING…" : label}
        </button>
      </div>
    </div>
  );
}

/* ---------- VOICE TEST ---------- */
function VoiceTestRow({ settings }: { settings: Settings }) {
  const [busy, setBusy] = useState(false);

  const runTest = async () => {
    if (busy) return;
    setBusy(true);
    const st = deviceVoiceStatus();
    try {
      await speak("I am JARVIS, sir. Systems online.", "en", settings.speed, settings.volume, settings.voiceMode);
      if (st.bn) {
        await speak("আমি জার্ভিস, আপনার সহকারী।", "bn", settings.speed, settings.volume, settings.voiceMode);
      } else {
        toast("No Bangla voice installed on this device — Bangla replies may be silent. English still works.", { icon: "⚠️", duration: 6000 });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={runTest}
      disabled={busy}
      className="flex w-full items-center justify-center gap-2 rounded-full border border-emerald-400/40 py-3 text-[11px] font-bold tracking-[0.15em] text-emerald-200 active:scale-95 transition disabled:opacity-40"
    >
      <MessageSquareQuote className="h-4 w-4" /> {busy ? "SPEAKING…" : "VOICE TEST (EN + বাংলা)"}
    </button>
  );
}

/* ---------- ROOT SCREEN ---------- */
/* ---------- APPS & DEVICES (downloads + live device sync) ---------- */

type DownloadMeta = { available: boolean; tag?: string; name?: string; size?: number; reason?: string; actions?: string };

function useReleaseMeta(platform: "windows" | "android") {
  const [meta, setMeta] = useState<DownloadMeta | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/download?platform=${platform}&meta=1`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setMeta(d);
      })
      .catch(() => {
        if (alive) setMeta({ available: false, reason: "network error" });
      });
    return () => {
      alive = false;
    };
  }, [platform]);
  return meta;
}

const PLAT_ICON: Record<string, typeof Globe> = {
  windows: Laptop,
  android: Smartphone,
  web: Globe,
};

function fmtSize(n?: number) {
  if (!n) return "";
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

function DownloadButton({ platform, label }: { platform: "windows" | "android"; label: string }) {
  const meta = useReleaseMeta(platform);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/download?platform=${platform}&meta=1`);
      const d = await r.json();
      if (!d.available) {
        toast(`${d.reason || "Build not ready yet"}`, {
          icon: "🛠️",
          duration: 7000,
          action: d.actions
            ? { label: "OPEN BUILDS", onClick: () => window.open(d.actions, "_blank") }
            : undefined,
        });
        return;
      }
      toast.success(`Downloading ${d.name} (${fmtSize(d.size)}) — ${d.tag}`, { icon: "⬇️" });
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional file-download redirect
      window.location.href = `/api/download?platform=${platform}`;
    } catch {
      toast.error("Download check failed — try again, sir.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={go}
      disabled={busy}
      className="flex flex-1 flex-col items-center gap-1 rounded-xl border border-emerald-400/35 bg-emerald-500/10 py-3.5 active:scale-95 transition disabled:opacity-50"
    >
      {platform === "windows" ? (
        <Laptop className="h-5 w-5 text-emerald-300" />
      ) : (
        <Smartphone className="h-5 w-5 text-emerald-300" />
      )}
      <span className="text-[11px] font-bold tracking-[0.12em] text-emerald-100">{label}</span>
      <span className="text-center text-[8.5px] tracking-[0.08em] text-emerald-200/50">
        {meta ? (meta.available ? `${meta.name} • ${fmtSize(meta.size)}` : "BUILD QUEUED — SEE BUILDS") : "CHECKING…"}
      </span>
      <Download className="h-3.5 w-3.5 text-emerald-300/80" />
    </button>
  );
}

function DevicesPanel({ thisDeviceId }: { thisDeviceId: string }) {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [cmdTarget, setCmdTarget] = useState<string | null>(null);
  const [cmdText, setCmdText] = useState("");

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/devices")
        .then((r) => r.json())
        .then((d) => {
          if (alive) setDevices(d.devices || []);
        })
        .catch(() => {});
    load();
    const onPush = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.devices) setDevices(detail.devices);
    };
    window.addEventListener("jarvis-devices", onPush);
    const poll = setInterval(load, 20000); // safety net if SSE hiccups
    return () => {
      alive = false;
      window.removeEventListener("jarvis-devices", onPush);
      clearInterval(poll);
    };
  }, []);

  const sendCommand = async (targetId: string | null) => {
    const text = cmdText.trim();
    if (!text) return;
    const myId = localStorage.getItem("jarvis_device_id") || "web";
    try {
      const r = await fetch("/api/devices/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromId: myId, targetId, text }),
      });
      const d = await r.json();
      if (!r.ok || !d.sent) {
        toast.error(d.error || "Device not connected, sir.");
        return;
      }
      toast.success(targetId ? "Command beamed to device ✓" : "Command broadcast to all devices ✓", { icon: "📡" });
      setCmdText("");
      setCmdTarget(null);
    } catch {
      toast.error("Relay failed — check the connection.");
    }
  };

  const forget = async (id: string) => {
    await fetch("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "forget", id }),
    }).catch(() => {});
    setDevices((ds) => ds.filter((d) => d.id !== id));
    toast.success("Device removed.");
  };

  return (
    <div className="rounded-xl border border-emerald-400/20 bg-black/40 p-3.5">
      <p className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-emerald-300/80">
        <MonitorSmartphone className="h-3.5 w-3.5" /> MY DEVICES — {devices.filter((d) => d.online).length} ONLINE
      </p>
      {devices.length === 0 && (
        <p className="text-[10px] text-emerald-100/40">No devices yet — install the Windows / Android app below.</p>
      )}
      <div className="space-y-1.5">
        {devices.map((d) => {
          const Icon = PLAT_ICON[d.platform] || Globe;
          const mine = d.id === thisDeviceId;
          return (
            <div key={d.id} className="flex items-center gap-2 rounded-lg border border-emerald-400/15 bg-black/50 px-2.5 py-2">
              <Icon className="h-3.5 w-3.5 shrink-0 text-emerald-300/80" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-emerald-100">
                  {d.name} {mine && <span className="text-[8px] font-bold tracking-wider text-emerald-400">(THIS DEVICE)</span>}
                </p>
                <p className="flex items-center gap-1 text-[8.5px] uppercase tracking-wider text-emerald-100/40">
                  {d.online ? <SignalHigh className="h-2.5 w-2.5 text-emerald-400" /> : <Signal className="h-2.5 w-2.5" />}
                  {d.platform} • {d.online ? "online" : "offline"}
                </p>
              </div>
              {d.online && !mine && (
                <button
                  onClick={() => setCmdTarget(cmdTarget === d.id ? null : d.id)}
                  className="rounded-full border border-emerald-400/40 px-2 py-0.5 text-[8.5px] font-bold tracking-wider text-emerald-200 active:scale-95"
                >
                  {cmdTarget === d.id ? "CLOSE" : "COMMAND"}
                </button>
              )}
              {!mine && (
                <button onClick={() => forget(d.id)} aria-label={`Forget ${d.name}`} className="text-emerald-100/30 hover:text-red-300">
                  <Trash className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {cmdTarget && (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            value={cmdText}
            onChange={(e) => setCmdText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendCommand(cmdTarget)}
            placeholder="Command for this device… (Bangla / English / हिंदी)"
            className="flex-1 rounded-full border border-emerald-400/30 bg-black/60 px-3 py-1.5 text-[11px] text-emerald-100 outline-none placeholder:text-emerald-100/30"
          />
          <button
            onClick={() => sendCommand(cmdTarget)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-black active:scale-95"
            aria-label="Send to device"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <p className="mt-2 text-[8.5px] leading-relaxed text-emerald-100/35">
        Every install (Web / Windows / Android) shares this brain — tasks, memory & settings sync instantly. Send a
        command and the device speaks & acts like a real JARVIS network.
      </p>
    </div>
  );
}

export default function JarvisScreen({
  screen,
  onClose,
  settings,
  onSettings,
  onCommand,
  speakText,
}: {
  screen: ScreenKey | null;
  onClose: () => void;
  settings: Settings;
  onSettings: (s: Settings) => void;
  onCommand: (text: string) => void;
  speakText: (text: string, lang: "bn" | "en" | "hi") => Promise<void>;
}) {
  // device id for MY DEVICES (client-only — set on first app boot)
  const [thisDeviceId] = useState(() =>
    typeof window === "undefined" ? "" : localStorage.getItem("jarvis_device_id") || ""
  );

  if (!screen) return null;

  const saveSettings = async (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    onSettings(next);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch {
      toast.error("Could not save settings");
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[#01110c]/[0.985] backdrop-blur-md">
      {/* header */}
      <div className="flex items-center justify-between px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3">
        <button
          onClick={() => {
            onClose();
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-400/30 text-emerald-300"
          aria-label="Back to home"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2
          className="text-[13px] font-bold tracking-[0.28em] text-emerald-200"
          style={{ fontFamily: "var(--font-orbitron), sans-serif" }}
        >
          {TITLES[screen]}
        </h2>
        {screen === "memory" ? (
          <button
            onClick={async () => {
              await fetch("/api/messages", { method: "DELETE" });
              toast.success("Memory wiped, sir.");
              window.dispatchEvent(new CustomEvent("jarvis-refresh-memory"));
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-red-400/40 text-red-300"
            aria-label="Clear memory"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : (
          <span className="h-9 w-9" />
        )}
      </div>

      {/* body */}
      {screen === "chat" && <ChatView settings={settings} onCommand={onCommand} />}
      {screen === "memory" && <MemoryView />}
      {screen === "soul" && (
        <SoulView
          initial={settings.soul}
          onSave={async (s) => {
            await saveSettings({ soul: s });
            toast.success("Soul matrix updated, sir.");
          }}
        />
      )}

      {screen === "setting" && (
        <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-10 pt-2 jarvis-scroll">
          {/* voice mode */}
          <div>
            <p className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-emerald-300/80">
              <Volume2 className="h-3.5 w-3.5" /> JARVIS VOICE
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(["auto", "cloud", "device"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    saveSettings({ voiceMode: m });
                    toast.success(m === "cloud" ? "JARVIS AI voice selected" : m === "device" ? "Device voice selected" : "Smart voice (auto) selected");
                  }}
                  className={`rounded-lg border py-2.5 text-[11px] font-bold ${
                    settings.voiceMode === m
                      ? "border-emerald-300 bg-emerald-500/20 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                      : "border-emerald-400/25 text-emerald-100/60"
                  }`}
                >
                  {m === "auto" ? "AUTO" : m === "cloud" ? "JARVIS AI" : "DEVICE"}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-emerald-100/40">{VOICE_MODE_INFO[settings.voiceMode]}</p>
            <div className="mt-3">
              <VoiceTestRow settings={settings} />
            </div>
          </div>

          {/* microphone */}
          <MicTestRow />

          {/* language */}
          <div>
            <p className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-emerald-300/80">
              <Languages className="h-3.5 w-3.5" /> VOICE INPUT LANGUAGE
            </p>
            <div className="grid grid-cols-4 gap-2">
              {(["auto", "bn", "en", "hi"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => saveSettings({ lang: l })}
                  className={`rounded-lg border py-2 text-[11px] font-bold ${
                    settings.lang === l
                      ? "border-emerald-300 bg-emerald-500/20 text-emerald-200"
                      : "border-emerald-400/25 text-emerald-100/60"
                  }`}
                >
                  {l === "auto" ? "AUTO" : l === "bn" ? "বাংলা" : l === "en" ? "EN" : "हिंदी"}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-emerald-100/40">
              AUTO = auto-detect per sentence (default বাংলা mic, adapts as you switch language).
            </p>
          </div>

          {/* voice INPUT engine */}
          <div>
            <p className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-emerald-300/80">
              <Mic className="h-3.5 w-3.5" /> VOICE INPUT ENGINE
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(["auto", "browser", "ai"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    saveSettings({ voiceInput: m });
                    toast.success(m === "ai" ? "AI cloud speech engine — works everywhere" : m === "browser" ? "Browser engine (fastest)" : "Smart engine (auto)");
                  }}
                  className={`rounded-lg border py-2.5 text-[11px] font-bold ${
                    settings.voiceInput === m
                      ? "border-emerald-300 bg-emerald-500/20 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                      : "border-emerald-400/25 text-emerald-100/60"
                  }`}
                >
                  {m === "auto" ? "AUTO" : m === "browser" ? "BROWSER" : "AI CLOUD"}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-emerald-100/40">
              AUTO = browser engine, auto-switch to AI cloud where unavailable (desktop app, Android app, Firefox).
              AI CLOUD records your voice and transcribes it with GLM — same voice commands on EVERY device.
            </p>
          </div>

          {/* speed */}
          <div>
            <p className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-emerald-300/80">
              <Gauge className="h-3.5 w-3.5" /> VOICE SPEED — {settings.speed.toFixed(1)}×
            </p>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={settings.speed}
              onChange={(e) => saveSettings({ speed: Number(e.target.value) })}
              className="w-full accent-emerald-400"
            />
          </div>

          {/* volume */}
          <div>
            <p className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-emerald-300/80">
              <Volume2 className="h-3.5 w-3.5" /> VOLUME — {Math.round(settings.volume * 100)}%
            </p>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.1}
              value={settings.volume}
              onChange={(e) => saveSettings({ volume: Number(e.target.value) })}
              className="w-full accent-emerald-400"
            />
          </div>

          {/* orb color */}
          <div>
            <p className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-emerald-300/80">
              <Palette className="h-3.5 w-3.5" /> CORE COLOR
            </p>
            <div className="flex gap-2.5">
              {(["green", "cyan", "gold", "red", "violet"] as const).map((c) => (
                <button
                  key={c}
                  aria-label={`orb color ${c}`}
                  onClick={() => saveSettings({ orbColor: c })}
                  className={`h-8 w-8 rounded-full border-2 transition ${
                    settings.orbColor === c ? "scale-110 border-white" : "border-transparent"
                  }`}
                  style={{
                    background:
                      c === "green"
                        ? "#10b981"
                        : c === "cyan"
                          ? "#06b6d4"
                          : c === "gold"
                            ? "#eab308"
                            : c === "red"
                              ? "#ef4444"
                              : "#a855f7",
                    boxShadow: `0 0 12px ${
                      c === "green"
                        ? "#10b981"
                        : c === "cyan"
                          ? "#06b6d4"
                          : c === "gold"
                            ? "#eab308"
                            : c === "red"
                              ? "#ef4444"
                              : "#a855f7"
                    }`,
                  }}
                />
              ))}
            </div>
          </div>

          {/* wake word */}
          <button
            onClick={() => {
              saveSettings({ wakeWord: !settings.wakeWord });
              toast.success(settings.wakeWord ? "Wake word off" : "Wake word ON — say “Jarvis…” anytime");
            }}
            className="flex w-full items-center justify-between rounded-xl border border-emerald-400/25 bg-black/50 p-4"
          >
            <span className="flex items-center gap-2 text-[11px] font-bold tracking-[0.15em] text-emerald-200">
              <Radio className="h-4 w-4" /> WAKE WORD (“HEY JARVIS”)
            </span>
            <span
              className={`h-5 w-10 rounded-full p-0.5 transition ${settings.wakeWord ? "bg-emerald-500" : "bg-emerald-900"}`}
            >
              <span
                className={`block h-4 w-4 rounded-full bg-white transition-transform ${settings.wakeWord ? "translate-x-5" : ""}`}
              />
            </span>
          </button>

          {/* apps & devices — downloads + live sync */}
          <div>
            <p className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-emerald-300/80">
              <MonitorSmartphone className="h-3.5 w-3.5" /> GET THE JARVIS APP
            </p>
            <div className="flex gap-2">
              <DownloadButton platform="windows" label="WINDOWS (.exe)" />
              <DownloadButton platform="android" label="ANDROID (.apk)" />
            </div>
            <p className="mt-1.5 text-[9.5px] leading-relaxed text-emerald-100/40">
              Built automatically by GitHub Actions on every release — the SAME JARVIS AI, same brain, same voice.
              Open the app once and enter this website's address — it appears in MY DEVICES below.
            </p>
          </div>

          <DevicesPanel thisDeviceId={thisDeviceId} />

          {/* install PWA */}
          <button
            onClick={() => {
              const ios = isIOS();
              toast(
                ios
                  ? "iPhone/iPad: Safari → Share button → “Add to Home Screen”."
                  : "Chrome (⋮) → “Add to Home screen / Install app” — তারপর JARVIS আপনার ফোনে আসল app-এর মতো চলবে!",
                { duration: 7000 }
              );
            }}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-emerald-400/40 py-3 text-[11px] font-bold tracking-[0.15em] text-emerald-200"
          >
            <Download className="h-4 w-4" /> INSTALL ON PHONE (PWA)
          </button>

          {/* compatibility */}
          <div className="rounded-xl border border-emerald-400/20 bg-black/40 p-3.5">
            <p className="mb-1.5 text-[10px] font-bold tracking-[0.2em] text-emerald-300/80">DEVICE COMPATIBILITY</p>
            <ul className="space-y-1 text-[9.5px] leading-relaxed text-emerald-100/50">
              <li>• Android Chrome / Samsung Internet — full voice + speech ✓</li>
              <li>• iPhone/iPad Safari — voice (AI engine) + speech ✓ (mic: Settings → Safari)</li>
              <li>• Windows/Mac Chrome & Edge + JARVIS desktop app — full voice ✓</li>
              <li>• Firefox / Android WebView — AI CLOUD voice engine (auto) ✓</li>
              <li>• Microphone needs HTTPS — this app already runs on HTTPS ✓</li>
            </ul>
          </div>

          <p className="text-center text-[9px] text-emerald-100/30">
            JARVIS v4.0 • Multi-device network • AI voice engine • Windows / Android apps
          </p>
        </div>
      )}
    </div>
  );
}
