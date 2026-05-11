const test = require("node:test");
const assert = require("node:assert/strict");
const YAML = require("yaml");

function buildSingBoxConfig(server, proxy, clients) {
  const enabledClients = clients.filter((client) => client.enabled);
  const config = {
    inbounds: [
      {
        type: "hysteria2",
        listen_port: server.hysteriaPort,
        users: enabledClients.map((client) => ({ password: client.hy2Password }))
      }
    ]
  };
  if (proxy.enableTrojan) {
    config.inbounds.push({
      type: "trojan",
      listen_port: server.trojanPort,
      users: enabledClients.map((client) => ({ password: client.trojanPassword }))
    });
  }
  return config;
}

function stringifyClashConfig(server, proxy, client) {
  return YAML.stringify({
    proxies: [
      { name: `${client.displayName} HY2`, type: "hysteria2", port: server.hysteriaPort },
      ...(proxy.enableTrojan
        ? [{ name: `${client.displayName} Trojan`, type: "trojan", port: server.trojanPort }]
        : [])
    ],
    "proxy-groups": [{ name: "Proxy", type: "select", proxies: ["DIRECT"] }],
    rules: ["MATCH,Proxy"]
  });
}

const server = { hysteriaPort: 443, trojanPort: 8443 };
const proxy = { enableTrojan: true };
const clients = [
  { displayName: "Owner", hy2Password: "hy2", trojanPassword: "trojan", enabled: true }
];

test("builds sing-box config with Hysteria2 and Trojan users", () => {
  const config = buildSingBoxConfig(server, proxy, clients);
  assert.equal(config.inbounds.length, 2);
  assert.equal(config.inbounds[0].type, "hysteria2");
  assert.equal(config.inbounds[1].type, "trojan");
});

test("builds a Clash profile with fallback proxy group", () => {
  const profile = YAML.parse(stringifyClashConfig(server, proxy, clients[0]));
  assert.equal(profile.proxies.length, 2);
  assert.equal(profile.rules[0], "MATCH,Proxy");
});
