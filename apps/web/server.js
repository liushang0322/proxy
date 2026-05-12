const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const Docker = require("dockerode");
const express = require("express");
const YAML = require("yaml");

const env = {
  appDomain: process.env.APP_DOMAIN || "vpn.lshang.top",
  serverIp: process.env.SERVER_IP || "43.108.35.79",
  sessionSecret: process.env.SESSION_SECRET || "dev-only-session-secret",
  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "admin123456",
  panelPublicPort: Number(process.env.PANEL_PUBLIC_PORT || 3001),
  runtimeDir: process.env.RUNTIME_DIR || path.resolve(process.cwd(), "../../runtime"),
  certificatePath:
    process.env.CERTIFICATE_PATH ||
    "/etc/letsencrypt/live/vpn.lshang.top/fullchain.pem",
  privateKeyPath:
    process.env.PRIVATE_KEY_PATH ||
    "/etc/letsencrypt/live/vpn.lshang.top/privkey.pem",
  singboxContainerName: process.env.SINGBOX_CONTAINER_NAME || "sing-box",
  port: Number(process.env.PORT || 3000)
};

const runtimePaths = {
  root: env.runtimeDir,
  dataDir: path.join(env.runtimeDir, "data"),
  generatedDir: path.join(env.runtimeDir, "generated"),
  stateFile: path.join(env.runtimeDir, "data", "state.json"),
  metadataFile: path.join(env.runtimeDir, "generated", "deploy-metadata.json"),
  singBoxConfig: path.join(env.runtimeDir, "generated", "sing-box.json")
};

function randomSecret(size = 18) {
  return crypto.randomBytes(size).toString("base64url");
}

function sign(value) {
  return crypto.createHmac("sha256", env.sessionSecret).update(value).digest("hex");
}

