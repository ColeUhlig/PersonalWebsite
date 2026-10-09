# PersonalWebsite

Static site for coleuhlig.com.

- `content/`: the website files, uploaded as they are
- `infra/main.bicep`: Azure infrastructure, deployed as a **Deployment Stack** (Azure's version of a CloudFormation stack)
- `infra/main.bicepparam`: stack parameters (domain, GitHub repo)
- `scripts/deploy.sh`: deploy manually
- `.github/workflows/deploy.yml`: deploys automatically on every push to `main`

## Architecture

Azure Static Web Apps (Free tier, region `centralus`) serves the site with free auto-renewing certificates
for `coleuhlig.com` and `www.coleuhlig.com`. `www` redirects to the apex domain (`content/js/canonical-host.js`).

DNS is an Azure DNS zone in the stack (about $0.50/month), delegated from Amazon Registrar. The apex uses an alias record
that follows the Static Web App, `www` is a CNAME, and the Microsoft 365 records (email, Teams, Entra/Intune) are set in
`infra/main.bicepparam`. To add or change DNS records, edit that file and redeploy.

## Deployed version

Every deploy stamps the commit hash in an `X-Git-Commit` response header and a `<meta name="git-commit">` tag:

```sh
curl -sI https://coleuhlig.com | grep -i x-git-commit
```

## GitHub Actions credentials

GitHub Actions doesn't store any Azure secret. The stack creates a user-assigned managed identity
(`id-personalwebsite-github`) with a federated credential that trusts GitHub's OIDC tokens for
`repo:ColeUhlig@112791537/PersonalWebsite@1384588112:ref:refs/heads/main` only (GitHub uses immutable owner/repo IDs in the subject). The workflow asks GitHub for a short-lived token
(`permissions: id-token: write`), and `azure/login` exchanges it for an Azure token as that identity. The identity
is Owner of `rg-personalwebsite` only. The repo variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and
`AZURE_SUBSCRIPTION_ID` are identifiers, not secrets. `scripts/deploy.sh --configure-github` sets them.

## Manual deploys

```sh
az login
scripts/deploy.sh                 # infrastructure + domains + content
scripts/deploy.sh --content-only  # upload content/ only
scripts/deploy.sh --infra-only    # update the stack and domains only
```

To change the infrastructure, edit `infra/main.bicep` and redeploy. Anything you remove from the template is also
deleted from Azure (`--action-on-unmanage deleteResources`).

To tear everything down: `az group delete -n rg-personalwebsite`

## VEX explainer (`content/vex/`)

An interactive, scroll-driven explanation of VEX robot motion software, served at `/vex/`. Design spec:
`docs/superpowers/specs/2026-09-27-vex-explainer-design.md`. Plain ES modules with pinned CDN libraries — no build step.

```sh
npm install                    # once
npm test                       # unit tests + coverage (node:test)
npx playwright install chromium   # once
npm run test:e2e               # Playwright, desktop + mobile
npm run serve                  # http://127.0.0.1:8766/vex/
```

## Kalshi working paper (`content/kalshi/`)

A static, paper-style write-up of augur, a multi-agent LLM system for strategy discovery on Kalshi, served at
`/kalshi/`. The only script typesets the mathematics with KaTeX (pinned CDN). The page is generated from a template
outside this repo (`kalshi-trading-website-mini/paper/build.py`), which numbers citations and tables; edit the
template and rebuild rather than editing `index.html` by hand. `tests/e2e/kalshi.spec.js` checks structure,
citations, cross-references, equations and mobile overflow.
