<script lang="ts">
	import '#lib/styles/controls.css';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import BrandMark from '#lib/brand/BrandMark.svelte';
	import { publicUrl } from '#lib/site.ts';
	import TryIt from './TryIt.svelte';
	import { startMotion } from './motion.ts';

	/*
	 * The product page (Phase 10): what a visitor who is not signed in sees at "/". Written for people
	 * who may not read English as a first language: short sentences, common words. It reads in full
	 * with no JavaScript. Every claim here is true of the app today and is checked in landing.e2e.ts.
	 * Accounts for new people are not open yet (Phase 9), so its button is "Sign in" for now.
	 */
	const title = 'Payday: a free budget app to know what you can spend until payday';
	const description =
		'Payday is a free budget app, not a loan. It looks at your pay, your bills and your loans, and shows how much money is safe to spend until your next payday.';
	const url = publicUrl('/');

	/** What search engines read: a free finance web app (schema.org). Data, never run as script. */
	const structured = JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'WebApplication',
		name: 'Payday',
		url,
		description,
		applicationCategory: 'FinanceApplication',
		operatingSystem: 'Any; runs in a web browser',
		inLanguage: 'en',
		isAccessibleForFree: true,
		offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
	}).replace(/</g, '\\u003c');

	const questions = [
		{
			q: 'Is Payday a loan?',
			a: 'No. Payday never lends money, and it is not a bank. The name is about your payday: the day your pay arrives.'
		},
		{
			q: 'Is it free?',
			a: 'Yes. There is nothing to pay, and there are no ads.'
		},
		{
			q: 'Who sees my money?',
			a: 'Your budget is private. There are no ads, and your data is not sold. You can download a full copy of your budget at any time.'
		},
		{
			q: 'Do I connect my bank?',
			a: 'No. Payday never asks for your bank password. You look at your bank app and type in your balance yourself.'
		},
		{
			q: 'Does it work with pesos?',
			a: 'Yes. Payday works with pesos, dollars, euros and most money that has cents.'
		},
		{
			q: 'Does it work on my phone?',
			a: 'Yes. It works in the browser on any phone. You can add it to your home screen, and it opens like an app.'
		}
	];

	let root: HTMLElement;
	onMount(() => {
		let stop: (() => void) | undefined;
		let gone = false;
		void startMotion(root).then((cleanup) => {
			if (gone) cleanup();
			else stop = cleanup;
		});
		return () => {
			gone = true;
			stop?.();
		};
	});
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={url} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={url} />
	<meta property="og:image" content={publicUrl('/landing/og.png')} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta name="twitter:card" content="summary_large_image" />
	<link rel="preload" as="image" href="/landing/home.webp" fetchpriority="high" />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- our own JSON, with "<" escaped above -->
	{@html '<script type="application/ld+json">' + structured + '</' + 'script>'}
</svelte:head>