function createSession(username) {
  const payload = Buffer.from(
    JSON.stringify({
      username,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14
    })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function parseSession(token) {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || sign(payload) !== sig) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
}

async function ensureRuntimeDirectories() {
  await fs.mkdir(runtimePaths.dataDir, { recursive: true });
  await fs.mkdir(runtimePaths.generatedDir, { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readState() {
  await ensureRuntimeDirectories();
  try {
    const raw = await fs.readFile(runtimePaths.stateFile, "utf8");
    const parsed = applyMigrations(JSON.parse(raw));
    await writeState(parsed);
    return parsed;
  } catch {
    const passwordHash = await bcrypt.hash(env.adminPassword, 10);
    const initial = {
      admin: {
        username: env.adminUsername,
        passwordHash
      },
      server: {
        domain: env.appDomain,
        serverIp: env.serverIp,
        certificatePath: env.certificatePath,
        privateKeyPath: env.privateKeyPath,
        panelPort: 443,
        hysteriaPort: 2443,
        trojanPort: 8443
      },
      proxy: {
        hy2ObfsPassword: randomSecret(),
        hy2UpMbps: 100,
        hy2DownMbps: 100,
        enableTrojan: true,
        masqueradeUrl: "https://www.apple.com"
      },
      metaVersion: 2,
      clients: [
        {
          id: crypto.randomUUID(),
          name: "owner",
          displayName: "管理员设备",
          token: randomSecret(),
          hy2Password: randomSecret(),
          trojanPassword: randomSecret(),
          enabled: true
        }
      ]
    };
    await writeState(initial);
    return initial;
  }
}

function applyMigrations(state) {
  if (!state.metaVersion) {
    if (state.server && state.server.hysteriaPort === 443) {
      state.server.hysteriaPort = 2443;
    }
    state.metaVersion = 2;
  }
  return state;
}

async function writeState(state) {
  await ensureRuntimeDirectories();
  await fs.writeFile(runtimePaths.stateFile, JSON.stringify(state, null, 2), "utf8");
}

function getDocker() {
  return new Docker({ socketPath: "/var/run/docker.sock" });
}

async function getDockerStatus() {
  try {
    const docker = getDocker();
    await docker.ping();
    const inspection = await docker.getContainer(env.singboxContainerName).inspect();
    return {
      available: true,
      containerName: env.singboxContainerName,
      containerState: inspection.State?.Status || "unknown"
    };
  } catch (error) {
    return {
      available: false,
      containerName: env.singboxContainerName,
      containerState: "unavailable",
      message: error instanceof Error ? error.message : "Unable to reach Docker"
    };
  }
}

async function restartSingBoxContainer() {
  await getDocker().getContainer(env.singboxContainerName).restart();
}

function buildSingBoxConfig(server, proxy, clients) {
  const enabledClients = clients.filter((client) => client.enabled);
  const inbounds = [
    {
      type: "hysteria2",
      tag: "hy2-in",
      listen: "::",
      listen_port: server.hysteriaPort,
      up_mbps: proxy.hy2UpMbps,
      down_mbps: proxy.hy2DownMbps,
      users: enabledClients.map((client) => ({
        name: client.displayName,
        password: client.hy2Password
      })),
      obfs: {
        type: "salamander",
        password: proxy.hy2ObfsPassword
      },
      ignore_client_bandwidth: false,
      tls: {
        enabled: true,
        server_name: server.domain,
        alpn: ["h3"],
        certificate_path: server.certificatePath,
        key_path: server.privateKeyPath
      },
      masquerade: proxy.masqueradeUrl
    }
  ];

  if (proxy.enableTrojan) {
    inbounds.push({
      type: "trojan",
      tag: "trojan-in",
      listen: "::",
      listen_port: server.trojanPort,
      users: enabledClients.map((client) => ({
        name: client.displayName,
        password: client.trojanPassword
      })),
      tls: {
        enabled: true,
        server_name: server.domain,
        alpn: ["h2", "http/1.1"],
        certificate_path: server.certificatePath,
        key_path: server.privateKeyPath
      }
    });
  }

  return {
    log: { level: "info", timestamp: true },
    inbounds,
    outbounds: [{ type: "direct", tag: "direct" }, { type: "block", tag: "block" }],
    route: { final: "direct" }
  };
}

function stringifyClashConfig(server, proxy, client) {
  const proxies = [
    {
      name: `${client.displayName} HY2`,
      type: "hysteria2",
      server: server.domain,
      port: server.hysteriaPort,
      password: client.hy2Password,
      up: `${proxy.hy2UpMbps} Mbps`,
      down: `${proxy.hy2DownMbps} Mbps`,
      obfs: "salamander",
      "obfs-password": proxy.hy2ObfsPassword,
      sni: server.domain,
      alpn: ["h3"],
      "skip-cert-verify": false
    }
  ];

  const groupMembers = [`${client.displayName} HY2`];
  if (proxy.enableTrojan) {
    proxies.push({
      name: `${client.displayName} Trojan`,
      type: "trojan",
      server: server.domain,
      port: server.trojanPort,
      password: client.trojanPassword,
      udp: true,
      sni: server.domain,
      alpn: ["h2", "http/1.1"],
      "skip-cert-verify": false,
      network: "tcp"
    });
    groupMembers.push(`${client.displayName} Trojan`);
  }
  groupMembers.push("DIRECT");

  return YAML.stringify({
    "mixed-port": 7890,
    "allow-lan": true,
    mode: "rule",
    "log-level": "info",
    proxies,
    "proxy-groups": [{ name: "Proxy", type: "select", proxies: groupMembers }],
    rules: ["MATCH,Proxy"]
  });
}

function buildShadowrocketText(server, proxy, client) {
  const hy2Name = encodeURIComponent(`${client.displayName} HY2`);
  const trojanName = encodeURIComponent(`${client.displayName} Trojan`);
  const lines = [
    `# ${client.displayName}`,
    "# 先在 Shadowrocket 中导入下面这条 Hysteria2 主线路。",
    `hysteria2://${encodeURIComponent(client.hy2Password)}@${server.domain}:${server.hysteriaPort}?sni=${encodeURIComponent(server.domain)}&obfs=salamander&obfs-password=${encodeURIComponent(proxy.hy2ObfsPassword)}&upmbps=${proxy.hy2UpMbps}&downmbps=${proxy.hy2DownMbps}#${hy2Name}`
  ];
  if (proxy.enableTrojan) {
    lines.push(
      "",
      "# 备用 Trojan 线路",
      `trojan://${encodeURIComponent(client.trojanPassword)}@${server.domain}:${server.trojanPort}?peer=${encodeURIComponent(server.domain)}&sni=${encodeURIComponent(server.domain)}#${trojanName}`
    );
  }
  return lines.join("\n");
}

async function writeGeneratedConfig(configText) {
  await ensureRuntimeDirectories();
  await fs.writeFile(runtimePaths.singBoxConfig, configText, "utf8");
  await fs.writeFile(
    runtimePaths.metadataFile,
    JSON.stringify({ updatedAt: new Date().toISOString(), configPath: runtimePaths.singBoxConfig }, null, 2),
    "utf8"
  );
}

async function readDeployMetadata() {
  try {
    return JSON.parse(await fs.readFile(runtimePaths.metadataFile, "utf8"));
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const session = parseSession(req.cookies.vpn_admin_session);
  if (!session) {
    if (req.path.startsWith("/api/")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return res.redirect("/login");
  }
  req.session = session;
  next();
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderLogin(error = "") {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>代理控制台</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#efe8dd;font-family:Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#1f1e1b}
.card{width:min(460px,calc(100vw - 24px));background:#fffdf8;border:1px solid rgba(31,30,27,.12);border-radius:22px;padding:24px;box-shadow:0 18px 60px rgba(71,52,36,.12)}
input{width:100%;padding:12px 14px;border-radius:14px;border:1px solid rgba(31,30,27,.15);box-sizing:border-box;margin-top:8px}
button{margin-top:16px;border:0;background:#c44b2d;color:#fff;padding:11px 18px;border-radius:999px;cursor:pointer}
.muted{color:#655f56}.warn{color:#a65011}
</style></head><body><form class="card" method="post" action="/api/auth/login">
<h1>代理控制台</h1><p class="muted">登录后管理 vpn.lshang.top 的面板、节点和订阅。</p>
<label>账号<input name="username" value="${esc(env.adminUsername)}"></label>
<label>密码<input type="password" name="password"></label>
${error ? `<p class="warn">${esc(error)}</p>` : ""}
<button type="submit">登录</button></form></body></html>`;
}

function renderDashboard(state, status) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>vpn.lshang.top</title>
<style>
:root{--bg:#f3efe6;--panel:#fffdf8;--text:#1f1e1b;--muted:#655f56;--line:rgba(31,30,27,.12);--accent:#c44b2d}
*{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#f7f1e7 0%,#efe8dd 100%);font-family:Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:var(--text)}
.shell{width:min(1200px,calc(100vw - 24px));margin:0 auto;padding:24px 0 48px}.panel{background:rgba(255,253,248,.9);border:1px solid var(--line);border-radius:22px;padding:18px;box-shadow:0 18px 60px rgba(71,52,36,.12)}
.grid{display:grid;gap:16px}.cards{grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}.two{grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
input,textarea{width:100%;padding:12px 14px;border-radius:14px;border:1px solid rgba(31,30,27,.15);background:#fff}button{border:0;background:var(--accent);color:#fff;padding:11px 18px;border-radius:999px;cursor:pointer}
button.secondary{background:rgba(31,30,27,.08);color:var(--text)}.row{display:flex;gap:12px;flex-wrap:wrap}.muted{color:var(--muted)}.mono{font-family:Consolas,monospace;word-break:break-all}
a{color:inherit;text-decoration:none}h1,h2,h3{margin:0 0 10px}label{display:grid;gap:8px}.section{margin-top:16px}.client{border:1px solid var(--line);border-radius:18px;padding:14px;background:#fff}
</style></head><body><div class="shell">
<div class="row" style="justify-content:space-between;align-items:center"><div><h1>vpn.lshang.top</h1><p class="muted">轻量代理控制台，用于管理 sing-box 和客户端订阅。</p></div><form method="post" action="/api/auth/logout"><button class="secondary">退出登录</button></form></div>
<div class="grid cards section">
<div class="panel"><div class="muted">Docker / sing-box</div><h2>${esc(status.docker.containerState)}</h2><div class="muted">${esc(status.docker.available ? "Docker 连接正常" : status.docker.message || "不可用")}</div></div>
<div class="panel"><div class="muted">TLS 证书</div><h2>${status.certificatePresent && status.privateKeyPresent ? "已就绪" : "缺失"}</h2><div class="muted">证书 ${status.certificatePresent ? "存在" : "缺失"} / 私钥 ${status.privateKeyPresent ? "存在" : "缺失"}</div></div>
<div class="panel"><div class="muted">启用中的客户端</div><h2>${state.clients.filter((item) => item.enabled).length}</h2><div class="muted">总共 ${state.clients.length} 个配置</div></div>
<div class="panel"><div class="muted">上次部署时间</div><h2>${esc(status.lastDeployAt || "从未部署")}</h2><div class="muted">${esc(state.server.domain)}</div></div>
</div>
<div class="grid two section">
<form class="panel" method="post" action="/settings/server">
<h2>服务器设置</h2>
<div class="grid two">
<label>域名<input name="domain" value="${esc(state.server.domain)}"></label>
<label>服务器 IP<input name="serverIp" value="${esc(state.server.serverIp)}"></label>
<label>证书路径<input name="certificatePath" value="${esc(state.server.certificatePath)}"></label>
<label>私钥路径<input name="privateKeyPath" value="${esc(state.server.privateKeyPath)}"></label>
<label>Hysteria2 UDP 端口<input name="hysteriaPort" type="number" value="${esc(state.server.hysteriaPort)}"></label>
<label>Trojan TCP 端口<input name="trojanPort" type="number" value="${esc(state.server.trojanPort)}"></label>
</div><div class="row" style="margin-top:14px"><button>保存服务器设置</button></div></form>
<form class="panel" method="post" action="/settings/proxy">
<h2>代理设置</h2>
<div class="grid two">
<label>Hysteria2 上行 Mbps<input name="hy2UpMbps" type="number" value="${esc(state.proxy.hy2UpMbps)}"></label>
<label>Hysteria2 下行 Mbps<input name="hy2DownMbps" type="number" value="${esc(state.proxy.hy2DownMbps)}"></label>
<label>Hysteria2 混淆密码<input name="hy2ObfsPassword" value="${esc(state.proxy.hy2ObfsPassword)}"></label>
<label>伪装 URL<input name="masqueradeUrl" value="${esc(state.proxy.masqueradeUrl)}"></label>
<label><span>启用 Trojan 备用线路</span><input name="enableTrojan" type="checkbox" ${state.proxy.enableTrojan ? "checked" : ""}></label>
</div><div class="row" style="margin-top:14px"><button>保存代理设置</button></div></form>
</div>
<div class="panel section"><h2>部署</h2><p class="muted">写入最新的 sing-box 配置并重启容器。</p><div class="row"><form method="post" action="/actions/deploy"><button>部署配置</button></form><form method="post" action="/actions/restart"><button class="secondary">重启 sing-box</button></form></div></div>
<div class="panel section"><h2>新增客户端</h2><form class="grid two" method="post" action="/clients"><label>唯一名称<input name="name" placeholder="mom"></label><label>显示名称<input name="displayName" placeholder="妈妈手机"></label><div class="row"><button>新增客户端</button></div></form></div>
<div class="grid cards section">
${state.clients
  .map((client) => {
    const baseUrl = `https://${state.server.domain}`;
    return `<div class="client"><h3>${esc(client.displayName)}</h3><div class="muted mono">${esc(client.name)}</div>
    <form class="grid" method="post" action="/clients/${client.id}" style="margin-top:12px">
    <label>显示名称<input name="displayName" value="${esc(client.displayName)}"></label>
    <label><span>启用</span><input type="checkbox" name="enabled" ${client.enabled ? "checked" : ""}></label>
    <div class="row"><button class="secondary">保存客户端</button><button class="secondary" formaction="/clients/${client.id}/rotate" formmethod="post">重置密钥</button></div></form>
    <div class="grid" style="margin-top:12px">
    <a class="mono" target="_blank" href="${baseUrl}/api/subscriptions/clash/${client.token}">${baseUrl}/api/subscriptions/clash/${client.token}</a>
    <a class="mono" target="_blank" href="${baseUrl}/api/subscriptions/shadowrocket/${client.token}">${baseUrl}/api/subscriptions/shadowrocket/${client.token}</a>
    </div></div>`;
  })
  .join("")}
</div></div></body></html>`;
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.get("/login", async (req, res) => {
  if (parseSession(req.cookies.vpn_admin_session)) {
    return res.redirect("/");
  }
  res.send(renderLogin(req.query.error || ""));
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  const state = await readState();
  const ok =
    username === state.admin.username && (await bcrypt.compare(password || "", state.admin.passwordHash));
  if (!ok) {
    if ((req.headers["content-type"] || "").includes("application/json")) {
      return res.status(401).json({ error: "账号或密码错误" });
    }
    return res.redirect("/login?error=%E8%B4%A6%E5%8F%B7%E6%88%96%E5%AF%86%E7%A0%81%E9%94%99%E8%AF%AF");
  }
  res.cookie("vpn_admin_session", createSession(username), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });
  if ((req.headers["content-type"] || "").includes("application/json")) {
    return res.json({ ok: true });
  }
  res.redirect("/");
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("vpn_admin_session", { path: "/" });
  res.redirect("/login");
});

app.get("/", requireAuth, async (req, res) => {
  const state = await readState();
  const [docker, certificatePresent, privateKeyPresent, deployMeta] = await Promise.all([
    getDockerStatus(),
    fileExists(state.server.certificatePath),
    fileExists(state.server.privateKeyPath),
    readDeployMetadata()
  ]);
  res.send(
    renderDashboard(state, {
      docker,
      certificatePresent,
      privateKeyPresent,
      lastDeployAt: deployMeta?.updatedAt || null
    })
  );
});

app.get("/api/system/status", requireAuth, async (req, res) => {
  const state = await readState();
  const [docker, certificatePresent, privateKeyPresent, deployMeta] = await Promise.all([
    getDockerStatus(),
    fileExists(state.server.certificatePath),
    fileExists(state.server.privateKeyPath),
    readDeployMetadata()
  ]);
  res.json({
    ...state,
    status: {
      docker,
      certificatePresent,
      privateKeyPresent,
      lastDeployAt: deployMeta?.updatedAt || null
    }
  });
});

app.get("/api/settings/server", requireAuth, async (req, res) => {
  res.json((await readState()).server);
});

app.put("/api/settings/server", requireAuth, async (req, res) => {
  const state = await readState();
  state.server = {
    ...state.server,
    domain: req.body.domain,
    serverIp: req.body.serverIp,
    certificatePath: req.body.certificatePath,
    privateKeyPath: req.body.privateKeyPath,
    hysteriaPort: Number(req.body.hysteriaPort),
    trojanPort: Number(req.body.trojanPort)
  };
  await writeState(state);
  res.json({ server: state.server });
});

app.post("/settings/server", requireAuth, async (req, res) => {
  const state = await readState();
  state.server = {
    ...state.server,
    domain: req.body.domain,
    serverIp: req.body.serverIp,
    certificatePath: req.body.certificatePath,
    privateKeyPath: req.body.privateKeyPath,
    hysteriaPort: Number(req.body.hysteriaPort),
    trojanPort: Number(req.body.trojanPort)
  };
  await writeState(state);
  res.redirect("/");
});

app.get("/api/settings/proxy", requireAuth, async (req, res) => {
  res.json((await readState()).proxy);
});

app.put("/api/settings/proxy", requireAuth, async (req, res) => {
  const state = await readState();
  state.proxy = {
    ...state.proxy,
    hy2ObfsPassword: req.body.hy2ObfsPassword,
    hy2UpMbps: Number(req.body.hy2UpMbps),
    hy2DownMbps: Number(req.body.hy2DownMbps),
    enableTrojan: Boolean(req.body.enableTrojan),
    masqueradeUrl: req.body.masqueradeUrl
  };
  await writeState(state);
  res.json({ proxy: state.proxy });
});

app.post("/settings/proxy", requireAuth, async (req, res) => {
  const state = await readState();
  state.proxy = {
    ...state.proxy,
    hy2ObfsPassword: req.body.hy2ObfsPassword,
    hy2UpMbps: Number(req.body.hy2UpMbps),
    hy2DownMbps: Number(req.body.hy2DownMbps),
    enableTrojan: req.body.enableTrojan === "on",
    masqueradeUrl: req.body.masqueradeUrl
  };
  await writeState(state);
  res.redirect("/");
});

app.get("/api/clients", requireAuth, async (req, res) => {
  res.json({ clients: (await readState()).clients });
});

app.post("/api/clients", requireAuth, async (req, res) => {
  const state = await readState();
  const client = {
    id: crypto.randomUUID(),
    name: String(req.body.name || "").trim(),
    displayName: String(req.body.displayName || "").trim(),
    token: randomSecret(),
    hy2Password: randomSecret(),
    trojanPassword: randomSecret(),
    enabled: true
  };
  state.clients.push(client);
  await writeState(state);
  res.json({ client });
});

app.post("/clients", requireAuth, async (req, res) => {
  const state = await readState();
  state.clients.push({
    id: crypto.randomUUID(),
    name: String(req.body.name || "").trim(),
    displayName: String(req.body.displayName || "").trim(),
    token: randomSecret(),
    hy2Password: randomSecret(),
    trojanPassword: randomSecret(),
    enabled: true
  });
  await writeState(state);
  res.redirect("/");
});

app.put("/api/clients", requireAuth, async (req, res) => {
  const state = await readState();
  const client = state.clients.find((item) => item.id === req.body.id);
  if (!client) return res.status(404).json({ error: "客户端不存在" });
  if (typeof req.body.displayName === "string") client.displayName = req.body.displayName.trim();
  if (typeof req.body.enabled === "boolean") client.enabled = req.body.enabled;
  if (req.body.rotateSecrets) {
    client.token = randomSecret();
    client.hy2Password = randomSecret();
    client.trojanPassword = randomSecret();
  }
  await writeState(state);
  res.json({ client });
});

app.post("/clients/:id", requireAuth, async (req, res) => {
  const state = await readState();
  const client = state.clients.find((item) => item.id === req.params.id);
  if (client) {
    client.displayName = String(req.body.displayName || client.displayName).trim();
    client.enabled = req.body.enabled === "on";
    await writeState(state);
  }
  res.redirect("/");
});

app.post("/clients/:id/rotate", requireAuth, async (req, res) => {
  const state = await readState();
  const client = state.clients.find((item) => item.id === req.params.id);
  if (client) {
    client.token = randomSecret();
    client.hy2Password = randomSecret();
    client.trojanPassword = randomSecret();
    await writeState(state);
  }
  res.redirect("/");
});

app.post("/api/proxy/deploy", requireAuth, async (req, res) => {
  const state = await readState();
  await writeGeneratedConfig(JSON.stringify(buildSingBoxConfig(state.server, state.proxy, state.clients), null, 2));
  let restarted = false;
  try {
    await restartSingBoxContainer();
    restarted = true;
  } catch {}
  res.json({ ok: true, restarted });
});

app.post("/actions/deploy", requireAuth, async (req, res) => {
  const state = await readState();
  await writeGeneratedConfig(JSON.stringify(buildSingBoxConfig(state.server, state.proxy, state.clients), null, 2));
  try {
    await restartSingBoxContainer();
  } catch {}
  res.redirect("/");
});

app.post("/api/proxy/restart", requireAuth, async (req, res) => {
  try {
    await restartSingBoxContainer();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unable to restart sing-box" });
  }
});

app.post("/actions/restart", requireAuth, async (req, res) => {
  try {
    await restartSingBoxContainer();
  } catch {}
  res.redirect("/");
});

app.get("/api/subscriptions/clash/:token", async (req, res) => {
  const state = await readState();
  const client = state.clients.find((item) => item.token === req.params.token && item.enabled);
  if (!client) return res.status(404).send("Not found");
  res.setHeader("Content-Type", "text/yaml; charset=utf-8");
  res.send(stringifyClashConfig(state.server, state.proxy, client));
});

app.get("/api/subscriptions/shadowrocket/:token", async (req, res) => {
  const state = await readState();
  const client = state.clients.find((item) => item.token === req.params.token && item.enabled);
  if (!client) return res.status(404).send("Not found");
  res.type("text/plain").send(buildShadowrocketText(state.server, state.proxy, client));
});

app.listen(env.port, async () => {
  await readState();
  console.log(`代理控制台已启动，监听端口 :${env.port}`);
});
