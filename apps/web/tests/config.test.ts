import { describe, expect, it } from "vitest";

import { buildClashConfig, buildSingBoxConfig } from "@/lib/config";

const server = {
  domain: "vpn.lshang.top",
  serverIp: "43.108.35.79",
  hysteriaPort: 443,
  trojanPort: 8443,
  certificatePath: "/etc/letsencrypt/live/vpn.lshang.top/fullchain.pem",
  privateKeyPath: "/etc/letsencrypt/live/vpn.lshang.top/privkey.pem"
};

const proxy = {
  hy2ObfsPassword: "obfs-secret",
  hy2UpMbps: 100,
  hy2DownMbps: 200,
  enableTrojan: true,
  masqueradeUrl: "https://www.apple.com"
};

const clients = [
  {
    id: "1",
    name: "owner",
    displayName: "Owner",
    token: "token",
    hy2Password: "hy2-secret",
    trojanPassword: "trojan-secret",
    enabled: true
  }
];

describe("config builders", () => {
  it("builds sing-box config with Hysteria2 and Trojan users", () => {
    const config = buildSingBoxConfig(server, proxy, clients);

    expect(config.inbounds).toHaveLength(2);
    expect(config.inbounds[0]).toMatchObject({
      type: "hysteria2",
      listen_port: 443
    });
    expect(config.inbounds[1]).toMatchObject({
      type: "trojan",
      listen_port: 8443
    });
  });

  it("builds a Clash profile with fallback proxy group", () => {
    const profile = buildClashConfig(server, proxy, clients[0]);

    expect(profile.proxies).toHaveLength(2);
    expect(profile["proxy-groups"][0].proxies).toContain("DIRECT");
    expect(profile.rules).toContain("MATCH,Proxy");
  });
});