<div class="landing" bind:this={root}>
	<header class="top wrap">
		<p class="brand"><BrandMark size={28} /> <span>Payday</span></p>
		<a class="btn secondary small" href={resolve('/signin')}>Sign in</a>
	</header>

	<main>
		<section class="hero wrap" aria-labelledby="hero-title">
			<div class="hero-text">
				<p class="eyebrow">A free budget app. Not a loan.</p>
				<h1 id="hero-title">Know how much you can spend until payday</h1>
				<p class="lead">
					Payday looks at your pay, your bills and your loans. Then it shows one number: the money
					that is safe to spend until your next payday.
				</p>
				<div class="cta">
					<a class="btn big" href={resolve('/signin')}>Sign in</a>
					<p class="soon">Accounts for new people are not open yet. They will be free.</p>
				</div>
				<ul class="trust" aria-label="Why people trust Payday">
					<li><span class="tick" aria-hidden="true"></span>Free</li>
					<li><span class="tick" aria-hidden="true"></span>No ads</li>
					<li><span class="tick" aria-hidden="true"></span>Your data is not sold</li>
					<li><span class="tick" aria-hidden="true"></span>Works on your phone</li>
				</ul>
			</div>

			<div class="hero-art">
				<div class="glow" aria-hidden="true"></div>
				<figure class="phone" data-float>
					<img
						src="/landing/home.webp"
						width="720"
						height="1440"
						alt="Payday's home screen on a phone: the money safe to spend until the next payday, in pesos, and a box to log what you spend."
						fetchpriority="high"
						decoding="async"
					/>
				</figure>
				<p class="note note-1" data-pop aria-hidden="true">
					<span class="tick"></span> Bills are kept aside
				</p>
				<p class="note note-2" data-pop aria-hidden="true">
					<span class="tick"></span> Paid on the 15th and the last day
				</p>
			</div>
		</section>

		<section class="not-loan wrap" aria-labelledby="not-loan-title" data-reveal>
			<div class="card plain" data-reveal-part>
				<h2 id="not-loan-title">Payday is not a loan</h2>
				<p>
					Payday never lends money, and it is not a bank. It does not connect to your bank. It is a
					free tool to plan the money you already have, so you do not run short before payday.
				</p>
			</div>
		</section>

		<section class="band" aria-labelledby="try-title" data-reveal>
			<div class="wrap">
				<div class="section-head" data-reveal-part>
					<h2 id="try-title">See how your number works</h2>
					<p>Move the sliders. This is only an example, not your real budget.</p>
				</div>
				<div data-reveal-part><TryIt /></div>
			</div>
		</section>

		<section class="wrap" aria-labelledby="how-title" data-reveal>
			<div class="section-head" data-reveal-part>
				<h2 id="how-title">How it works</h2>
				<p>Three steps. No spreadsheets. No math.</p>
			</div>
			<ol class="steps">
				<li class="card" data-reveal-part>
					<span class="step-no" aria-hidden="true">1</span>
					<h3>Add your pay and your bills</h3>
					<p>Payday asks one question at a time. You can add more later.</p>
				</li>
				<li class="card" data-reveal-part>
					<span class="step-no" aria-hidden="true">2</span>
					<h3>See your number</h3>
					<p>It is the money left after every bill and loan payment, until your next payday.</p>
				</li>
				<li class="card" data-reveal-part>
					<span class="step-no" aria-hidden="true">3</span>
					<h3>Do your payday update</h3>
					<p>
						On payday it takes about five minutes. Payday shows what you spent and plans until the
						next payday.
					</p>
				</li>
			</ol>
		</section>

		<section class="wrap" aria-labelledby="does-title" data-reveal>
			<div class="section-head" data-reveal-part>
				<h2 id="does-title">What Payday does for you</h2>
			</div>
			<ul class="features">
				<li class="card" data-reveal-part>
					<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<rect x="3.5" y="5" width="17" height="15" rx="3" />
						<path d="M3.5 10h17M8 3v4M16 3v4M9 14.5l2 2 4-4" />
					</svg>
					<h3>You do not miss a bill</h3>
					<p>
						Payday keeps money aside for each bill before you spend it. Yearly bills are saved for a
						little each payday.
					</p>
				</li>
				<li class="card" data-reveal-part>
					<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<path d="M5 21V4M5 4h11l-2 4 2 4H5" />
					</svg>
					<h3>See when your loans end</h3>
					<p>Add your loans and Payday shows the day you will be free of debt.</p>
				</li>
				<li class="card" data-reveal-part>
					<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<path
							d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.7L4 15.5M4 20v-4.5h4.5"
						/>
					</svg>
					<h3>It fits how you are paid</h3>
					<p>
						Every two weeks, twice a month or once a month. Paid on the 15th and the last day? That
						works too.
					</p>
				</li>
				<li class="card" data-reveal-part>
					<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<circle cx="12" cy="12" r="8.5" />
						<path d="M8.5 12.5l2.5 2.5 4.5-5" />
					</svg>
					<h3>Paid a bill early?</h3>
					<p>
						Mark it paid. The money comes off your number at once, and the next paycheck does not
						hold it back.
					</p>
				</li>
				<li class="card" data-reveal-part>
					<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
						<path d="M10.5 18.5h3" />
					</svg>
					<h3>It works on your phone</h3>
					<p>Add Payday to your home screen. It opens like an app.</p>
				</li>
				<li class="card" data-reveal-part>
					<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
						<path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
					</svg>
					<h3>Your budget is private</h3>
					<p>No ads, and your data is not sold. Download a full copy of your budget at any time.</p>
				</li>
			</ul>
		</section>

		<section class="band" aria-labelledby="screens-title" data-reveal>
			<div class="wrap">
				<div class="section-head" data-reveal-part>
					<h2 id="screens-title">See the app</h2>
					<p>These are real screens from Payday, with a made-up household.</p>
				</div>
				<ul class="screens">
					<li data-reveal-part>
						<figure class="phone small">
							<img
								src="/landing/home.webp"
								width="720"
								height="1440"
								alt="The home screen: the money safe to spend until payday, and a box to log what you spend."
								loading="lazy"
								decoding="async"
							/>
						</figure>
						<p class="caption">Your number, and a quick way to log spending</p>
					</li>
					<li data-reveal-part>
						<figure class="phone small">
							<img
								src="/landing/plan.webp"
								width="720"
								height="1440"
								alt="The plan: each paycheck, and the bills it pays."
								loading="lazy"
								decoding="async"
							/>
						</figure>
						<p class="caption">Each paycheck, planned</p>
					</li>
					<li data-reveal-part>
						<figure class="phone small">
							<img
								src="/landing/loans.webp"
								width="720"
								height="1440"
								alt="The loans page: what is owed, and the day the loans are paid off."
								loading="lazy"
								decoding="async"
							/>
						</figure>
						<p class="caption">Your loans, and the day they end</p>
					</li>
				</ul>
			</div>
		</section>

		<section class="wrap narrow" aria-labelledby="faq-title" data-reveal>
			<div class="section-head" data-reveal-part>
				<h2 id="faq-title">Questions people ask</h2>
			</div>
			<div class="faq">
				{#each questions as item (item.q)}
					<details class="qa" data-reveal-part>
						<summary>{item.q}</summary>
						<p>{item.a}</p>
					</details>
				{/each}
			</div>
		</section>

		<section class="wrap" aria-labelledby="end-title" data-reveal>
			<div class="end card" data-reveal-part>
				<BrandMark size={44} />
				<h2 id="end-title">Plan your money before payday</h2>
				<p>Free, private and simple. Accounts for new people are not open yet.</p>
				<a class="btn big" href={resolve('/signin')}>Sign in</a>
			</div>
		</section>
	</main>

	<footer class="foot wrap">
		<p><BrandMark size={18} /> Payday: a free budget app. Not a loan, not a bank.</p>
		<p class="legal">
			<a href={resolve('/privacy')}>Privacy notice</a>
			<a href={resolve('/terms')}>Terms of use</a>
		</p>
	</footer>
</div>

<style>
	.landing {
		overflow-x: clip;
		padding-bottom: var(--space-8);
	}

	/* Sides only: a section's own space above and below must survive this class. */
	.wrap {
		box-sizing: border-box;
		max-width: var(--landing-width);
		margin-inline: auto;
		padding-inline: var(--space-5);
	}

	.narrow {
		max-width: var(--content-width);
	}

	@media (min-width: 48rem) {
		.wrap {
			padding-inline: var(--space-8);
		}
	}

	/* The top bar: the name, and a way in for people who already have an account. */
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding-top: var(--space-5);
		padding-bottom: var(--space-5);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-xl);
		font-weight: 700;
	}

	/* The first screen. */
	.hero {
		display: grid;
		gap: var(--space-10);
		align-items: center;
		padding-top: var(--space-6);
		padding-bottom: var(--space-16);
	}

	@media (min-width: 56rem) {
		.hero {
			grid-template-columns: 1.15fr 1fr;
			padding-top: var(--space-12);
		}
	}

	.eyebrow {
		display: inline-block;
		margin: 0 0 var(--space-4);
		padding: var(--space-1) var(--space-4);
		border: 1px solid color-mix(in srgb, var(--color-accent) 45%, transparent);
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--color-accent) 12%, transparent);
		color: var(--color-text);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	h1 {
		margin: 0 0 var(--space-5);
		font-size: var(--text-hero);
		font-weight: 700;
		line-height: var(--leading-tight);
		letter-spacing: -0.02em;
		text-wrap: balance;
	}

	.lead {
		max-width: 34rem;
		margin: 0 0 var(--space-8);
		color: var(--color-text);
		font-size: var(--text-lg);
		line-height: var(--leading-body);
	}

	.cta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3) var(--space-5);
		margin-bottom: var(--space-8);
	}

	.btn.big {
		height: calc(var(--control-height) + var(--space-2));
		padding: 0 var(--space-10);
		border-radius: var(--radius-pill);
		font-size: var(--text-lg);
		box-shadow: 0 var(--space-2) var(--space-8)
			color-mix(in srgb, var(--color-accent) 35%, transparent);
	}

	.soon {
		max-width: 18rem;
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--text-sm);
	}

	.trust {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-5);
		margin: 0;
		padding: 0;
		list-style: none;
		color: var(--color-text-muted);
	}

	.trust li {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	/* A small orange disc with a dark check mark: two strokes drawn with gradients, no image. */
	.tick {
		position: relative;
		display: inline-block;
		flex: none;
		width: var(--space-4);
		height: var(--space-4);
		border-radius: var(--radius-pill);
		background: var(--color-accent);
	}

	.tick::after {
		content: '';
		position: absolute;
		top: 22%;
		left: 34%;
		width: 26%;
		height: 44%;
		border: solid var(--color-on-accent);
		border-width: 0 2px 2px 0;
		transform: rotate(45deg);
	}

	/* The phone, with a warm glow behind it and two notes beside it. */
	.hero-art {
		position: relative;
		display: grid;
		justify-items: center;
		padding: var(--space-6) 0;
	}

	.glow {
		position: absolute;
		inset: 8% 0;
		border-radius: var(--radius-pill);
		background: radial-gradient(
			closest-side,
			color-mix(in srgb, var(--color-accent) 40%, transparent),
			transparent
		);
		filter: blur(var(--space-10));
	}

	.phone {
		position: relative;
		box-sizing: border-box;
		width: min(var(--phone-width), 78vw);
		margin: 0;
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-phone);
		background: var(--color-surface-2);
		box-shadow:
			0 var(--space-6) var(--space-16) color-mix(in srgb, var(--color-bg) 70%, transparent),
			inset 0 0 0 1px color-mix(in srgb, var(--color-text) 6%, transparent);
	}

	.phone img {
		display: block;
		width: 100%;
		height: auto;
		border-radius: calc(var(--radius-phone) - var(--space-2));
	}

	.note {
		position: absolute;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		padding: var(--space-2) var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--color-surface) 92%, transparent);
		box-shadow: 0 var(--space-2) var(--space-6) color-mix(in srgb, var(--color-bg) 60%, transparent);
		font-size: var(--text-sm);
		font-weight: 600;
		white-space: nowrap;
	}

	/* Beside the phone, never over its number. */
	.note-1 {
		top: 44%;
		left: 0;
	}

	.note-2 {
		bottom: 18%;
		right: 0;
	}

	/* Sections. */
	section {
		padding-top: var(--space-12);
		padding-bottom: var(--space-12);
	}

	.band {
		margin: var(--space-8) 0;
		border-block: 1px solid var(--color-border);
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--color-surface) 70%, transparent),
			color-mix(in srgb, var(--color-surface) 30%, transparent)
		);
	}

	.section-head {
		max-width: 40rem;
		margin-bottom: var(--space-8);
	}

	h2 {
		margin: 0 0 var(--space-3);
		font-size: var(--text-2xl);
		font-weight: 700;
		line-height: var(--leading-tight);
		text-wrap: balance;
	}

	.section-head p {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--text-lg);
	}

	h3 {
		margin: 0 0 var(--space-2);
		font-size: var(--text-lg);
		font-weight: 600;
		line-height: var(--leading-tight);
	}

	.card {
		box-sizing: border-box;
		padding: var(--space-6);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-4);
		background: var(--color-surface);
	}

	.card p {
		margin: 0;
		color: var(--color-text-muted);
		line-height: var(--leading-body);
	}

	.not-loan {
		padding-top: 0;
	}

	.not-loan .card {
		border-color: color-mix(in srgb, var(--color-accent) 45%, var(--color-border));
		background:
			radial-gradient(
				80% 140% at 0% 0%,
				color-mix(in srgb, var(--color-accent) 14%, transparent),
				transparent 70%
			),
			var(--color-surface);
	}

	.not-loan .card p {
		max-width: 46rem;
		color: var(--color-text);
		font-size: var(--text-lg);
	}

	.steps,
	.features,
	.screens {
		display: grid;
		gap: var(--space-5);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	@media (min-width: 48rem) {
		.steps {
			grid-template-columns: repeat(3, 1fr);
		}

		.features {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (min-width: 64rem) {
		.features {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	/* On a phone the number sits beside its step; side by side on a laptop, above it. */
	.steps .card {
		display: grid;
		grid-template-columns: auto 1fr;
		column-gap: var(--space-4);
		align-items: start;
	}

	.steps .card > :not(.step-no) {
		grid-column: 2;
	}

	.step-no {
		grid-row: span 2;
	}

	@media (min-width: 48rem) {
		.steps .card {
			display: block;
		}
	}

	.step-no {
		display: inline-grid;
		place-items: center;
		width: var(--space-12);
		height: var(--space-12);
		margin-bottom: var(--space-4);
		border-radius: var(--radius-pill);
		background: var(--color-accent);
		color: var(--color-on-accent);
		font-size: var(--text-xl);
		font-weight: 700;
	}

	.icon {
		box-sizing: border-box;
		width: var(--space-10);
		height: var(--space-10);
		margin-bottom: var(--space-4);
		padding: var(--space-2);
		border-radius: var(--radius-2);
		background: color-mix(in srgb, var(--color-accent) 14%, transparent);
		fill: none;
		stroke: var(--color-accent);
		stroke-width: 1.75;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.screens {
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		justify-items: center;
		gap: var(--space-10) var(--space-6);
	}

	.phone.small {
		width: min(15rem, 72vw);
	}

	.caption {
		margin: var(--space-4) 0 0;
		color: var(--color-text);
		font-weight: 600;
		text-align: center;
	}

	.faq {
		display: grid;
		gap: var(--space-3);
	}

	.qa {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-4);
		background: var(--color-surface);
	}

	.qa summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		min-height: var(--control-height);
		padding: var(--space-3) var(--space-5);
		font-size: var(--text-lg);
		font-weight: 600;
		cursor: pointer;
		list-style: none;
	}

	.qa summary::-webkit-details-marker {
		display: none;
	}

	.qa summary::after {
		content: '+';
		flex: none;
		color: var(--color-accent);
		font-size: var(--text-xl);
		font-weight: 600;
		line-height: 1;
	}

	.qa[open] summary::after {
		content: '\2212';
	}

	.qa p {
		margin: 0;
		padding: 0 var(--space-5) var(--space-5);
		color: var(--color-text-muted);
		line-height: var(--leading-body);
	}

	.end {
		display: grid;
		justify-items: center;
		gap: var(--space-3);
		padding: var(--space-12) var(--space-6);
		text-align: center;
		background:
			radial-gradient(
				70% 120% at 50% 100%,
				color-mix(in srgb, var(--color-accent) 22%, transparent),
				transparent 70%
			),
			var(--color-surface);
	}

	.end p {
		max-width: 30rem;
		margin-bottom: var(--space-4);
		font-size: var(--text-lg);
	}

	.foot .legal {
		gap: var(--space-5);
		margin-top: var(--space-3);
	}

	.foot .legal a {
		color: var(--color-text-muted);
		text-decoration: underline;
	}

	.foot p {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		margin: var(--space-8) 0 0;
		color: var(--color-text-muted);
		font-size: var(--text-sm);
		text-align: center;
	}

	/*
	 * Motion (motion.ts). Parts wait hidden only when script can run and motion is wanted; if the
	 * motion never starts, they appear on their own after a few seconds. Never the first screen's text.
	 */
	@media (scripting: enabled) and (prefers-reduced-motion: no-preference) {
		.landing:not(:global(.motion-off)) :global([data-reveal-part]),
		.landing:not(:global(.motion-off)) :global([data-pop]) {
			opacity: 0;
			animation: show-anyway var(--motion-base) var(--ease-out) 2.5s forwards;
		}

		.landing:global(.motion) :global([data-reveal-part]),
		.landing:global(.motion) :global([data-pop]) {
			animation: none;
		}
	}

	@keyframes show-anyway {
		to {
			opacity: 1;
		}
	}
</style>
