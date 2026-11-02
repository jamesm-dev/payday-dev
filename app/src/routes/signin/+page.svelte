<script lang="ts">
	import '#lib/styles/controls.css';
	import Notice from '#lib/ui/Notice.svelte';
	import { onMount, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import RecoveryCodes from '#lib/auth/RecoveryCodes.svelte';
	import BrandMark from '#lib/brand/BrandMark.svelte';
	import { createPasskey, PasskeyError, signInWithPasskey } from '#lib/auth/passkey-client.ts';
	import TypedTagline from './TypedTagline.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let busy = $state(false);
	// Which of the two sign-in forms is waiting for the server.
	let pending = $state<'password' | 'recovery' | null>(null);
	/**
	 * Posts without a page load. A failure updates `form` and keeps what was typed. Signed in, the
	 * owner goes on with a full load that REPLACES this page in the history, so Back never returns to
	 * the sign-in form (and the new session is read fresh by every page).
	 */
	const submitting = (which: 'password' | 'recovery') => () => {
		pending = which;
		return async ({
			result,
			update
		}: {
			result: { type: string; location?: string };
			update: (options?: { reset?: boolean }) => Promise<void>;
		}) => {
			if (result.type === 'redirect' && result.location) {
				goOn(result.location);
				return;
			}
			await update({ reset: false });
			pending = null;
		};
	};
	let problem = $state('');
	let nickname = $state('');
	// Set right after the first registration, and shown exactly once.
	let enhancedCodes = $state<string[] | null>(null);
	// Without JavaScript the codes come back with the page instead.
	const recoveryCodes = $derived(
		enhancedCodes ?? (form && 'recoveryCodes' in form ? form.recoveryCodes : null)
	);
	// After the codes: the offer to add this device's PIN, fingerprint or face.
	let offering = $state(false);

	// Once the owner starts a new attempt (a passkey try, or editing a field), the result of the last
	// full-page post is dismissed and never shown again, even if a later error clears.
	// Raw, not a deep $state: a proxy of `form` would never be the same object as `form` itself.
	let dismissed = $state.raw<object | null>(null);
	const current = $derived(form && form !== dismissed ? form : null);
	const dismiss = () => {
		dismissed = form;
		editedKey = errorKey;
	};

	const formMessage = (which: 'register' | 'password' | 'recovery') =>
		current && 'which' in current && current.which === which && 'message' in current
			? current.message
			: '';

	// The error of the default state shows where the tagline is. A new `form` (or passkey problem)
	// is a new error, even with the same words, so each gets its own key and animates again.
	const formKeys = new WeakMap<object, number>();
	let nextFormKey = 0;
	let problemKey = $state(0);
	const errorKey = $derived.by(() => {
		if (form && !formKeys.has(form)) formKeys.set(form, ++nextFormKey);
		return `${form ? formKeys.get(form) : 0}-${problemKey}`;
	});
	const errorMessage = $derived(
		problem || formMessage('register') || formMessage('password') || formMessage('recovery') || null
	);
	type Field = 'setupCode' | 'password' | 'code';
	// The one input an error belongs to is marked invalid until the owner edits it.
	const errorField = $derived<Field | 'none'>(
		problem ? 'none' : (current && 'field' in current && current.field) || 'none'
	);
	let editedKey = $state('');
	const invalid = (field: Field) =>
		errorMessage !== null && errorField === field && editedKey !== errorKey ? 'true' : undefined;
	const describedBy = (field: Field) => (invalid(field) ? 'signin-error' : undefined);
	// Where a failed post sent the owner on to survives the reload that action URLs cause.
	const next = $derived((form && 'next' in form && form.next) || data.next);
	/*
	 * Opened by a failed recovery post (rendered open by the server, so this works without JavaScript).
	 * Otherwise it is the owner's to open and close: bind:open follows each toggle, so a re-render (the
	 * Sign in button going busy, a field's error mark clearing) never reopens a panel they closed. Only a
	 * new recovery result opens it again; nothing here ever closes it.
	 */
	const isRecoveryResult = (result: typeof form) =>
		Boolean(result && 'which' in result && result.which === 'recovery');
	let recoveryOpen = $state(untrack(() => isRecoveryResult(form)));
	$effect(() => {
		if (isRecoveryResult(form)) recoveryOpen = true;
	});

	// Replaces this page in the history, like a form sign-in: Back never returns to the sign-in form.
	/**
	 * Goes on with a full load that replaces this page in the history. Only ever within this app: the
	 * address comes from our own actions (through safeNext), but anything else — another origin, a
	 * javascript: URL — goes to the start instead.
	 */
	function goOn(location: string) {
		const to = new URL(location, window.location.href);
		window.location.replace(to.origin === window.location.origin ? to.href : '/');
	}
	const finish = () => goOn(next);

	// Back after signing in can restore this page from the back-forward cache; ask the server again,
	// which sends a signed-in owner on.
	onMount(() => {
		const reload = (event: PageTransitionEvent) => {
			// replace(), not reload(): reload would re-POST a failed password or recovery form.
			if (event.persisted) location.replace(location.href);
		};
		window.addEventListener('pageshow', reload);
		return () => window.removeEventListener('pageshow', reload);
	});

	async function run(action: () => Promise<void>) {
		busy = true;
		problem = '';
		dismiss();
		try {
			await action();
		} catch (error) {
			problem = error instanceof PasskeyError ? error.message : 'Something went wrong.';
			problemKey++;
		} finally {
			busy = false;
		}
	}

	const addDevice = () =>
		run(async () => {
			try {
				await createPasskey(nickname);
			} catch (error) {
				if (error instanceof PasskeyError && error.needsStepUp) {
					throw new PasskeyError(
						'It has been a while since you signed in. Add this device later, in Security settings.'
					);
				}
				throw error;
			}
			// A full load, so the first thing the browser shows is the page the session allows.
			finish();
		});

	const signIn = () =>
		run(async () => {
			await signInWithPasskey();
			finish();
		});
</script>

<svelte:head>
	<title>Sign in · Payday</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page signin">
	{#if recoveryCodes && offering}
		<h1>Unlock faster on this device?</h1>
		<p>
			You can also open Payday with this device's PIN, fingerprint or face (a passkey), instead of
			typing your password. You can add or remove devices later in Security settings.
		</p>
		<label class="field">
			<span>Name this device (optional)</span>
			<input bind:value={nickname} maxlength="40" placeholder="iPhone" autocomplete="off" />
		</label>
		<button class="btn wide" type="button" onclick={addDevice} disabled={busy}>
			Also unlock with this device's PIN, fingerprint or face
		</button>
		{#if problem}
			<Notice tone="danger" role="alert"><p>{problem}</p></Notice>
		{/if}
		<p>
			<button class="btn secondary wide" type="button" onclick={finish} disabled={busy}>
				Not now
			</button>
		</p>
	{:else if recoveryCodes}
		<h1>Save your recovery codes</h1>
		<p>If you forget your password, these are the only way back in. Each one works once.</p>
		<p>
			<strong>This is the only time they are shown.</strong> Write them down or store them somewhere safe.
		</p>
		<RecoveryCodes codes={recoveryCodes} />
		<button class="btn wide" type="button" onclick={() => (offering = true)}>
			I've saved these
		</button>
	{:else}
		<h1 class="brand"><BrandMark /> Payday</h1>
		<TypedTagline
			tagline="Know what's safe to spend until payday."
			message={errorMessage}
			key={errorKey}
		/>

		{#if data.registrationOpen}
			<p>
				Choose the password that unlocks Payday. You do this once: after this, nobody else can
				register.
			</p>
			<form
				method="POST"
				action="?/register"
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
				{#if data.needsSetupCode}
					<label class="field">
						<span>Setup code</span>
						<input
							name="setupCode"
							type="password"
							aria-describedby={describedBy('setupCode')}
							aria-invalid={invalid('setupCode')}
							oninput={dismiss}
							autocomplete="off"
							spellcheck="false"
							autocapitalize="off"
						/>
					</label>
				{/if}
				<label class="field">
					<span>New password</span>
					<input
						name="password"
						type="password"
						autocomplete="new-password"
						aria-describedby={['new-password-hint', describedBy('password')]
							.filter(Boolean)
							.join(' ')}
						aria-invalid={invalid('password')}
						oninput={dismiss}
						spellcheck="false"
						autocapitalize="off"
						required
					/>
				</label>
				<p class="muted hint-line" id="new-password-hint">
					At least 12 characters. A few words in a row work well.
				</p>
				<label class="field">
					<span>Type it again</span>
					<input
						name="again"
						type="password"
						autocomplete="new-password"
						aria-describedby={describedBy('password')}
						aria-invalid={invalid('password')}
						oninput={dismiss}
						spellcheck="false"
						autocapitalize="off"
						required
					/>
				</label>
				<button class="btn wide" type="submit" disabled={busy}>Create your password</button>
			</form>
		{:else}
			<form method="POST" action="?/password" use:enhance={submitting('password')}>
				<input type="hidden" name="next" value={next} />
				<label class="field">
					<span>Password</span>
					<input
						name="password"
						type="password"
						autocomplete="current-password"
						aria-describedby={describedBy('password')}
						aria-invalid={invalid('password')}
						oninput={dismiss}
						spellcheck="false"
						autocapitalize="off"
						required
					/>
				</label>
				<button class="btn wide" type="submit" disabled={pending !== null}>
					{pending === 'password' ? 'Signing in…' : 'Sign in'}
				</button>
			</form>

			{#if data.hasPasskey}
				<p class="muted or">or</p>
				<button class="btn secondary wide" type="button" onclick={signIn} disabled={busy}>
					Use this device's PIN, fingerprint or face
				</button>
			{/if}

			<details class="recovery" bind:open={recoveryOpen}>
				<summary>Forgot your password? Use a recovery code</summary>
				<form method="POST" action="?/recovery" use:enhance={submitting('recovery')}>
					<input type="hidden" name="next" value={next} />
					<label class="field">
						<span>Recovery code</span>
						<input
							name="code"
							aria-describedby={describedBy('code')}
							aria-invalid={invalid('code')}
							oninput={dismiss}
							required
							autocomplete="off"
							autocapitalize="characters"
							spellcheck="false"
							placeholder="XXXX-XXXX-XXXX-XXXX"
						/>
					</label>
					<button class="btn secondary wide" type="submit" disabled={pending !== null}>
						{pending === 'recovery' ? 'Checking…' : 'Sign in with recovery code'}
					</button>
				</form>
			</details>
		{/if}
	{/if}
</main>

<style>
	/* The sign-in column: narrow and centred; on a wide screen, centred in the viewport too. */
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

	/* The word, then the mark on its right, centred. The mark is decorative (aria-hidden). */
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

	.recovery {
		margin-top: var(--space-6);
	}

	summary {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: var(--control-height-sm);
		color: var(--color-text-muted);
		text-align: center;
		cursor: pointer;
	}

	summary:hover {
		color: var(--color-text);
	}

	.hint-line {
		margin: calc(-1 * var(--space-2)) 0 var(--space-4);
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
</style>
