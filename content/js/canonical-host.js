// Redirects www.coleuhlig.com (and any other www. host) to the apex domain, keeping the
// path, query string and hash. Load it synchronously in <head> so the page doesn't flash first.
(function redirectToApex() {
  var CANONICAL_HOST = 'coleuhlig.com';
  var host = window.location.hostname.toLowerCase();

  if (host === 'www.' + CANONICAL_HOST) {
    var url = new URL(window.location.href);
    url.hostname = CANONICAL_HOST;
    url.protocol = 'https:';
    window.location.replace(url.toString());
  }
})();
