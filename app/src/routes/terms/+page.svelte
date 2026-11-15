<script lang="ts">
	import { resolve } from '$app/paths';
	import { CONTACT, LEGAL_UPDATED, publicUrl } from '#lib/site.ts';

	const title = 'Terms of use · Payday';
	const description =
		'The simple rules for using Payday: a free planning tool, not financial advice, a loan or a bank.';
	const url = publicUrl('/terms');
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={url} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={url} />
</svelte:head>

<main class="legal-page">
	<h1>Terms of use</h1>
	<p class="updated">Last updated: {LEGAL_UPDATED}</p>
	<p>By using Payday, you agree to these simple rules.</p>

	<h2>What Payday is</h2>
	<p>
		Payday is free. It is a planning tool. It is not financial advice. It is not a loan, and it is
		not a bank. It never holds your money.
	</p>

	<h2>Your numbers</h2>
	<p>
		Payday shows numbers from what you type. If what you type is wrong or old, the numbers will be
		wrong too. You decide what to do with your money.
	</p>

	<h2>Your recovery codes</h2>
	<p>
		Keep your recovery codes in a safe place. Payday cannot reset a password by email. If you lose
		your password and your codes, we may not be able to give you back your account.
	</p>

	<h2>Accounts are limited for now</h2>
	<p>
		Payday has room for a limited number of accounts for now. When it is full, no new account can be
		made until there is room.
	</p>

	<h2>Be fair</h2>
	<ul>
		<li>Do not abuse the service or try to break it.</li>
		<li>Do not use a program to make accounts.</li>
		<li>Do not use another person's account.</li>
	</ul>

	<h2>Changes and the end of the service</h2>
	<p>
		Payday may change, or it may end. You can download your data at any time, in Settings › Backup.
		Please keep a copy.
	</p>

	<h2>Who to contact</h2>
	<p>
		Write to the person who runs Payday: <a href="mailto:{CONTACT}">{CONTACT}</a>
	</p>

	<p class="back">
		<a href={resolve('/privacy')}>Privacy notice</a> · <a href={resolve('/')}>Back to Payday</a>
	</p>
</main>

<style>
	.legal-page {
		max-width: var(--content-width);
		margin: 0 auto;
		padding: var(--space-12) var(--space-5);
		overflow-wrap: break-word;
	}

	h1 {
		margin: 0 0 var(--space-2);
		font-size: var(--text-2xl);
		line-height: var(--leading-tight);
	}

	h2 {
		margin: var(--space-8) 0 var(--space-2);
		font-size: var(--text-lg);
	}

	p,
	li {
		line-height: 1.6;
	}

	ul {
		padding-left: var(--space-5);
	}

	.updated,
	.back {
		color: var(--color-text-muted);
		font-size: var(--text-sm);
	}

	a {
		color: var(--color-accent);
	}
</style>
