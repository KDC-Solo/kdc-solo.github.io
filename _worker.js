// Serves the root site's own static files directly. Anything not found here
// (e.g. /dune-war-for-arrakis/*, /on-mars/*) is transparently proxied to the
// matching KDC-Solo project repo on kdc-solo.github.io, which each publish
// independently via their own GitHub Pages workflow. This lets solo.kdc.sh
// stay on Cloudflare Pages while every per-game subfolder keeps working
// without touching those other repos.
const UPSTREAM_HOST = 'kdc-solo.github.io';

// Cloudflare Pages' asset binding falls back to index.html (200) for any
// unmatched path instead of a real 404, so we can't detect "not a static
// file" that way. List the root site's own files explicitly instead;
// everything else falls through to the upstream proxy below.
const STATIC_PATHS = new Set([
  '/',
  '/index.html',
  '/robots.txt',
  '/sitemap.xml',
  '/logo.svg',
  '/avatar.png',
  '/google5d46e43509702b30.html',
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (STATIC_PATHS.has(url.pathname)) {
      return env.ASSETS.fetch(request);
    }

    const upstreamUrl = new URL(url.pathname + url.search, `https://${UPSTREAM_HOST}`);
    const upstreamResponse = await fetch(new Request(upstreamUrl, request));

    // Rewrite any redirect (e.g. GitHub's trailing-slash redirect) back onto
    // this domain so visitors never get bounced to the github.io host.
    if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
      const location = upstreamResponse.headers.get('location');
      if (location) {
        const rewritten = new URL(location, upstreamUrl);
        if (rewritten.hostname === UPSTREAM_HOST) {
          rewritten.hostname = url.hostname;
          rewritten.protocol = url.protocol;
          const headers = new Headers(upstreamResponse.headers);
          headers.set('location', rewritten.toString());
          return new Response(upstreamResponse.body, {
            status: upstreamResponse.status,
            statusText: upstreamResponse.statusText,
            headers,
          });
        }
      }
    }

    return upstreamResponse;
  },
};
