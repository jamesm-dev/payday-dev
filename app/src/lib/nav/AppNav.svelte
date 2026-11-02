<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import BrandMark from '#lib/brand/BrandMark.svelte';

	const path = $derived(page.url.pathname);
	/** The section a path belongs to: its own page and everything below it. */
	const within = (base: string) => path === base || path.startsWith(`${base}/`);
	const current = (on: boolean) => (on ? 'page' : undefined);
</script>

<!-- One landmark for every screen size: CSS makes it a left sidebar on a laptop and a tab bar on a phone. -->
<nav class="nav" aria-label="Main">
	<div class="inner">
		<a class="brand" href={resolve('/')}>
			<BrandMark />
			Payday
		</a>
		<ul class="links">
			<li>
				<a href={resolve('/')} aria-current={current(path === '/')}>
					<svg class="icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
						<path d="M3 11.5 12 4l9 7.5M5.5 10v10h13V10M10 20v-5h4v5" />
					</svg>
					<span>Home</span>
				</a>
			</li>
			<li>
				<a href={resolve('/plan')} aria-current={current(within('/plan'))}>
					<svg class="icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
						<path d="M4 5h16v15H4zM4 10h16M8 3v4M16 3v4" />
					</svg>
					<span>Plan</span>
				</a>
			</li>
			<li>
				<a href={resolve('/checkin')} aria-current={current(within('/checkin'))}>
					<svg class="icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
						<circle cx="12" cy="12" r="9" />
						<path d="m8 12.5 3 3 5-6" />
					</svg>
					<span>Check-in</span>
				</a>
			</li>
			<li>
				<a href={resolve('/schedule')} aria-current={current(within('/schedule'))}>
					<svg class="icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
						<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />
					</svg>
					<span>Bills</span>
				</a>
			</li>
			<li>
				<a href={resolve('/loans')} aria-current={current(within('/loans'))}>
					<svg class="icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
						<rect x="3" y="6" width="18" height="13" rx="2" />
						<path d="M3 10.5h18M7 15h4" />
					</svg>
					<span>Loans</span>
				</a>
			</li>
		</ul>
		<a class="settings" href={resolve('/settings')} aria-current={current(within('/settings'))}>
			<svg class="icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
				<circle cx="12" cy="12" r="3" />
				<path
					d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"
				/>
			</svg>
			<span>Settings</span>
		</a>
		<!-- The Security page's own sign-out action: ends this session only, then shows sign-in. -->
		<form class="signout" method="POST" action="/settings/security?/signout">
			<button type="submit">
				<svg class="icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
					<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" />
				</svg>
				<span>Sign out</span>
			</button>
		</form>
	</div>
</nav>

<style>
	/* Phones: a tab bar fixed to the bottom, clear of the home indicator. */
	.nav {
		position: fixed;
		right: 0;
		bottom: 0;
		left: 0;
		z-index: 10;
		box-sizing: border-box;
		padding: 0 env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
		background: color-mix(in srgb, var(--color-surface-2) 88%, transparent);
		backdrop-filter: blur(var(--space-4));
		border-top: 1px solid var(--color-border);
		/* Held still while the page changes under it (see the layout's view transition rules). */
		view-transition-name: app-nav;
	}

	.inner {
		display: block;
	}

	.brand,
	.settings,
	.signout {
		display: none;
	}

	.links a:hover,
	.settings:hover,
	.signout button:hover {
		color: var(--color-text);
	}

	.links {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.links a {
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		min-height: var(--nav-height);
		padding: var(--space-1);
		border-top: 2px solid transparent;
		color: var(--color-text-muted);
		font-size: var(--text-sm);
		text-decoration: none;
	}

	.icon {
		flex: none;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.75;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.links span {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.links a[aria-current='page'] {
		border-top-color: var(--color-accent);
		color: var(--color-accent);
		font-weight: 700;
	}

	a:focus-visible,
	.signout button:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
	}

	/* Wider screens: a sidebar down the left edge, the brand at the top, Settings at the bottom. */
	@media (min-width: 48rem) {
		.nav {
			top: 0;
			right: auto;
			width: var(--nav-width);
			padding: 0;
			background: color-mix(in srgb, var(--color-surface) 80%, transparent);
			border-top: 0;
			border-right: 1px solid var(--color-border);
		}

		.inner {
			display: flex;
			flex-direction: column;
			box-sizing: border-box;
			height: 100%;
			padding: var(--space-4) 0;
		}

		.brand {
			display: flex;
			align-items: center;
			gap: var(--space-2);
			margin-bottom: var(--space-6);
			padding: 0 var(--space-6);
			color: var(--color-text);
			font-weight: 600;
			font-size: var(--text-lg);
			text-decoration: none;
		}

		.links {
			display: flex;
			flex-direction: column;
		}

		.links a,
		.settings {
			flex-direction: row;
			justify-content: flex-start;
			gap: var(--space-3);
			min-height: var(--space-12);
			padding: 0 var(--space-6);
			border-top: 0;
			border-left: 4px solid transparent;
			font-size: var(--text-base);
		}

		.settings {
			display: flex;
			align-items: center;
			box-sizing: border-box;
			margin-top: auto;
			border-top: 1px solid var(--color-border);
			color: var(--color-text-muted);
			text-decoration: none;
		}

		.signout {
			display: block;
			margin: 0;
		}

		/* A button that reads as one more row of the sidebar. */
		.signout button {
			display: flex;
			align-items: center;
			gap: var(--space-3);
			box-sizing: border-box;
			width: 100%;
			min-height: var(--space-12);
			padding: 0 var(--space-6);
			border: 0;
			border-left: 4px solid transparent;
			background: none;
			color: var(--color-text-muted);
			font: inherit;
			font-size: var(--text-base);
			cursor: pointer;
		}

		.links a[aria-current='page'],
		.settings[aria-current='page'] {
			border-left-color: var(--color-accent);
			border-top-color: var(--color-border);
			color: var(--color-accent);
			font-weight: 700;
		}

		.links a[aria-current='page'] {
			border-top-color: transparent;
		}
	}

	@media print {
		.nav {
			display: none;
		}
	}
</style>
