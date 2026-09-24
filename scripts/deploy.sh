#!/usr/bin/env bash
# Deploys the personal website to Azure Static Web Apps (Free tier).
#
#   1. Creates/updates the infrastructure as a Deployment Stack (infra/main.bicep).
#   2. Binds the custom domains (DNS records live in the stack's Azure DNS zone); certificates are automatic.
#   3. Uploads ./content to the Static Web App.
#
# Usage: scripts/deploy.sh [--infra-only | --content-only] [--configure-github]
#
#   --infra-only        Only update the stack and custom domains.
#   --content-only      Only upload content (stack must already exist).
#   --configure-github  Store the Azure IDs GitHub Actions needs as repo variables (uses gh).
#
# Environment overrides: AZURE_SUBSCRIPTION_ID, RESOURCE_GROUP, LOCATION, STACK_NAME.
# Requires: az (logged in via `az login`), node/npx, jq, and gh for --configure-github.

set -euo pipefail

SUBSCRIPTION_ID="${AZURE_SUBSCRIPTION_ID:-f1a5d564-7b4e-404f-97b2-87560fa574ec}"
RESOURCE_GROUP="${RESOURCE_GROUP:-rg-personalwebsite}"
LOCATION="${LOCATION:-centralus}"
STACK_NAME="${STACK_NAME:-personal-website}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTENT_DIR="$ROOT_DIR/content"
TEMPLATE="$ROOT_DIR/infra/main.bicep"
PARAMS="$ROOT_DIR/infra/main.bicepparam"

do_infra=true
do_content=true
configure_github=false
for arg in "$@"; do
  case "$arg" in
    --infra-only) do_content=false ;;
    --content-only) do_infra=false ;;
    --configure-github) configure_github=true ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

log() { printf '\n==> %s\n' "$*"; }

az account set --subscription "$SUBSCRIPTION_ID"

output() {
  az stack group show --name "$STACK_NAME" --resource-group "$RESOURCE_GROUP" \
    --query "outputs.$1.value" --output tsv
}

# Binds a custom hostname unless it is already bound or validating (re-binding a validating
# apex would issue a new TXT token). Validation and certificate issuance run asynchronously.
bind_hostname() {
  local host="$1" method="$2" status
  status="$(az staticwebapp hostname list --name "$SWA_NAME" --resource-group "$RESOURCE_GROUP" \
    --query "[?name=='$host'].status | [0]" --output tsv)"
  case "$status" in
    Ready|Validating|Adding) echo "  $host: $status" ;;
    *)
      echo "  $host: binding (status: ${status:-not bound})"
      az staticwebapp hostname set --name "$SWA_NAME" --resource-group "$RESOURCE_GROUP" \
        --hostname "$host" --validation-method "$method" --no-wait --output none
      ;;
  esac
}

if $do_infra; then
  if [[ "${GITHUB_ACTIONS:-}" != "true" ]]; then
    # One-time subscription setup; the GitHub identity is scoped to the resource group and can't do this.
    log "Registering resource providers"
    for ns in Microsoft.Web Microsoft.Network Microsoft.ManagedIdentity; do
      az provider register --namespace "$ns" --wait >/dev/null
    done
  fi

  if ! az group show --name "$RESOURCE_GROUP" >/dev/null 2>&1; then
    log "Creating resource group $RESOURCE_GROUP in $LOCATION"
    az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --tags project=personal-website >/dev/null
  fi

  log "Updating deployment stack $STACK_NAME"
  az stack group create \
    --name "$STACK_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --template-file "$TEMPLATE" \
    --parameters "$PARAMS" \
    --action-on-unmanage deleteResources \
    --deny-settings-mode none \
    --description "Personal website (Static Web App + DNS)" \
    --yes \
    --output none
fi

SWA_NAME="$(output staticWebAppName)"
APEX="$(output apexDomain)"

