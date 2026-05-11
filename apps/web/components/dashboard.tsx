"use client";

import { useMemo, useState } from "react";

type DashboardProps = {
  initialData: {
    server: {
      domain: string;
      serverIp: string;
      certificatePath: string;
      privateKeyPath: string;
      panelPort: number;
      hysteriaPort: number;
      trojanPort: number;
    };
    proxy: {
      hy2ObfsPassword: string;
      hy2UpMbps: number;
      hy2DownMbps: number;
      enableTrojan: boolean;
      masqueradeUrl: string;
    };
    clients: Array<{
      id: string;
      name: string;
      displayName: string;
      token: string;
      hy2Password: string;
      trojanPassword: string;
      enabled: boolean;
    }>;
    status: {
      docker: {
        available: boolean;
        containerName: string;
        containerState: string;
        message?: string;
      };
      certificatePresent: boolean;
      privateKeyPresent: boolean;
      lastDeployAt: string | null;
    };
  };
};

async function parseResponse(response: Response) {
  const body = (await response.json()) as { error?: string; message?: string };
  if (!response.ok) {
    throw new Error(body.error ?? body.message ?? "Request failed");
  }
  return body;
}

export function Dashboard({ initialData }: DashboardProps) {
  const [server, setServer] = useState(initialData.server);
  const [proxy, setProxy] = useState(initialData.proxy);
  const [clients, setClients] = useState(initialData.clients);
  const [status, setStatus] = useState(initialData.status);
  const [message, setMessage] = useState<string | null>(null);
  const [newClient, setNewClient] = useState({ name: "", displayName: "" });

  const baseUrl = useMemo(() => `https://${server.domain}`, [server.domain]);

  function setInfo(text: string) {
    setMessage(text);
    setTimeout(() => setMessage(null), 4500);
  }

  async function saveServer() {
    const response = await fetch("/api/settings/server", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(server)
    });
    await parseResponse(response);
    setInfo("Server settings saved.");
  }

  async function saveProxy() {
    const response = await fetch("/api/settings/proxy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(proxy)
    });
    await parseResponse(response);
    setInfo("Proxy settings saved.");
  }

  async function addClient() {
    const response = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newClient)
    });

    const body = (await parseResponse(response)) as {
      client: DashboardProps["initialData"]["clients"][number];
    };

    setClients((prev) => [...prev, body.client]);
    setNewClient({ name: "", displayName: "" });
    setInfo("Client profile created.");
  }

  async function updateClient(clientId: string, patch: Record<string, unknown>) {
    const response = await fetch("/api/clients", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: clientId, ...patch })
    });

    const body = (await parseResponse(response)) as {
      client: DashboardProps["initialData"]["clients"][number];
    };

    setClients((prev) => prev.map((client) => (client.id === clientId ? body.client : client)));
    setInfo("Client profile updated.");
  }

  async function deployProxy() {
    const response = await fetch("/api/proxy/deploy", { method: "POST" });
    const body = (await parseResponse(response)) as { restarted: boolean };
    setInfo(body.restarted ? "Configuration deployed and sing-box restarted." : "Configuration written.");
    refreshStatus();
  }

  async function restartProxy() {
    const response = await fetch("/api/proxy/restart", { method: "POST" });
    await parseResponse(response);
    setInfo("sing-box restarted.");
    refreshStatus();
  }

  async function refreshStatus() {
    const response = await fetch("/api/system/status");
    const body = (await parseResponse(response)) as DashboardProps["initialData"];
    setStatus(body.status);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="shell">
      <div className="topbar">
        <div className="hero">
          <h1>vpn.lshang.top</h1>
          <p>
            Manage Docker deployment, sing-box config, and family subscriptions for Clash Verge and
            Shadowrocket.
          </p>
        </div>

        <button className="button secondary" onClick={logout} type="button">
          Log out
        </button>
      </div>

      <div className="badge-row">
        <div className="panel metric">
          <span className="muted">Docker / sing-box</span>
          <strong>{status.docker.containerState}</strong>
          <span className={status.docker.available ? "ok" : "warn"}>
            {status.docker.available ? "Docker socket reachable" : status.docker.message ?? "Unavailable"}
          </span>
        </div>

        <div className="panel metric">
          <span className="muted">TLS files</span>
          <strong>{status.certificatePresent && status.privateKeyPresent ? "Ready" : "Missing"}</strong>
          <span className={status.certificatePresent && status.privateKeyPresent ? "ok" : "warn"}>
            cert {status.certificatePresent ? "found" : "missing"} / key{" "}
            {status.privateKeyPresent ? "found" : "missing"}
          </span>
        </div>

        <div className="panel metric">
          <span className="muted">Active clients</span>
          <strong>{clients.filter((client) => client.enabled).length}</strong>
          <span className="muted">{clients.length} total profiles</span>
        </div>

        <div className="panel metric">
          <span className="muted">Last deploy</span>
          <strong>{status.lastDeployAt ? new Date(status.lastDeployAt).toLocaleString() : "Never"}</strong>
          <span className="muted">{server.domain}</span>
        </div>
      </div>

      <div className="card-grid" style={{ marginTop: 18 }}>
        <section className="panel">
          <h2>Server Settings</h2>
          <div className="form-grid">
            <label className="field">
              <span>Domain</span>
              <input
                value={server.domain}
                onChange={(event) => setServer({ ...server, domain: event.target.value })}
              />
            </label>

            <label className="field">
              <span>Server IP</span>
              <input
                value={server.serverIp}
                onChange={(event) => setServer({ ...server, serverIp: event.target.value })}
              />
            </label>

            <label className="field">
              <span>Certificate path</span>
              <input
                value={server.certificatePath}
                onChange={(event) => setServer({ ...server, certificatePath: event.target.value })}
              />
            </label>

            <label className="field">
              <span>Private key path</span>
              <input
                value={server.privateKeyPath}
                onChange={(event) => setServer({ ...server, privateKeyPath: event.target.value })}
              />
            </label>

            <label className="field">
              <span>Hysteria2 UDP port</span>
              <input
                type="number"
                value={server.hysteriaPort}
                onChange={(event) =>
                  setServer({ ...server, hysteriaPort: Number(event.target.value) || 443 })
                }
              />
            </label>

            <label className="field">
              <span>Trojan TCP port</span>
              <input
                type="number"
                value={server.trojanPort}
                onChange={(event) =>
                  setServer({ ...server, trojanPort: Number(event.target.value) || 8443 })
                }
              />
            </label>
          </div>

          <div className="actions">
            <button className="button" onClick={saveServer} type="button">
              Save server settings
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>Proxy Settings</h2>
          <div className="form-grid">
            <label className="field">
              <span>Hysteria2 up Mbps</span>
              <input
                type="number"
                value={proxy.hy2UpMbps}
                onChange={(event) =>
                  setProxy({ ...proxy, hy2UpMbps: Number(event.target.value) || proxy.hy2UpMbps })
                }
              />
            </label>

            <label className="field">
              <span>Hysteria2 down Mbps</span>
              <input
                type="number"
                value={proxy.hy2DownMbps}
                onChange={(event) =>
                  setProxy({ ...proxy, hy2DownMbps: Number(event.target.value) || proxy.hy2DownMbps })
                }
              />
            </label>

            <label className="field">
              <span>Hysteria2 obfs password</span>
              <input
                value={proxy.hy2ObfsPassword}
                onChange={(event) => setProxy({ ...proxy, hy2ObfsPassword: event.target.value })}
              />
            </label>

            <label className="field">
              <span>Masquerade URL</span>
              <input
                value={proxy.masqueradeUrl}
                onChange={(event) => setProxy({ ...proxy, masqueradeUrl: event.target.value })}
              />
            </label>

            <label className="field">
              <span>Trojan enabled</span>
              <input
                type="checkbox"
                checked={proxy.enableTrojan}
                onChange={(event) => setProxy({ ...proxy, enableTrojan: event.target.checked })}
              />
            </label>
          </div>

          <div className="actions">
            <button className="button" onClick={saveProxy} type="button">
              Save proxy settings
            </button>
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 18 }}>
        <h2>Deployment</h2>
        <p className="muted">
          Deploy writes a fresh sing-box config into the shared runtime directory and attempts to
          restart the container through Docker.
        </p>
        <div className="actions">
          <button className="button" onClick={deployProxy} type="button">
            Deploy config
          </button>
          <button className="button secondary" onClick={restartProxy} type="button">
            Restart sing-box
          </button>
          <button className="button secondary" onClick={refreshStatus} type="button">
            Refresh status
          </button>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <h2>Client Profiles</h2>
        <div className="form-grid">
          <label className="field">
            <span>Unique name</span>
            <input
              value={newClient.name}
              onChange={(event) => setNewClient({ ...newClient, name: event.target.value })}
              placeholder="mom"
            />
          </label>

          <label className="field">
            <span>Display name</span>
            <input
              value={newClient.displayName}
              onChange={(event) => setNewClient({ ...newClient, displayName: event.target.value })}
              placeholder="Mom iPhone"
            />
          </label>
        </div>

        <div className="actions">
          <button className="button" onClick={addClient} type="button">
            Add client
          </button>
        </div>

        <div className="client-list" style={{ marginTop: 20 }}>
          {clients.map((client) => (
            <article className="client-card" key={client.id}>
              <h3>{client.displayName}</h3>
              <div className="muted mono">{client.name}</div>

              <div className="form-grid" style={{ marginTop: 14 }}>
                <label className="field">
                  <span>Display name</span>
                  <input
                    value={client.displayName}
                    onChange={(event) =>
                      setClients((prev) =>
                        prev.map((item) =>
                          item.id === client.id ? { ...item, displayName: event.target.value } : item
                        )
                      )
                    }
                  />
                </label>

                <label className="field">
                  <span>Enabled</span>
                  <input
                    type="checkbox"
                    checked={client.enabled}
                    onChange={(event) =>
                      setClients((prev) =>
                        prev.map((item) =>
                          item.id === client.id ? { ...item, enabled: event.target.checked } : item
                        )
                      )
                    }
                  />
                </label>
              </div>

              <div className="inline-actions" style={{ marginTop: 14 }}>
                <button
                  className="button secondary"
                  onClick={() =>
                    updateClient(client.id, {
                      displayName: client.displayName,
                      enabled: client.enabled
                    })
                  }
                  type="button"
                >
                  Save profile
                </button>
                <button
                  className="button secondary"
                  onClick={() => updateClient(client.id, { rotateSecrets: true })}
                  type="button"
                >
                  Rotate secrets
                </button>
              </div>

              <div className="client-links">
                <a className="mono" href={`${baseUrl}/api/subscriptions/clash/${client.token}`} target="_blank">
                  {baseUrl}/api/subscriptions/clash/{client.token}
                </a>
                <a
                  className="mono"
                  href={`${baseUrl}/api/subscriptions/shadowrocket/${client.token}`}
                  target="_blank"
                >
                  {baseUrl}/api/subscriptions/shadowrocket/{client.token}
                </a>
                <button
                  className="button secondary"
                  onClick={() =>
                    navigator.clipboard.writeText(`${baseUrl}/api/subscriptions/clash/${client.token}`)
                  }
                  type="button"
                >
                  Copy Clash link
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {message ? <div className="status-line ok">{message}</div> : null}
    </div>
  );
}

