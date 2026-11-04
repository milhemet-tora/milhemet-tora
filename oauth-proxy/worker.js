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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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
