// GitHub OAuth proxy for Decap CMS, for a Cloudflare Worker.
//
// Routes:
//   /auth      -> sends the user to GitHub to log in
//   /callback  -> GitHub returns here; the token is handed back to the CMS window
//
// Secrets and variables (set in the Worker's Settings → Variables and Secrets):
//   GITHUB_CLIENT_ID      (secret or text)  OAuth App client ID
//   GITHUB_CLIENT_SECRET  (secret)          OAuth App client secret
//   ALLOWED_ORIGIN        (text)            https://milhemet-tora.com

const SCOPE = "public_repo,user";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Page shown in the popup after GitHub redirects back. Decap's handshake:
// the popup announces itself, the CMS replies, and then the token is sent.
function callbackPage(message, allowedOrigin) {
  const payload = JSON.stringify(message).replace(/</g, "\\u003c");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Login</title></head>
<body>
<script>
  (function () {
    var allowedOrigin = ${JSON.stringify(allowedOrigin)};
    var message = ${payload};
    function receive(e) {
      if (e.origin !== allowedOrigin) return;
      window.removeEventListener("message", receive, false);
      window.opener.postMessage(message, e.origin);
      window.close();
    }
    window.addEventListener("message", receive, false);
    window.opener.postMessage("authorizing:github", "*");
  })();
</script>
</body></html>`;
}

// ---- Site stats (Cloudflare Web Analytics) -------------------------------
//
// Extra variables for this route (Worker → Settings → Variables and Secrets):
//   CF_API_TOKEN   (secret)  API token with Account Analytics: Read
//   CF_ACCOUNT_ID  (text)    Cloudflare account ID
//   CF_SITE_TAG    (text)    Web Analytics site tag for milhemet-tora.com
//
// Only GitHub users with write access to the repo (the CMS editors) can read it.

const STATS_REPO = "milhemet-tora/milhemet-tora";
const STATS_DAYS = 30;

const withCors = (headers, origin) => ({
  ...headers,
  "access-control-allow-origin": origin,
  "access-control-allow-headers": "authorization",
  "access-control-allow-methods": "GET, OPTIONS",
  vary: "origin",
});

const reply = (body, status, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: withCors({ "content-type": "application/json" }, origin),
  });

async function isEditor(token) {
  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "user-agent": "decap-oauth-worker",
  };
  const userRes = await fetch("https://api.github.com/user", { headers });
  if (!userRes.ok) return false;
  const { login } = await userRes.json();

  const permRes = await fetch(
    `https://api.github.com/repos/${STATS_REPO}/collaborators/${encodeURIComponent(login)}/permission`,
    { headers }
  );
  if (!permRes.ok) return false;
  const { permission } = await permRes.json();
  return permission === "admin" || permission === "write";
}

// One grouped query: a list of [dimension] with its view count, most viewed first.
function group(alias, dimension, limit, filter) {
  return `${alias}: rumPageloadEventsAdaptiveGroups(filter: ${filter}, limit: ${limit}, orderBy: [count_DESC]) {
      count
      sum { visits }
      dimensions { metric: ${dimension} }
    }`;
}

async function siteStats(env) {
  const until = new Date();
  const since = new Date(until.getTime() - STATS_DAYS * 24 * 60 * 60 * 1000);
  const siteTag = JSON.stringify(env.CF_SITE_TAG);
  const filter = `{ AND: [
      { datetime_geq: "${since.toISOString()}", datetime_leq: "${until.toISOString()}" },
      { OR: [ { siteTag: ${siteTag} } ] }
    ] }`;

  const query = `query {
    viewer {
      accounts(filter: { accountTag: ${JSON.stringify(env.CF_ACCOUNT_ID)} }) {
        total: rumPageloadEventsAdaptiveGroups(filter: ${filter}, limit: 1) {
          count
          sum { visits }
        }
        ${group("pages", "requestPath", 20, filter)}
        ${group("countries", "countryName", 20, filter)}
        ${group("referrers", "refererHost", 20, filter)}
        ${group("browsers", "userAgentBrowser", 10, filter)}
        ${group("devices", "deviceType", 10, filter)}
      }
    }
  }`;

  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${env.CF_API_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  if (!res.ok || data.errors?.length) {
    throw new Error(data.errors?.[0]?.message || `Cloudflare API error ${res.status}`);
  }

  const acct = data.data.viewer.accounts[0];
  const rows = (list) =>
    (list || []).map((r) => ({ name: r.dimensions.metric || "(לא ידוע)", views: r.count, visits: r.sum.visits }));
  return {
    days: STATS_DAYS,
    since: since.toISOString(),
    until: until.toISOString(),
    total: acct.total[0] ? { views: acct.total[0].count, visits: acct.total[0].sum.visits } : { views: 0, visits: 0 },
    pages: rows(acct.pages),
    countries: rows(acct.countries),
    referrers: rows(acct.referrers),
    browsers: rows(acct.browsers),
    devices: rows(acct.devices),
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/stats") {
      const origin = env.ALLOWED_ORIGIN;
      if (request.method === "OPTIONS") return new Response(null, { headers: withCors({}, origin) });
      if (request.method !== "GET") return reply({ error: "method not allowed" }, 405, origin);

      const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      if (!token || !(await isEditor(token))) return reply({ error: "not allowed" }, 403, origin);

      try {
        return reply(await siteStats(env), 200, origin);
      } catch (err) {
        return reply({ error: String(err.message || err) }, 502, origin);
      }
    }

    if (url.pathname === "/auth") {
      const params = new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        redirect_uri: `${url.origin}/callback`,
        scope: SCOPE,
        state: crypto.randomUUID(),
      });
      return Response.redirect(`https://github.com/login/oauth/authorize?${params}`, 302);
    }

    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      if (!code) return json({ error: "missing code" }, 400);

      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: `${url.origin}/callback`,
        }),
      });
      const data = await tokenRes.json();

      const message = data.access_token
        ? `authorization:github:success:${JSON.stringify({ token: data.access_token, provider: "github" })}`
        : `authorization:github:error:${JSON.stringify({ error: data.error_description || "login failed", provider: "github" })}`;

      return new Response(callbackPage(message, env.ALLOWED_ORIGIN), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
