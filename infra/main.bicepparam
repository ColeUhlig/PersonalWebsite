using 'main.bicep'

param apexDomain = 'coleuhlig.com'
param subdomains = ['www']

// GitHub OIDC subjects use immutable IDs: owner@ownerId/repo@repoId.
param githubRepo = 'ColeUhlig@112791537/PersonalWebsite@1384588112'
param githubBranch = 'main'


// Microsoft 365 records (Exchange Online, Teams/Skype for Business, Entra join, Intune).
param txtRecords = {
  '@': [
    'v=spf1 include:spf.protection.outlook.com -all'
    'mscid=G2pvyXHrH6djSbxaBGETCRl9Tpk9vvlO/M92GBH+ZvNYK4aVSHn18rYwaDlEfexUQle3GZEUWyVRpM6pbGcdQA=='
  ]
  // DMARC in monitoring mode; aggregate reports go to cole@coleuhlig.com.
  _dmarc: ['v=DMARC1; p=none; rua=mailto:cole@coleuhlig.com']
}

param mxRecords = [
  { preference: 0, exchange: 'coleuhlig-com.mail.protection.outlook.com' }
]

param cnameRecords = {
  autodiscover: 'autodiscover.outlook.com'
  sip: 'sipdir.online.lync.com'
  lyncdiscover: 'webdir.online.lync.com'
  msoid: 'clientconfig.microsoftonline-p.net'
  enterpriseregistration: 'enterpriseregistration.windows.net'
  enterpriseenrollment: 'enterpriseenrollment-s.manage.microsoft.com'
  // DKIM (Exchange Online Get-DkimSigningConfig: Selector1CNAME / Selector2CNAME).
  'selector1._domainkey': 'selector1-coleuhlig-com._domainkey.volkmaruhlig.onmicrosoft.com'
  'selector2._domainkey': 'selector2-coleuhlig-com._domainkey.volkmaruhlig.onmicrosoft.com'
}

param srvRecords = [
  { name: '_sip._tls', priority: 100, weight: 1, port: 443, target: 'sipdir.online.lync.com' }
  { name: '_sipfederationtls._tcp', priority: 100, weight: 1, port: 5061, target: 'sipfed.online.lync.com' }
]