if $do_infra; then
  log "Custom domains"
  for host in $(output hostNames); do
    if [[ "$host" == "$APEX" ]]; then
      bind_hostname "$host" dns-txt-token
    else
      bind_hostname "$host" cname-delegation
    fi
  done

  # The apex TXT token is generated asynchronously after binding starts.
  apex_status="" token=""
  for _ in $(seq 1 18); do
    apex_status="$(az staticwebapp hostname show --name "$SWA_NAME" --resource-group "$RESOURCE_GROUP" \
      --hostname "$APEX" --query status --output tsv 2>/dev/null || true)"
    token="$(az staticwebapp hostname show --name "$SWA_NAME" --resource-group "$RESOURCE_GROUP" \
      --hostname "$APEX" --query validationToken --output tsv 2>/dev/null || true)"
    [[ "$apex_status" == "Ready" || -n "$token" ]] && break
    sleep 10
  done

  if [[ "$apex_status" != "Ready" && -n "$token" ]]; then
    echo "  Add '$token' to apexTxtRecords in infra/main.bicepparam and redeploy to validate $APEX."
  fi

  name_servers="$(dig +short NS "$APEX" 2>/dev/null || true)"
  if [[ "$name_servers" != *azure-dns* ]]; then
    echo "  $APEX is not delegated to Azure DNS. Set these name servers at the registrar:"
    output nameServers | sed 's/^/    /'
  fi
fi

if $do_content; then
  # Stamp the deployed copy with the commit: an X-Git-Commit response header on every request
  # and a <meta name="git-commit"> tag in each HTML page.
  commit="${GITHUB_SHA:-$(git -C "$ROOT_DIR" rev-parse HEAD)}"
  if [[ -z "${GITHUB_SHA:-}" && -n "$(git -C "$ROOT_DIR" status --porcelain -- content)" ]]; then
    commit="$commit-dirty"
  fi
  stage_dir="$(mktemp -d)"
  trap 'rm -rf "$stage_dir"' EXIT
  cp -R "$CONTENT_DIR/." "$stage_dir"
  config="$stage_dir/staticwebapp.config.json"
  [[ -f "$config" ]] || echo '{}' > "$config"
  jq --arg c "$commit" '.globalHeaders["X-Git-Commit"] = $c' "$config" > "$config.tmp" && mv "$config.tmp" "$config"
  find "$stage_dir" -name '*.html' -exec \
    perl -pi -e 's|</head>|  <meta name="git-commit" content="'"$commit"'">\n</head>|' {} +

  log "Uploading $CONTENT_DIR (commit $commit)"
  SWA_CLI_DEPLOYMENT_TOKEN="$(az staticwebapp secrets list --name "$SWA_NAME" --resource-group "$RESOURCE_GROUP" \
    --query properties.apiKey --output tsv)"
  export SWA_CLI_DEPLOYMENT_TOKEN
  npx --yes @azure/static-web-apps-cli@2 deploy "$stage_dir" --env production
fi

if $configure_github; then
  repo="$(cd "$ROOT_DIR" && gh repo view --json nameWithOwner --jq .nameWithOwner)"
  log "Configuring GitHub Actions variables on $repo"
  gh variable set AZURE_CLIENT_ID --repo "$repo" --body "$(output githubClientId)"
  gh variable set AZURE_TENANT_ID --repo "$repo" --body "$(az account show --query tenantId -o tsv)"
  gh variable set AZURE_SUBSCRIPTION_ID --repo "$repo" --body "$SUBSCRIPTION_ID"
  gh variable set AZURE_RESOURCE_GROUP --repo "$repo" --body "$RESOURCE_GROUP"
fi

log "Done"
echo "Default URL: https://$(output defaultHostName)"
echo "Custom URLs: $(output hostNames | sed 's|^|https://|' | tr '\n' ' ')"
echo "Domain status: az staticwebapp hostname list -n $SWA_NAME -g $RESOURCE_GROUP -o table"
