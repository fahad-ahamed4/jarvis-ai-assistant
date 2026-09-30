import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REPO = process.env.GITHUB_REPO || "fahad-ahamed4/jarvis-ai-assistant";
const CACHE_TTL = 5 * 60 * 1000;

type Cache = { at: number; release: { tag: string; url: string; assets: { name: string; url: string; size: number }[] } | null };
const g = globalThis as unknown as { __jarvisReleaseCache?: Cache };

async function latestRelease() {
  const cached = g.__jarvisReleaseCache;
  // successful lookups cache 5 min; "no release yet" only 30 s (CI may finish any moment)
  const ttl = cached?.release ? CACHE_TTL : 30_000;
  if (cached && Date.now() - cached.at < ttl) return cached.release;

  /* 1) GitHub REST API (rich info). Uses GITHUB_TOKEN if provided (higher limits). */
  let release: Cache["release"] = null;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "jarvis-site",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const j = await res.json();
      release = {
        tag: j.tag_name || "",
        url: j.html_url || "",
        assets: (j.assets || []).map((a: { name: string; browser_download_url: string; size: number }) => ({
          name: a.name,
          url: a.browser_download_url,
          size: a.size,
        })),
      };
    }
  } catch {
    release = null;
  }

  /* 2) Fallback WITHOUT the API (works even when the API is rate-limited):
   * follow github.com/{repo}/releases/latest → /releases/tag/<TAG>, then HEAD the
   * predictable asset URLs to verify existence + size. */
  if (!release) {
    try {
      const page = await fetch(`https://github.com/${REPO}/releases/latest`, {
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(9000),
        headers: { "User-Agent": "jarvis-site" },
      });
      const m = new URL(page.url).pathname.match(/\/releases\/tag\/([^/?#]+)/);
      if (page.ok && m) {
        const tag = decodeURIComponent(m[1]);
        const assets: { name: string; url: string; size: number }[] = [];
        for (const name of ["archer.exe", "archer.apk"]) {
          const url = `https://github.com/${REPO}/releases/download/${tag}/${name}`;
          const head = await fetch(url, {
            method: "HEAD",
            redirect: "follow",
            cache: "no-store",
            signal: AbortSignal.timeout(9000),
            headers: { "User-Agent": "jarvis-site" },
          });
          if (head.ok) {
            assets.push({ name, url, size: Number(head.headers.get("content-length") || 0) });
          }
        }
        if (assets.length) {
          release = { tag, url: `https://github.com/${REPO}/releases/tag/${tag}`, assets };
        }
      }
    } catch {
      release = null;
    }
  }

  g.__jarvisReleaseCache = { at: Date.now(), release };
  return release;
}

function pickAsset(release: NonNullable<Cache["release"]>, platform: string) {
  const assets = release.assets;
  if (platform === "windows") {
    return (
      assets.find((a) => /^archer\.exe$/i.test(a.name)) ||
      assets.find((a) => /^archer.*\.exe$/i.test(a.name)) ||
      assets.find((a) => /\.exe$/i.test(a.name))
    );
  }
  if (platform === "android") {
    return assets.find((a) => /^archer.*\.apk$/i.test(a.name)) || assets.find((a) => /\.apk$/i.test(a.name));
  }
  return undefined;
}

// GET /api/download?platform=windows|android        → 302 to the release asset
// GET /api/download?platform=windows&meta=1         → JSON info (no redirect)
export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get("platform") === "android" ? "android" : "windows";
  const metaOnly = req.nextUrl.searchParams.get("meta") === "1";

  const release = await latestRelease();
  if (!release) {
    return NextResponse.json(
      {
        available: false,
        reason: "No release build yet. GitHub Actions builds archer.exe & archer.apk automatically — see the Actions tab.",
        repo: REPO,
        actions: `https://github.com/${REPO}/actions`,
      },
      { status: 404 }
    );
  }

  const asset = pickAsset(release, platform);
  if (!asset) {
    return NextResponse.json(
      {
        available: false,
        reason: `No ${platform} asset in release ${release.tag}.`,
        repo: REPO,
        actions: `https://github.com/${REPO}/actions`,
        release: release.url,
      },
      { status: 404 }
    );
  }

  if (metaOnly) {
    return NextResponse.json({ available: true, tag: release.tag, name: asset.name, size: asset.size, url: asset.url });
  }

  return NextResponse.redirect(asset.url, 302);
}
