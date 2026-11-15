/**
 * The one address the public pages tell the world about: the canonical link, og:url, og:image, the
 * sitemap and the robots.txt `Sitemap:` line. It is Netlify's free name; the choice is recorded in
 * .idea/SPECS.md (open questions, "The domain"). Change it here, and in static/robots.txt, which is a
 * plain file and cannot import this.
 */
export const PUBLIC_ORIGIN = 'https://payday-birc.netlify.app';

/** The pages a visitor with no session may be shown, and so the only ones the sitemap lists. */
export const PUBLIC_PAGES = ['/', '/signin'] as const;

export const publicUrl = (path: string): string => `${PUBLIC_ORIGIN}${path}`;
