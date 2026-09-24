// Personal website: Azure Static Web Apps (Free tier) with free managed TLS certificates.
// Deployed as a resource-group scoped Deployment Stack (see scripts/deploy.sh).
//
// DNS for the domain is hosted in Microsoft 365. Custom domains are bound by scripts/deploy.sh
// rather than here, because apex (TXT) validation would block the deployment until DNS is set.

@description('Region for the Static Web App. Free tier: westus2, centralus, eastus2, westeurope, eastasia.')
param location string = resourceGroup().location

@description('Apex domain, e.g. coleuhlig.com.')
param apexDomain string

@description('Subdomains that should also serve the site, e.g. [\'www\'].')
param subdomains array = ['www']

@description('GitHub repository (owner/name) allowed to deploy via OIDC.')
param githubRepo string

@description('Git branch allowed to deploy via OIDC.')
param githubBranch string = 'main'

param tags object = {
  project: 'personal-website'
}

// Built-in Owner role: GitHub updates the stack, which includes this role assignment.
var roleOwner = '8e3af657-a8ff-443c-a75c-2fe8c4bcb635'

resource site 'Microsoft.Web/staticSites@2023-12-01' = {
  name: 'swa-personalwebsite'
  location: location
  tags: tags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

// ---------------------------------------------------------------------------
// Identity used by GitHub Actions (OIDC, no stored secrets)
// ---------------------------------------------------------------------------

resource githubIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-personalwebsite-github'
  location: location
  tags: tags
}

resource githubFederation 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: githubIdentity
  name: 'github-${githubBranch}'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:${githubRepo}:ref:refs/heads/${githubBranch}'
    audiences: ['api://AzureADTokenExchange']
  }
}

resource githubOwner 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, githubIdentity.id, roleOwner)
  properties: {
    principalId: githubIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleOwner)
  }
}

output staticWebAppName string = site.name
output defaultHostName string = site.properties.defaultHostname
output apexDomain string = apexDomain
output hostNames array = concat([apexDomain], map(subdomains, s => '${s}.${apexDomain}'))
output githubClientId string = githubIdentity.properties.clientId
