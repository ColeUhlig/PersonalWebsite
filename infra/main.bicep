// Personal website: Azure Static Web Apps (Free tier) with free managed TLS certificates.
// Deployed as a resource-group scoped Deployment Stack (see scripts/deploy.sh).
//
// DNS for the domain is an Azure DNS zone: the apex alias record follows the Static Web App, and
// the Microsoft 365 (email, Teams, Intune) records are configured in main.bicepparam.
// Custom domains are bound by scripts/deploy.sh rather than here, because apex (TXT) validation
// would block the deployment until DNS is set.

@description('Region for the Static Web App. Free tier: westus2, centralus, eastus2, westeurope, eastasia.')
param location string = resourceGroup().location

@description('Apex domain, e.g. coleuhlig.com.')
param apexDomain string

@description('Subdomains that should also serve the site, e.g. [\'www\'].')
param subdomains array = ['www']

@description('GitHub repository allowed to deploy via OIDC, as it appears in the token subject (owner@ownerId/repo@repoId).')
param githubRepo string

@description('Git branch allowed to deploy via OIDC.')
param githubBranch string = 'main'

@description('TXT records: { name: [values] }, e.g. SPF on \'@\' and DMARC on \'_dmarc\'.')
param txtRecords object = {}

@description('MX records on the apex: [{ preference, exchange }].')
param mxRecords array = []

@description('Additional CNAME records: { name: target }.')
param cnameRecords object = {}

@description('SRV records: [{ name, priority, weight, port, target }].')
param srvRecords array = []

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
// DNS zone
// ---------------------------------------------------------------------------

resource dnsZone 'Microsoft.Network/dnsZones@2018-05-01' = {
  name: apexDomain
  location: 'global'
  tags: tags
}

// Alias record: tracks the Static Web App's IPs, so the apex never points at a stale address.
resource apexAlias 'Microsoft.Network/dnsZones/A@2018-05-01' = {
  parent: dnsZone
  name: '@'
  properties: {
    TTL: 3600
    targetResource: {
      id: site.id
    }
  }
}

resource subdomainCnames 'Microsoft.Network/dnsZones/CNAME@2018-05-01' = [
  for s in subdomains: {
    parent: dnsZone
    name: s
    properties: {
      TTL: 3600
      CNAMERecord: {
        cname: site.properties.defaultHostname
      }
    }
  }
]

resource txts 'Microsoft.Network/dnsZones/TXT@2018-05-01' = [
  for r in items(txtRecords): {
    parent: dnsZone
    name: r.key
    properties: {
      TTL: 3600
      TXTRecords: map(r.value, v => { value: [v] })
    }
  }
]

resource mx 'Microsoft.Network/dnsZones/MX@2018-05-01' = if (!empty(mxRecords)) {
  parent: dnsZone
  name: '@'
  properties: {
    TTL: 3600
    MXRecords: mxRecords
  }
}

resource cnames 'Microsoft.Network/dnsZones/CNAME@2018-05-01' = [
  for r in items(cnameRecords): {
    parent: dnsZone
    name: r.key
    properties: {
      TTL: 3600
      CNAMERecord: {
        cname: r.value
      }
    }
  }
]

resource srvs 'Microsoft.Network/dnsZones/SRV@2018-05-01' = [
  for r in srvRecords: {
    parent: dnsZone
    name: r.name
    properties: {
      TTL: 3600
      SRVRecords: [
        {
          priority: r.priority
          weight: r.weight
          port: r.port
          target: r.target
        }
      ]
    }
  }
]

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
output nameServers array = dnsZone.properties.nameServers
output githubClientId string = githubIdentity.properties.clientId
