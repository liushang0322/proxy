import YAML from "yaml";

type ServerSettingsLike = {
  domain: string;
  serverIp: string;
  hysteriaPort: number;
  trojanPort: number;
  certificatePath: string;
  privateKeyPath: string;
};

type ProxyProfileLike = {
  hy2ObfsPassword: string;
  hy2UpMbps: number;
  hy2DownMbps: number;
  enableTrojan: boolean;
  masqueradeUrl: string;
};

type ClientProfileLike = {
  id: string;
  name: string;
  displayName: string;
  token: string;
  hy2Password: string;
  trojanPassword: string;
  enabled: boolean;
};

export function buildSingBoxConfig(
  server: ServerSettingsLike,
  proxy: ProxyProfileLike,
  clients: ClientProfileLike[]
) {
  const enabledClients = clients.filter((client) => client.enabled);

  const inbounds: Array<Record<string, unknown>> = [
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
    log: {
      level: "info",
      timestamp: true
    },
    inbounds,
    outbounds: [
      {
        type: "direct",
        tag: "direct"
      },
      {
        type: "block",
        tag: "block"
      }
    ],
    route: {
      final: "direct"
    }
  };
}

export function stringifySingBoxConfig(
  server: ServerSettingsLike,
  proxy: ProxyProfileLike,
  clients: ClientProfileLike[]
) {
  return JSON.stringify(buildSingBoxConfig(server, proxy, clients), null, 2);
}

export function buildClashConfig(
  server: ServerSettingsLike,
  proxy: ProxyProfileLike,
  client: ClientProfileLike
) {
  const hysteriaName = `${client.displayName} HY2`;
  const trojanName = `${client.displayName} Trojan`;
  const proxies: Array<Record<string, unknown>> = [
    {
      name: hysteriaName,
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

  const groupMembers = [hysteriaName];

  if (proxy.enableTrojan) {
    proxies.push({
      name: trojanName,
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
    groupMembers.push(trojanName);
  }

  groupMembers.push("DIRECT");

  return {
    "mixed-port": 7890,
    "allow-lan": true,
    mode: "rule",
    "log-level": "info",
    proxies,
    "proxy-groups": [
      {
        name: "Proxy",
        type: "select",
        proxies: groupMembers
      }
    ],
    rules: ["MATCH,Proxy"]
  };
}

export function stringifyClashConfig(
  server: ServerSettingsLike,
  proxy: ProxyProfileLike,
  client: ClientProfileLike
) {
  return YAML.stringify(buildClashConfig(server, proxy, client));
}

export function buildShadowrocketText(
  server: ServerSettingsLike,
  proxy: ProxyProfileLike,
  client: ClientProfileLike
) {
  const hy2Name = encodeURIComponent(`${client.displayName} HY2`);
  const trojanName = encodeURIComponent(`${client.displayName} Trojan`);
  const hysteriaUri =
    `hysteria2://${encodeURIComponent(client.hy2Password)}@${server.domain}:${server.hysteriaPort}` +
    `?sni=${encodeURIComponent(server.domain)}` +
    `&obfs=salamander&obfs-password=${encodeURIComponent(proxy.hy2ObfsPassword)}` +
    `&upmbps=${proxy.hy2UpMbps}&downmbps=${proxy.hy2DownMbps}#${hy2Name}`;

  const lines = [
    `# ${client.displayName}`,
    "# Import the Hysteria2 line first in Shadowrocket.",
    hysteriaUri
  ];

  if (proxy.enableTrojan) {
    const trojanUri =
      `trojan://${encodeURIComponent(client.trojanPassword)}@${server.domain}:${server.trojanPort}` +
      `?peer=${encodeURIComponent(server.domain)}&sni=${encodeURIComponent(server.domain)}#${trojanName}`;
    lines.push("", "# Fallback Trojan line", trojanUri);
  }

  return lines.join("\n");
}

export type DashboardSnapshot = {
  server: ServerSettingsLike;
  proxy: ProxyProfileLike;
  clients: ClientProfileLike[];
};
