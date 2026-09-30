/* JARVIS desktop (Windows) — Electron main process.
 * Loads the JARVIS website (same brain, same UI, same voice).
 * First run shows a built-in "server picker" if no site URL is configured. */
const { app, BrowserWindow, Menu, session, shell, ipcMain, dialog } = require("electron");
const fs = require("fs");
const path = require("path");

const APP_NAME = "JARVIS";

/* ---------- config (userData/config.json) ---------- */
function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    return {};
  }
}
function saveConfig(patch) {
  const cfg = { ...loadConfig(), ...patch };
  try {
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
  } catch {
    /* noop */
  }
  return cfg;
}

/* default site URL — baked at build time (CI) or bundled default-site.json */
function bakedSiteUrl() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, "default-site.json"), "utf8"));
    return (j.siteUrl || "").trim();
  } catch {
    return "";
  }
}

function resolveSiteUrl() {
  return (
    process.env.JARVIS_SITE_URL ||
    loadConfig().serverUrl ||
    bakedSiteUrl() ||
    ""
  ).trim();
}

function isProbablyUrl(u) {
  try {
    const url = new URL(u.startsWith("http") ? u : `https://${u}`);
    return !!url.hostname && url.hostname.includes(".");
  } catch {
    return false;
  }
}

let mainWindow = null;

/* ---------- first-run / "switch server" setup page (self-contained) ---------- */
const SETUP_HTML = `data:text/html;charset=utf8,${encodeURIComponent(`<!doctype html>
<html><head><meta charset="utf-8"><title>JARVIS — Setup</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',system-ui,sans-serif}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(120% 90% at 50% 30%, #042c22 0%, #021410 45%, #010604 100%);color:#d1fae5}
  .card{width:min(520px,92vw);border:1px solid rgba(16,185,129,.35);border-radius:18px;padding:40px 36px;background:rgba(1,10,8,.6);box-shadow:0 0 60px rgba(16,185,129,.15)}
  h1{letter-spacing:.4em;font-size:22px;color:#6ee7b7;text-align:center;margin-bottom:6px}
  p.sub{letter-spacing:.28em;font-size:9px;color:#34d39988;text-align:center;margin-bottom:30px}
  label{display:block;font-size:11px;letter-spacing:.15em;color:#a7f3d0;margin-bottom:8px}
  input{width:100%;padding:13px 16px;border-radius:12px;border:1px solid rgba(16,185,129,.4);background:#010806;color:#d1fae5;font-size:14px;outline:none}
  input:focus{border-color:#6ee7b7;box-shadow:0 0 18px rgba(16,185,129,.25)}
  .hint{font-size:11px;color:#d1fae566;line-height:1.6;margin:14px 0 24px}
  button{width:100%;padding:14px;border-radius:999px;border:1px solid rgba(167,243,208,.6);background:rgba(16,185,129,.15);color:#ecfdf5;font-size:13px;font-weight:700;letter-spacing:.3em;cursor:pointer}
  button:hover{background:rgba(16,185,129,.3)}
  .err{color:#fca5a5;font-size:11px;margin-top:10px;display:none}
</style></head>
<body><div class="card">
  <h1>JARVIS</h1>
  <p class="sub">JUST A RATHER VERY INTELLIGENT SYSTEM</p>
  <label>JARVIS WEBSITE URL</label>
  <input id="u" placeholder="https://your-jarvis-site.example.com" autofocus>
  <p class="hint">Enter the address of your JARVIS website (the Next.js app you deployed — e.g. your z.ai preview link, a Vercel URL or your own server).<br>
  The desktop app is a window into the SAME brain: tasks, memory, settings and the AI voice stay in sync.</p>
  <button id="go">CONNECT</button>
  <p class="err" id="err">That doesn't look like a URL, sir. Try again.</p>
</div>
<script>
  const u=document.getElementById('u'),err=document.getElementById('err');
  function save(){
    const v=u.value.trim();if(!v)return;
    if(!/^https?:\\/\\//i.test(v)&&!v.includes('.')){err.style.display='block';return}
    window.jarvisDesktop.saveServer(v);
  }
  document.getElementById('go').onclick=save;u.onkeydown=e=>{if(e.key==='Enter')save()};
</script>
</body></html>`)}`;

function createWindow(siteUrl) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 420,
    minHeight: 640,
    backgroundColor: "#010604",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "build", "icon.png"),
    title: APP_NAME,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (siteUrl) {
    mainWindow.loadURL(siteUrl);
  } else {
    mainWindow.loadURL(SETUP_HTML);
  }

  // open_app / "Open in YouTube" actions → real browser, like a proper desktop app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url) && !url.includes("#internal")) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    if (url && url.startsWith("data:")) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog
        .showMessageBox(mainWindow, {
          type: "error",
          title: APP_NAME,
          message: `Could not reach the JARVIS website (${desc}).`,
          detail: "Check the URL and your internet connection, then press OK to re-enter the address.",
          buttons: ["OK"],
        })
        .then(() => {
          saveConfig({ serverUrl: "" });
          mainWindow.loadURL(SETUP_HTML);
        });
    }
  });
}

/* ---------- permissions: always allow the microphone inside the app ---------- */
app.whenReady().then(() => {
  app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === "media" || permission === "notifications" || permission === "clipboard-sanitized-write");
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) =>
    ["media", "notifications", "clipboard-sanitized-write"].includes(permission)
  );

  ipcMain.handle("jarvis-save-server", (_e, url) => {
    const clean = String(url || "").trim();
    if (!isProbablyUrl(clean)) return { ok: false };
    const full = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
    saveConfig({ serverUrl: full });
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(full);
    return { ok: true, url: full };
  });

  const template = [
    {
      label: "JARVIS",
      submenu: [
        {
          label: "Switch Server…",
          accelerator: "CmdOrCtrl+S",
          click: () => mainWindow && mainWindow.loadURL(SETUP_HTML),
        },
        { type: "separator" },
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  createWindow(resolveSiteUrl());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(resolveSiteUrl());
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
