---
title: Many People And Any Device
created: 2026-11-15
updated: 2026-11-16
tags: [moc, theme]
status: active
---

# Many People And Any Device

## Thesis

Payday was built for one owner, online, on one site. The owner now wants many people, among them
older people who are not native English speakers, to sign in on one site, see the same budget on
every device, and keep using it when the signal drops.

## Ideas

| Idea | Horizon | I / E / C | Status |
|---|---|---|---|
| [[Many People On One Site]] | next | 5 / 5 / 2 | committed |
| [[Offline Use With Sync]] | next | 4 / 5 / 2 | committed |
| [[Found In Search]] | now | 3 / 2 / 4 | committed |

The first two reverse a founding choice in [[SPECS]], one person online, so both go to `/shape`
rather than straight to an epic. They are separable: offline use helps one owner too, and many
people can share a site that works online only. [[Found In Search]] needs neither for its first
part, a public home page, so the owner asked for it at once.

## Committed epics

| Epic | Phase |
|---|---|
| [[Public Home Page]] | 8 |
| [[Every Budget Has Its Owner]] | 9 |
| [[Sign Up With Email And Password]] | 9 |
| [[Sign In With Google]] (cut 2026-11-16) | — |
| [[Your Account And Your Data]] | 9 |
| [[Product Landing Page]] | 10 |
| [[Offline Number And Expenses]] | 11 |
| [[Continue With Google]] | 12 |

## Open questions

> [!question]
> - ~~Who are the other people, and how many?~~ Anyone, up to 100 accounts for now
>   ([[ADR-0022 Open Sign-Up With A Limit]]).
> - ~~How does someone get an account, and get back in, without email?~~ With an email and a
>   password, the email not checked, and recovery codes to get back in
>   ([[ADR-0026 Email And Password Sign-Up For Now]], superseding ADR-0023, 2026-11-16).
> - ~~What must work offline?~~ The last number and plan, and logging expenses
>   ([[ADR-0024 Offline Copy And Queued Expenses]]).
> - ~~Does it stay free?~~ Yes, until it nears the limit; then the owner decides.
> - Still open: a domain, which email checks, email reset and Google sign-in need; and a name that search does not read as a
>   payday loan.

## Related themes

- [[Paycheck And Bills Out Of Sync]] — every person brings their own pay rhythm
  ([[Pay Rhythm Setting]]).
- [[Tracking Without Willpower]] — offline logging is what keeps a quick add quick.
