export type JarvisAction =
  | { type: "none" }
  | { type: "open_app"; app: string; url?: string }
  | { type: "play_song"; query: string }
  | { type: "add_task"; title: string }
  | { type: "complete_task"; title: string }
  | { type: "show_news"; topic?: string }
  | { type: "show_time" }
  | { type: "show_date" };

export type JarvisReply = {
  reply: string;
  language: "bn" | "en" | "hi";
  action: JarvisAction;
};

export type Task = {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  language: string;
  action?: string | null;
  createdAt: string;
};

export type Settings = {
  id: string;
  soul: string;
  speed: number;
  orbColor: "green" | "cyan" | "gold" | "red" | "violet";
  lang: "auto" | "bn" | "en" | "hi";
  wakeWord: boolean;
  volume: number;
  voiceMode: "auto" | "cloud" | "device";
  voiceInput: "auto" | "browser" | "ai";
};

export type DeviceInfo = {
  id: string;
  name: string;
  platform: "web" | "windows" | "android" | string;
  lastSeen: string;
  createdAt: string;
  online: boolean;
};

export type Headline = {
  title: string;
  snippet: string;
  url: string;
  source: string;
  date?: string;
};

export type OrbState = "idle" | "listening" | "speaking" | "thinking";

export const APPS: Record<string, { url: string; label: string }> = {
  instagram: { url: "https://www.instagram.com/", label: "Instagram" },
  facebook: { url: "https://www.facebook.com/", label: "Facebook" },
  youtube: { url: "https://www.youtube.com/", label: "YouTube" },
  whatsapp: { url: "https://web.whatsapp.com/", label: "WhatsApp" },
  tiktok: { url: "https://www.tiktok.com/", label: "TikTok" },
  google: { url: "https://www.google.com/", label: "Google" },
  gmail: { url: "https://mail.google.com/", label: "Gmail" },
  maps: { url: "https://maps.google.com/", label: "Google Maps" },
  twitter: { url: "https://x.com/", label: "X (Twitter)" },
  x: { url: "https://x.com/", label: "X (Twitter)" },
  snapchat: { url: "https://www.snapchat.com/", label: "Snapchat" },
  linkedin: { url: "https://www.linkedin.com/", label: "LinkedIn" },
  telegram: { url: "https://web.telegram.org/", label: "Telegram" },
  netflix: { url: "https://www.netflix.com/", label: "Netflix" },
  spotify: { url: "https://open.spotify.com/", label: "Spotify" },
  chatgpt: { url: "https://chat.openai.com/", label: "ChatGPT" },
  github: { url: "https://github.com/", label: "GitHub" },
  wikipedia: { url: "https://www.wikipedia.org/", label: "Wikipedia" },
  reddit: { url: "https://www.reddit.com/", label: "Reddit" },
  discord: { url: "https://discord.com/app", label: "Discord" },
  amazon: { url: "https://www.amazon.com/", label: "Amazon" },
  imo: { url: "https://imo.im/", label: "imo" },
  youtube_music: { url: "https://music.youtube.com/", label: "YouTube Music" },
  play_store: { url: "https://play.google.com/store", label: "Play Store" },
};
