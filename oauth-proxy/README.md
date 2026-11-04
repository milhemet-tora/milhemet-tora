# OAuth proxy (Cloudflare Worker)

Lets Decap CMS log in with GitHub. Deploy `worker.js` as a Cloudflare Worker named `decap-oauth`,
with the custom domain `auth.milhemet-tora.com`.

Variables/secrets (Worker → Settings → Variables and Secrets):
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET` (encrypted)
- `ALLOWED_ORIGIN` = `https://milhemet-tora.com`

GitHub OAuth App callback URL: `https://auth.milhemet-tora.com/callback`
