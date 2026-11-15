<script lang="ts">
	import { untrack } from 'svelte';
	import { moneyText } from '#lib/format.ts';
	import { EXAMPLE, exampleNumber } from './example.ts';

	/*
	 * "Try it": the visitor moves four sliders and watches an example number change. It is labelled
	 * as an example and never touches a budget. Server-rendered at its first position, so it reads
	 * in full without JavaScript; the number counts to its new value with anime.js, unless the
	 * visitor asks for less motion. Screen readers hear the settled value once, not every frame.
	 */

	let pay = $state<number>(EXAMPLE.pay.start);
	let bills = $state<number>(EXAMPLE.bills.start);
	let loans = $state<number>(EXAMPLE.loans.start);
	let days = $state<number>(EXAMPLE.days.start);

	const result = $derived(exampleNumber({ pay, bills, loans, days }));
	const money = (n: number) => moneyText(n, EXAMPLE.currency);
	/** Whole pesos for the sliders' own labels: "₱18,000". */
	const pesos = (n: number) => money(n).replace(/\.00$/, '');
	const dayWord = (n: number) => (n === 1 ? '1 day' : `${n} days`);

	/** The number as drawn: counts toward `result.safe` (anime.js), or jumps there. */
	let shown = $state(
		exampleNumber({
			pay: EXAMPLE.pay.start,
			bills: EXAMPLE.bills.start,
			loans: EXAMPLE.loans.start,
			days: EXAMPLE.days.start
		}).safe
	);
	let counter: { value: number } | null = null;
	let running: { revert: () => unknown } | null = null;

	// Runs when the result changes; what is drawn (`shown`) is read untracked, so the count's own
	// frames never restart it.
	$effect(() => {
		const target = result.safe;
		untrack(() => {
			if (target === shown && !running) return;
			if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
				shown = target;
				return;
			}
			void count(target);
		});
	});

	async function count(target: number) {
		const { animate } = await import('animejs');
		running?.revert();
		counter = { value: shown };
		running = animate(counter, {
			value: target,
			duration: 450,
			ease: 'outCubic',
			onUpdate: () => {
				if (counter) shown = Math.round(counter.value / 100) * 100;
			},
			onComplete: () => {
				shown = target;
				running = null;
			}
		});
	}

	// The bar's three parts, as percentages of its width.
	const parts = $derived({
		bills: result.shares.bills * 100,
		loans: result.shares.loans * 100,
		safe: result.shares.safe * 100
	});
</script>

