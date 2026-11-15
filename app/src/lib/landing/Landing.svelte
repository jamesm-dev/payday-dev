<script lang="ts">
	import '#lib/styles/controls.css';
	import { resolve } from '$app/paths';
	import BrandMark from '#lib/brand/BrandMark.svelte';
	import { publicUrl } from '#lib/site.ts';

	/*
	 * The public home page: what a visitor who is not signed in sees at "/". Plain text, readable with
	 * no JavaScript, written for people who may not read English as a first language: short
	 * sentences, common words. It never offers a sign-up: new accounts are not open yet.
	 */
	const title = 'Payday: know how much you can spend until payday';
	const description =
		'Payday is a free, simple app. It shows how much money you can spend until your next payday, after every bill and loan payment.';
	const url = publicUrl('/');
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={url} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={url} />
	<meta property="og:image" content={publicUrl('/icon-512.png')} />
</svelte:head>

<main class="page landing">
	<p class="brand"><BrandMark /> <span>Payday</span></p>

	<h1>Know how much you can spend until payday</h1>
	<p class="lead">
		Payday is a free app for your money. It looks at your pay, your bills and your loans. Then it
		shows one number: the money you can spend until your next payday.
	</p>
	<p class="start"><a class="btn" href={resolve('/signin')}>Sign in</a></p>

	<h2>How it works</h2>
	<ol>
		<li>Add your pay and your bills. Payday asks one question at a time.</li>
		<li>See your number. It is the money left after every bill and loan payment until payday.</li>
		<li>
			On payday, do your payday update. It takes about five minutes. Payday shows what you spent and
			plans until your next payday.
		</li>
	</ol>

	<h2>What Payday does for you</h2>
	<ul>
		<li>You do not miss a bill. Payday keeps money for each bill before you spend it.</li>
		<li>
			You see when your loans end. Payday adds them up and shows the day you are free of debt.
		</li>
		<li>It works on your phone. You can add it to your home screen, like an app.</li>
		<li>Your budget is private. There are no ads, and your data is not sold.</li>
		<li>It is free.</li>
	</ul>

	<!-- A plain note, not a Notice: its tones mean danger, caution or done, and this is none of them. -->
	<p class="note">Right now, Payday has one user. Accounts for new people are not open yet.</p>
</main>

<style>
	.brand {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0 0 var(--space-8);
		font-size: var(--text-xl);
		font-weight: 700;
	}

	.lead {
		color: var(--color-text);
		font-size: var(--text-lg);
		line-height: var(--leading-body);
	}

	/* The page's own rule for a paragraph after the title is muted; the lead is the main text. */
	.landing :global(h1 + p.lead) {
		color: var(--color-text);
		font-size: var(--text-lg);
	}

	.start {
		margin: 0;
	}

	ol,
	ul {
		margin: 0;
		padding-left: var(--space-6);
		font-size: var(--text-base);
		line-height: var(--leading-body);
	}

	li + li {
		margin-top: var(--space-3);
	}

	/* The same quiet note as the payday update's "today is payday": an accent rule on a surface. */
	.note {
		margin: var(--space-10) 0 0;
		padding: var(--space-3) var(--space-4);
		border-left: var(--space-1) solid var(--color-accent);
		background: var(--color-surface);
		color: var(--color-text);
	}
</style>
