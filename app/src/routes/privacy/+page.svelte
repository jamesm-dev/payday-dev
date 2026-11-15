<script lang="ts">
	import { resolve } from '$app/paths';
	import { CONTACT, LEGAL_UPDATED, publicUrl } from '#lib/site.ts';

	const title = 'Privacy notice · Payday';
	const description =
		'What Payday keeps about you, why, for how long, and where. Your rights under the Philippines Data Privacy Act of 2012.';
	const url = publicUrl('/privacy');
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
	<h1>Privacy notice</h1>
	<p class="updated">Last updated: {LEGAL_UPDATED}</p>
	<p>
		Payday is a free budget app. This page says what it keeps about you, and why. We keep only what
		the app needs to work.
	</p>

	<h2>What Payday keeps</h2>
	<ul>
		<li>Your email address.</li>
		<li>Your password, scrambled (hashed). Nobody can read it, not even us.</li>
		<li>Your recovery codes, also hashed.</li>
		<li>
			Your passkeys, if you add them. A passkey lets you open Payday with a device's PIN,
			fingerprint or face.
		</li>
		<li>
			Your sessions: when each one started and was last used, and what the browser says about itself
			and your device (its "user agent", up to 300 characters, for example the browser and system
			name).
		</li>
		<li>
			Your budget: your pay, your bills, your loans, your check-ins and your daily expenses, and
			your settings (currency, time zone and reminder time).
		</li>
		<li>
			Short counters, to stop people from guessing. Every try to sign in, to use a recovery code, to
			confirm with a passkey, to sign up or to change an email leaves the internet address (IP
			address) it came from in a counter, right tries too. Wrong tries at sign-in are also counted
			under a scrambled form of the email typed (hashed with SHA-256), so the email itself is not
			kept there. Changing an email is also counted under your account number.
		</li>
	</ul>

	<h2>Why, and for how long</h2>
	<ul>
		<li>
			Your email, password, codes and passkeys let you sign in. They stay until you delete your
			account.
		</li>
		<li>
			Your sessions keep you signed in. They stay until you sign out or delete your account. They
			also end on their own after 14 days without use, and after 90 days at most. The record of an
			ended session (its times and device name) is removed a little later, the next time someone
			signs in.
		</li>
		<li>Your budget lets Payday show your number. It stays until you delete your account.</li>
		<li>
			An internet address in a counter is kept for a short time: one minute for sign-in tries, and
			one hour for sign-up and email changes. A scrambled email is kept for 5 minutes. The account
			number in the email-change counter is kept for one hour. After that, the counter is no longer
			used, and it is deleted a little later, when more people sign in or try. When you delete your
			account, the counters for your own email and account number are removed at once.
		</li>
		<li>
			Payday keeps no backups on its server. You download your own backup of your budget, and you
			keep it.
		</li>
	</ul>

	<h2>Where it is kept</h2>
	<p>
		Netlify runs the website. Supabase keeps the database. The database is in the United States
		(us-east-2). So your data may leave the country you live in.
	</p>

	<h2>Email</h2>
	<p>
		Payday never checks your email address. Payday never sends email. Nobody can reset your password
		by email, so keep your recovery codes safe.
	</p>

	<h2>No selling, no ads, no tracking</h2>
	<p>
		Your data is not sold. There are no ads. There is no tracking of what you do, and no outside
		analytics.
	</p>

	<h2>Your rights</h2>
	<p>
		The Philippines' Data Privacy Act of 2012 gives you rights over your data. In Payday you can:
	</p>
	<ul>
		<li>
			See your data. Download your budget in Settings › Backup. The backup holds your budget only.
			Settings › Security shows your devices, passkeys and email.
		</li>
		<li>Correct your data. Change it in the app, at any time.</li>
		<li>
			Have your data erased. Delete your account in Settings › Your account. Your budget, email,
			password, passkeys, recovery codes and sessions are removed at once, and there is no undo.
		</li>
	</ul>
	<p>
		You can also ask the person responsible, below, or complain to the National Privacy Commission.
	</p>

	<h2>Who to contact</h2>
	<p>
		Write to the person who runs Payday: <a href="mailto:{CONTACT}">{CONTACT}</a>
	</p>

	<p class="back">
		<a href={resolve('/terms')}>Terms of use</a> · <a href={resolve('/')}>Back to Payday</a>
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
