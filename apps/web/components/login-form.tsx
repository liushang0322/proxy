"use client";

import { useState } from "react";

export function LoginForm() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Login failed");
      setSubmitting(false);
      return;
    }

    window.location.href = "/";
  }

  return (
    <form onSubmit={handleSubmit} className="panel login-card">
      <div className="hero">
        <h1>VPN Control</h1>
        <p>Sign in to manage sing-box, subscriptions, and deployment state for vpn.lshang.top.</p>
      </div>

      <div className="stack">
        <label className="field">
          <span>Username</span>
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
      </div>

      <div className="actions">
        <button className="button" disabled={submitting} type="submit">
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </div>

      {error ? <div className="status-line warn">{error}</div> : null}
    </form>
  );
}