<div class="try">
	<div class="controls">
		<div class="slider">
			<label for="try-pay">Your pay this payday <span class="value">{pesos(pay)}</span></label>
			<input
				id="try-pay"
				type="range"
				min={EXAMPLE.pay.min}
				max={EXAMPLE.pay.max}
				step={EXAMPLE.pay.step}
				aria-valuetext={pesos(pay)}
				bind:value={pay}
			/>
		</div>
		<div class="slider">
			<label for="try-bills">
				Bills before your next payday <span class="value">{pesos(bills)}</span>
			</label>
			<input
				id="try-bills"
				type="range"
				min={EXAMPLE.bills.min}
				max={EXAMPLE.bills.max}
				step={EXAMPLE.bills.step}
				aria-valuetext={pesos(bills)}
				bind:value={bills}
			/>
		</div>
		<div class="slider">
			<label for="try-loans">
				Loan payments before payday <span class="value">{pesos(loans)}</span>
			</label>
			<input
				id="try-loans"
				type="range"
				min={EXAMPLE.loans.min}
				max={EXAMPLE.loans.max}
				step={EXAMPLE.loans.step}
				aria-valuetext={pesos(loans)}
				bind:value={loans}
			/>
		</div>
		<div class="slider">
			<label for="try-days">Days until payday <span class="value">{dayWord(days)}</span></label>
			<input
				id="try-days"
				type="range"
				min={EXAMPLE.days.min}
				max={EXAMPLE.days.max}
				step={EXAMPLE.days.step}
				aria-valuetext={dayWord(days)}
				bind:value={days}
			/>
		</div>
	</div>

	<div class="result" class:short={result.short > 0}>
		<p class="tag">Example</p>
		{#if result.short > 0}
			<p class="label">Short before payday by</p>
			<p class="figure" aria-hidden="true" data-testid="try-figure">{money(-shown)}</p>
			<p class="say">
				The bills and loans need more than the pay. Payday shows this early, so you can plan for it.
			</p>
		{:else}
			<p class="label">Safe to spend until payday</p>
			<p class="figure" aria-hidden="true" data-testid="try-figure">{money(shown)}</p>
			<p class="say">
				That is about <strong>{pesos(result.perDay)}</strong> a day for {dayWord(days)}.
			</p>
		{/if}
		<!-- Announced once the number settles; the drawn figure above is hidden from screen readers. -->
		<p class="sr-only" role="status" data-testid="try-result">
			{result.short > 0
				? `Short before payday by ${money(result.short)}.`
				: `Safe to spend until payday: ${money(result.safe)}.`}
		</p>

		<div class="bar" aria-hidden="true">
			<svg viewBox="0 0 100 10" preserveAspectRatio="none" focusable="false">
				<rect class="bills" x="0" y="0" width={parts.bills} height="10" />
				<rect class="loans" x={parts.bills} y="0" width={parts.loans} height="10" />
				<rect class="left" x={parts.bills + parts.loans} y="0" width={parts.safe} height="10" />
			</svg>
		</div>
		<ul class="legend">
			<li><span class="swatch bills"></span> Bills {pesos(bills)}</li>
			<li><span class="swatch loans"></span> Loans {pesos(loans)}</li>
			<li><span class="swatch left"></span> Safe to spend {pesos(Math.max(result.safe, 0))}</li>
		</ul>
	</div>
</div>

<style>
	.try {
		display: grid;
		gap: var(--space-6);
	}

	@media (min-width: 52rem) {
		.try {
			grid-template-columns: 1fr 1fr;
			align-items: center;
			gap: var(--space-10);
		}
	}

	.controls {
		display: grid;
		gap: var(--space-5);
	}

	.slider label {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
		font-weight: 500;
	}

	.value {
		color: var(--color-accent);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	input[type='range'] {
		display: block;
		width: 100%;
		height: var(--control-height-sm);
		margin: 0;
		accent-color: var(--color-accent);
		cursor: pointer;
	}

	.result {
		position: relative;
		padding: var(--space-6);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-4);
		background:
			radial-gradient(
				120% 90% at 50% 0%,
				color-mix(in srgb, var(--color-accent) 16%, transparent),
				transparent 70%
			),
			var(--color-surface);
		text-align: center;
	}

	/* Says first, above everything, that this is not a real budget. */
	.tag {
		display: inline-block;
		margin: 0 0 var(--space-3);
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-pill);
		background: var(--color-surface-2);
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.label {
		margin: 0;
		color: var(--color-text-muted);
	}

	.figure {
		margin: var(--space-1) 0 var(--space-2);
		color: var(--color-accent);
		font-size: var(--text-figure);
		font-weight: 700;
		line-height: var(--leading-tight);
		font-variant-numeric: tabular-nums;
	}

	.short .figure {
		color: var(--color-warn);
	}

	.say {
		margin: 0 0 var(--space-6);
	}

	.bar {
		overflow: hidden;
		height: var(--space-3);
		border-radius: var(--radius-pill);
		background: var(--color-surface-2);
	}

	.bar svg {
		display: block;
		width: 100%;
		height: 100%;
	}

	.bills {
		fill: var(--color-text-muted);
		background: var(--color-text-muted);
	}

	.loans {
		fill: var(--color-caution);
		background: var(--color-caution);
	}

	.left {
		fill: var(--color-accent);
		background: var(--color-accent);
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-2) var(--space-5);
		margin: var(--space-4) 0 0;
		padding: 0;
		list-style: none;
		color: var(--color-text-muted);
		font-size: var(--text-sm);
	}

	.legend li {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	.swatch {
		display: inline-block;
		width: var(--space-3);
		height: var(--space-3);
		border-radius: var(--radius-pill);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}
</style>
