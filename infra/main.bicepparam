using 'main.bicep'

param apexDomain = 'coleuhlig.com'
param subdomains = ['www']

// GitHub OIDC subjects use immutable IDs: owner@ownerId/repo@repoId.
param githubRepo = 'ColeUhlig@112791537/PersonalWebsite@1384588112'
param githubBranch = 'main'

