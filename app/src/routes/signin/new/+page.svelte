<script lang="ts">
	import '#lib/styles/controls.css';
	import Notice from '#lib/ui/Notice.svelte';
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import RecoveryCodes from '#lib/auth/RecoveryCodes.svelte';
	import BrandMark from '#lib/brand/BrandMark.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const title = 'Create a free account · Payday';

	let busy = $state(false);
	// Set right after sign-up, and shown exactly once. Never kept anywhere else.
	let enhancedCodes = $state<string[] | null>(null);
	// A newcomer from Google gets them with the page, once; kept so a re-run of the load cannot drop them.
	const fromGoogle = untrack(() => data.codes);
	// Without JavaScript the codes come back with the page instead.
	const recoveryCodes = $derived(
		enhancedCodes ?? (form && 'recoveryCodes' in form ? form.recoveryCodes : null) ?? fromGoogle
	);
	const refusal = $derived(form && 'message' in form ? form : null);
	// Full when the page was loaded full, or when the last place went while this form was waiting.
	const full = $derived(!data.open || refusal?.reason === 'full');
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page signin">
	{#if recoveryCodes}
		<h1>Save your recovery codes</h1>
		<p>
			If you forget your password, these codes are the only way back in. Payday cannot reset a
			password by email. Each code works once.
		</p>
		<p>
			<strong>This is the only time they are shown.</strong> Write them down or keep them somewhere safe.
		</p>
		<RecoveryCodes codes={recoveryCodes} />
		<a class="btn wide" href={resolve('/setup')} data-sveltekit-reload>Continue</a>
	{:else if full}
		<h1 class="brand"><BrandMark /> Payday</h1>
		<h2>Sign-up is full for now</h2>
		<p>Payday has no room for new accounts at the moment. Please check again later.</p>
		<p>If you already have an account, you can sign in.</p>
		<a class="btn wide" href={resolve('/signin')}>Sign in</a>
	{:else}
		<h1>Create a free account</h1>
		<p>
			Use your email and a password to sign in on any device. Payday does not check or email this
			address. It is only your name for signing in.
		</p>
		<form
			method="POST"
			use:enhance={() => {
				busy = true;
				return async ({ result, update }) => {
					busy = false;
					const codes =
						result.type === 'success' ? (result.data as { recoveryCodes?: string[] }) : null;
					if (codes?.recoveryCodes) enhancedCodes = codes.recoveryCodes;
					else await update({ reset: false });
				};
			}}
		>
			{#if refusal}
				<Notice tone="danger" role="alert">
					<p>
						{refusal.message}
						{#if refusal.reason === 'taken'}
							<a href={resolve('/signin')}>Sign in</a>
						{/if}
					</p>
				</Notice>
			{/if}
			<label class="field">
				<span>Email</span>
				<input
					name="email"
					type="email"
					autocomplete="email"
					autocapitalize="off"
					spellcheck="false"
					defaultValue={refusal?.email ?? ''}
					aria-invalid={refusal?.field === 'email' ? 'true' : undefined}
					required
				/>
			</label>
			<label class="field">
				<span>Password</span>
				<input
					name="password"
					type="password"
					autocomplete="new-password"
					aria-describedby="new-password-hint"
					aria-invalid={refusal?.field === 'password' ? 'true' : undefined}
					spellcheck="false"
					autocapitalize="off"
					required
				/>
			</label>
			<p class="muted hint-line" id="new-password-hint">
				At least 12 characters. A few words in a row work well.
			</p>
			<label class="field">
				<span>Type the password again</span>
				<input
					name="again"
					type="password"
					autocomplete="new-password"
					aria-invalid={refusal?.field === 'password' ? 'true' : undefined}
					spellcheck="false"
					autocapitalize="off"
					required
				/>
			</label>
			<button class="btn wide" type="submit" disabled={busy}>
				{busy ? 'Creating…' : 'Create a free account'}
			</button>
		</form>
		{#if data.google}
			<p class="muted or">or</p>
			<a class="btn secondary wide" href={resolve('/signin/google')} data-sveltekit-reload>
				Continue with Google
			</a>
		{/if}
		<p class="muted again">Already have an account? <a href={resolve('/signin')}>Sign in</a></p>
	{/if}
	<p class="legal">
		<a href={resolve('/privacy')}>Privacy notice</a> · <a href={resolve('/terms')}>Terms of use</a>
	</p>
</main>

<style>
	.signin {
		display: flex;
		flex-direction: column;
		max-width: 24rem;
		padding: var(--space-16) var(--space-5) var(--space-12);
	}

	@media (min-width: 48rem) {
		.signin {
			justify-content: center;
			min-height: 100dvh;
			padding: var(--space-12) var(--space-5);
		}
	}

	.brand {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-brand);
		font-weight: 700;
		line-height: var(--leading-tight);
		text-align: center;
	}

	.brand :global(svg) {
		width: 0.85em;
		height: 0.85em;
	}

	.hint-line {
		margin: calc(-1 * var(--space-2)) 0 var(--space-4);
	}

	.again {
		margin: var(--space-6) 0 0;
		text-align: center;
	}

	/* A hairline with "or" centred on it. */
	.or {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		margin: var(--space-6) 0;
	}

	.or::before,
	.or::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--color-border);
	}

	.legal {
		margin: var(--space-8) 0 0;
		color: var(--color-text-muted);
		font-size: var(--text-sm);
		text-align: center;
	}

	.legal a {
		color: inherit;
		text-decoration: underline;
	}
</style>
