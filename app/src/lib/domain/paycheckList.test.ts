/*
 * A list in the owner's own format, given on 2026-11-01, reproduced from entries. The names are fake
 * and the amounts scaled (x 0.6) so the owner's real list stays private; the format, marks, groups and
 * the sample's one arithmetic slip are kept. Amounts in the sample are whole pesos; here they are
 * minor units (ADR-0007), so 30000 is minor(3_000_000).
 *
 * Checked by hand: the `*` lines are 4500 + 3000 + 4500 = 12000, the `/` lines 19560, the unmarked
 * 66000. All = 97560; without the optional = 85560; current salary week = 66000. The sample
 * itself reads 97200 for the last total, which is the one line the app computes differently.
 */
import { describe, expect, it } from 'vitest';
import { calDate } from './dates.ts';
import { minor } from './money.ts';
import { listAmount, listLines, markOf, paycheckList, type ListEntry } from './paycheckList.ts';

const SAMPLE = `30000	Salary
---------------------
*4500	Outreach
/3000	Mika/Ren
*3000	Crypto (BTC 1200, ETH 600)

21000	Lorna
/5400	Electric Bill
/1260	Fiber Bill

9000	Nova Credit

/4500	Paywise Loan
/1500	Paywise Gives
/900	Paywise Credit

9000	ShoplyLater
9000	ShoplyLoan

/1200	Speaker
/1800	Washing Machine
6000	Hillcrest
9000	Maplewood
*4500	Claude

3000	Pamalengke
---------------------
85560	Total (without the *OPTIONAL)
66000	Total (current salary week)

97200	Total (ALL)`.split('\n');

const pesos = (n: number) => minor(n * 100);

/** The sample's lines in order, each one day after the last, so the date order is the sample's. */
const ROWS: [mark: '' | '*' | '/', amount: number, name: string, group: string][] = [
	['*', 4500, 'Outreach', 'Giving'],
	['/', 3000, 'Mika/Ren', 'Giving'],
	['*', 3000, 'Crypto (BTC 1200, ETH 600)', 'Giving'],
	['', 21000, 'Lorna', 'House'],
	['/', 5400, 'Electric Bill', 'House'],
	['/', 1260, 'Fiber Bill', 'House'],
	['', 9000, 'Nova Credit', 'Nova'],
	['/', 4500, 'Paywise Loan', 'Paywise'],
	['/', 1500, 'Paywise Gives', 'Paywise'],
	['/', 900, 'Paywise Credit', 'Paywise'],
	['', 9000, 'ShoplyLater', 'Shoply'],
	['', 9000, 'ShoplyLoan', 'Shoply'],
	['/', 1200, 'Speaker', 'Monthly'],
	['/', 1800, 'Washing Machine', 'Monthly'],
	['', 6000, 'Hillcrest', 'Monthly'],
	['', 9000, 'Maplewood', 'Monthly'],
	['*', 4500, 'Claude', 'Monthly'],
	['', 3000, 'Pamalengke', '']
];

const entries: ListEntry[] = ROWS.map(([mark, amount, name, group], i) => ({
	name,
	amount: pesos(amount),
	date: calDate(2026, 11, i + 1),
	...(group ? { group } : {}),
	...(mark === '*' ? { optional: true } : {}),
	...(mark === '/' ? { paid: true } : {})
}));

describe("TSK-EB7093 a paycheck is laid out as the owner's own list", () => {
	const list = paycheckList([{ name: 'Salary', amount: pesos(30000) }], entries);
	const lines = listLines(list);

	it('reproduces the sample line for line, with the last total computed', () => {
		const expected = SAMPLE.map((l) => (l === '97200\tTotal (ALL)' ? '97560\tTotal (ALL)' : l));
		expect(lines).toEqual(expected);
	});

	it('differs from the sample only in its arithmetic slip', () => {
		const differ = lines.filter((l, i) => l !== SAMPLE[i]);
		expect(differ).toEqual(['97560\tTotal (ALL)']);
	});

	it('computes the three totals from the marks', () => {
		expect(list.all).toBe(pesos(97560));
		expect(list.withoutOptional).toBe(pesos(85560));
		expect(list.currentWeek).toBe(pesos(66000));
	});

	it('orders groups by their earliest date, whatever order the entries arrive in', () => {
		const shuffled = paycheckList(
			[{ name: 'Salary', amount: pesos(30000) }],
			[...entries].reverse()
		);
		expect(listLines(shuffled)).toEqual(lines);
	});

	it('treats two spellings of one group as one block', () => {
		const l = paycheckList(
			[],
			[
				{ name: 'A', amount: pesos(1), date: calDate(2026, 11, 1), group: 'GCash' },
				{ name: 'B', amount: pesos(2), date: calDate(2026, 11, 2), group: 'Rent' },
				{ name: 'C', amount: pesos(3), date: calDate(2026, 11, 3), group: ' gcash ' }
			]
		);
		expect(l.blocks.map((b) => b.map((x) => x.name))).toEqual([['A', 'C'], ['B']]);
	});

	it('puts every ungrouped line in one block', () => {
		const l = paycheckList(
			[],
			[
				{ name: 'A', amount: pesos(1), date: calDate(2026, 11, 1) },
				{ name: 'B', amount: pesos(2), date: calDate(2026, 11, 2), group: 'X' },
				{ name: 'C', amount: pesos(3), date: calDate(2026, 11, 3) }
			]
		);
		expect(l.blocks.map((b) => b.map((x) => x.name))).toEqual([['A', 'C'], ['B']]);
	});

	it('marks a paid optional bill paid, and counts it with the paid ones', () => {
		expect(markOf({ optional: true, paid: true })).toBe('/');
		const l = paycheckList(
			[],
			[{ name: 'A', amount: pesos(10), date: calDate(2026, 11, 1), optional: true, paid: true }]
		);
		expect([l.withoutOptional, l.currentWeek, l.all]).toEqual([pesos(10), 0, pesos(10)]);
	});

	it('lists two pays on one payday as two lines above the rule', () => {
		const l = listLines(
			paycheckList(
				[
					{ name: 'Salary', amount: pesos(30000) },
					{ name: 'Side job', amount: pesos(2000) }
				],
				[]
			)
		);
		expect(l.slice(0, 4)).toEqual([
			'30000\tSalary',
			'2000\tSide job',
			'---------------------',
			'---------------------'
		]);
	});
});

describe('listAmount writes amounts the way the owner does', () => {
	it.each([
		[0, '0'],
		[5_000_000, '50000'],
		[123_450, '1234.50'],
		[5, '0.05'],
		[-1_250, '-12.50']
	])('%i minor units is "%s"', (n, text) => {
		expect(listAmount(minor(n))).toBe(text);
	});
});
