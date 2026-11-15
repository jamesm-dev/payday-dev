/**
 * The one address the public pages tell the world about: the canonical link, og:url, og:image, the
 * sitemap and the robots.txt `Sitemap:` line. It is Netlify's free name; the choice is recorded in
 * .idea/SPECS.md (open questions, "The domain"). Change it here, and in static/robots.txt, which is a
 * plain file and cannot import this.
 */
export const PUBLIC_ORIGIN = 'https://payday-birc.netlify.app';

/** The pages a visitor with no session may be shown, and so the only ones the sitemap lists. */
export const PUBLIC_PAGES = ['/', '/signin', '/privacy', '/terms'] as const;

/**
 * Who a person writes to about their data. THE ONE PLACE for it: the privacy notice and the terms
 * both read it. The owner's mailbox. assertContactSet below refuses a deploy while it is still the placeholder.
 */
export const CONTACT = 'payday@jamesm-dev.com';

/** When the privacy notice and the terms were last changed. Update it with any change to either. */
export const LEGAL_UPDATED = '16 November 2026';

export const publicUrl = (path: string): string => `${PUBLIC_ORIGIN}${path}`;

/**
 * Stops a deploy that would publish the placeholder: on Netlify's build, the privacy notice and the
 * terms must have a real contact. Anywhere else (local builds, tests) the placeholder is allowed.
 */
export function assertContactSet(contact: string, netlify: string | undefined): void {
	if (netlify === 'true' && contact === 'CONTACT-PENDING') {
		throw new Error(
			'The privacy notice has no contact yet. Set CONTACT in app/src/lib/site.ts before deploying.'
		);
	}
}
