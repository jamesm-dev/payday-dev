<script lang="ts">
	import '#lib/styles/tokens.css';
	import favicon from '#lib/assets/favicon.svg';
	import outfit from '#lib/assets/fonts/outfit-latin.woff2';
	// A hashed file under /_app/immutable (public, cached, allowed by the CSP's script-src 'self').
	// Never inlined: the CSP blocks data: scripts.
	import glow from '#lib/glow/glow.js?url&no-inline';
	import menus from '#lib/ui/menus.js?url&no-inline';
	import { onNavigate } from '$app/navigation';
	import AppNav from '#lib/nav/AppNav.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// Client-side navigations (pages that run script) cross-fade like the document ones below, when
	// the browser can and the owner has not asked for less motion.
	onNavigate((navigation) => {
		if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
			return;
		}
		return new Promise<void>((done) => {
			document.startViewTransition(async () => {
				done();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="manifest" href="/manifest.webmanifest" />
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
	<meta name="apple-mobile-web-app-title" content="Payday" />
	<meta name="theme-color" content="#141415" />
	<link rel="preload" as="font" type="font/woff2" crossorigin="anonymous" href={outfit} />
	<!-- Runs on every page, including the ones that send no other script. -->
	<script src={glow}></script>
	<script src={menus}></script>
</svelte:head>

<a class="skip-link" href="#content">Skip to content</a>
{#if data.nav}<AppNav />{/if}
<div id="content" tabindex="-1" class:with-nav={data.nav}>
	{#if data.flash}
		<div class="flash-wrap">
			<Notice tone="done" role="status"><p>{data.flash}</p></Notice>
		</div>
	{/if}
	{@render children()}
</div>

<style>
	.skip-link {
		position: fixed;
		top: var(--space-3);
		left: var(--space-3);
		z-index: 20;
		padding: var(--space-3) var(--space-5);
		border-radius: var(--radius-pill);
		background: var(--color-accent);
		color: var(--color-on-accent);
		font-weight: 600;
		text-decoration: none;
		transform: translateY(-300%);
	}

	.skip-link:focus {
		transform: none;
	}

	/* Where the skip link lands: focusable by script, never outlined. */
	:global(#content:focus-visible),
	:global(#content:focus) {
		outline: none;
	}

	/* The message from the last save: stays until the next navigation, so it can be read in time. */
	.flash-wrap {
		box-sizing: border-box;
		max-width: var(--content-width);
		margin: 0 auto;
		padding: var(--space-4) var(--space-5) 0;
	}

	@media (min-width: 48rem) {
		.flash-wrap {
			padding: var(--space-6) var(--space-8) 0;
		}
	}

	/* The confirmation after a save: a notice like any other, flush with the top of the page. */
	.flash-wrap > :global(.notice) {
		margin: 0;
	}

	@media (prefers-reduced-motion: no-preference) {
		.flash-wrap > :global(.notice) {
			animation: flash-in var(--motion-base) var(--ease-out) both;
		}

		@keyframes flash-in {
			from {
				opacity: 0;
				transform: translateY(calc(-1 * var(--space-2)));
			}
		}

		/* Page to page, with no script: only the page content fades and rises in. */
		@view-transition {
			navigation: auto;
		}

		#content {
			view-transition-name: page;
		}

		/* The page content is its own layer; the group itself snaps to the new page's size rather than
		   stretching between two heights. */
		:global(::view-transition-group(page)) {
			animation: none;
		}

		:global(::view-transition-old(page)) {
			animation: vt-out var(--motion-fast) var(--ease-out) both;
		}

		:global(::view-transition-new(page)) {
			animation: vt-in var(--motion-base) var(--ease-out) both;
		}

		/* Everything outside the content — the glowing background and the navigation — is the same on
		   every page, so it swaps instantly and never appears to reload. */
		:global(::view-transition-group(root)),
		:global(::view-transition-old(root)),
		:global(::view-transition-new(root)),
		:global(::view-transition-group(app-nav)),
		:global(::view-transition-old(app-nav)),
		:global(::view-transition-new(app-nav)) {
			animation: none;
		}

		@keyframes -global-vt-out {
			to {
				opacity: 0;
			}
		}

		@keyframes -global-vt-in {
			from {
				opacity: 0;
				transform: translateY(var(--space-2));
			}
		}
	}

	@media (prefers-reduced-motion: reduce) {
		:global(*),
		:global(*::before),
		:global(*::after) {
			animation: none !important;
			transition: none !important;
		}
	}

	/* One focus ring everywhere; inputs and buttons add their own in controls.css. */
	:global(a:focus-visible),
	:global(button:focus-visible),
	:global(summary:focus-visible),
	:global([tabindex]:focus-visible) {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	/* A phone's tab bar is fixed over the bottom: leave room so the last line scrolls above it.
	   The body already pads the home-indicator inset, which the bar covers as well. */
	.with-nav {
		padding-bottom: var(--nav-height);
	}

	@media (min-width: 48rem) {
		.with-nav {
			padding-bottom: 0;
			padding-left: var(--nav-width);
		}
	}

	:global(html) {
		background-color: var(--color-bg);
		color: var(--color-text);
		font-family: var(--font-body);
		line-height: var(--leading-body);
		-webkit-text-size-adjust: 100%;
	}

	/* In app.html as a class, not a style attribute: the CSP forbids inline styles. */
	:global(.app-root) {
		display: contents;
	}

	:global(a) {
		color: var(--color-accent);
	}

	:global(h1, h2, h3) {
		font-weight: 600;
	}

	:global(body) {
		margin: 0;
		min-height: 100dvh;
		/* Installed full-screen on a phone, content must clear the notch and the home indicator. */
		padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
			env(safe-area-inset-left);
	}

	/*
	 * The glow: near-black with a warm light bleeding in from the top corners, on its own fixed layer
	 * behind everything. With a mouse, src/lib/glow/glow.js sets --glow-x and --glow-y (0 to 1, where
	 * the mouse is) and the layer drifts a little toward it. It only ever moves (transform), so the
	 * browser never repaints it. Without the script, on a phone, or with reduced motion, it stays put.
	 */
	:global(body::before) {
		content: '';
		position: fixed;
		z-index: -1;
		pointer-events: none;
		will-change: transform;
		inset: calc(-1 * var(--glow-drift));
		background-image:
			radial-gradient(
				ellipse 70rem 40rem at var(--glow-drift) var(--glow-drift),
				color-mix(in srgb, var(--color-glow) 32%, transparent),
				transparent 70%
			),
			radial-gradient(
				ellipse 45rem 30rem at calc(100% - var(--glow-drift)) var(--glow-drift),
				color-mix(in srgb, var(--color-glow) 12%, transparent),
				transparent 70%
			);
		background-repeat: no-repeat;
		transform: translate3d(
			calc((var(--glow-x, 0.5) - 0.5) * var(--glow-drift)),
			calc((var(--glow-y, 0.5) - 0.5) * var(--glow-drift)),
			0
		);
	}

	@media print {
		:global(body::before) {
			display: none;
		}
	}
</style>
