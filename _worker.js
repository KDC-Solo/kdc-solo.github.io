// Serves the root site's own static files directly. Every companion app
// (dune-war-for-arrakis, on-mars, brass-birmingham, kanban-ev, ...) is its
// own standalone Cloudflare Pages project, deployed independently by that
// repo's own GitHub Actions workflow. This worker strips the leading
// /<app>/ segment and proxies the rest of the request to that project's
// <app>.pages.dev, so solo.kdc.sh/<app>/ keeps working without those repos
// needing to know anything about this domain.
const APP_PROJECTS = {
  'dune-war-for-arrakis': 'dune-war-for-arrakis.pages.dev',
  'on-mars': 'on-mars.pages.dev',
  'brass-birmingham': 'brass-birmingham.pages.dev',
  'kanban-ev': 'kanban-ev.pages.dev',
};

// Cloudflare Pages' asset binding falls back to index.html (200) for any
// unmatched path instead of a real 404, so we can't detect "not a static
// file" that way. List the root site's own files explicitly instead.
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

    const firstSlash = url.pathname.indexOf('/', 1);
    const slug = firstSlash === -1 ? url.pathname.slice(1) : url.pathname.slice(1, firstSlash);
    const upstreamHost = APP_PROJECTS[slug];

    if (!upstreamHost) {
      return env.ASSETS.fetch(request);
    }

    // "/slug" with no trailing slash: redirect to "/slug/" first, since each
    // app's build assumes it's served from that trailing-slash base path.
    if (firstSlash === -1) {
      const redirectUrl = new URL(url);
      redirectUrl.pathname = `${url.pathname}/`;
      return Response.redirect(redirectUrl.toString(), 308);
    }

    const upstreamPath = url.pathname.slice(firstSlash) || '/';
    const upstreamUrl = new URL(upstreamPath + url.search, `https://${upstreamHost}`);
    const upstreamResponse = await fetch(new Request(upstreamUrl, request));

    // Rewrite any redirect back onto this domain (with the /slug/ prefix
    // restored) so visitors never get bounced to the *.pages.dev host.
    if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
      const location = upstreamResponse.headers.get('location');
      if (location) {
        const rewritten = new URL(location, upstreamUrl);
        if (rewritten.hostname === upstreamHost) {
          rewritten.hostname = url.hostname;
          rewritten.protocol = url.protocol;
          rewritten.pathname = `/${slug}${rewritten.pathname}`;
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
