# PersonalWebsite

Static site for coleuhlig.com.

- `content/`: the website files, uploaded as they are
- `infra/main.bicep`: Azure infrastructure, deployed as a **Deployment Stack** (Azure's version of a CloudFormation stack)
- `infra/main.bicepparam`: stack parameters (domain, GitHub repo)
- `scripts/deploy.sh`: deploy manually
- `.github/workflows/deploy.yml`: deploys automatically on every push to `main`

## Architecture

Azure Static Web Apps (Free tier, region `centralus`, $0/month) serves the site with free auto-renewing certificates
for `coleuhlig.com` and `www.coleuhlig.com`. `www` redirects to the apex domain (`content/js/canonical-host.js`).

DNS is hosted in Microsoft 365 (Settings → Domains → coleuhlig.com). The site needs these records:

| Type  | Name  | Value                                     |
|-------|-------|-------------------------------------------|
| A     | `@`   | `20.84.233.22` (IP behind the default hostname) |
| CNAME | `www` | `icy-mud-0098ef010.2.azurestaticapps.net` |

Microsoft 365 DNS can't alias the apex domain to a hostname, so the apex uses the IP. If it ever changes,
`scripts/deploy.sh --infra-only` prints the current value.

## Deployed version

Every deploy stamps the commit hash in an `X-Git-Commit` response header and a `<meta name="git-commit">` tag:

```sh
curl -sI https://coleuhlig.com | grep -i x-git-commit
```

## GitHub Actions credentials

GitHub Actions doesn't store any Azure secret. The stack creates a user-assigned managed identity
(`id-personalwebsite-github`) with a federated credential that trusts GitHub's OIDC tokens for
`repo:ColeUhlig/PersonalWebsite:ref:refs/heads/main` only. The workflow asks GitHub for a short-lived token
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
