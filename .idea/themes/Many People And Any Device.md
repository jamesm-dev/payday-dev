---
title: Many People And Any Device
created: 2026-11-15
updated: 2026-11-15
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
| [[Many People On One Site]] | next | 5 / 5 / 2 | exploring |
| [[Offline Use With Sync]] | next | 4 / 5 / 2 | exploring |
| [[Found In Search]] | now | 3 / 2 / 4 | committed |

The first two reverse a founding choice in [[SPECS]], one person online, so both go to `/shape`
rather than straight to an epic. They are separable: offline use helps one owner too, and many
people can share a site that works online only. [[Found In Search]] needs neither for its first
part, a public home page, so the owner asked for it at once.

## Committed epics

| Epic | Phase |
|---|---|
| [[Public Home Page]] | 8 |

## Open questions

> [!question]
> - Who are the other people, and how many: family, or anyone who finds the site?
> - How does someone get an account, and get back in after forgetting the password, without email?
> - What must work offline: reading the number, adding an expense, or everything?
> - Does it stay free? Netlify's 300 monthly credits and Supabase's free project were sized for one.

## Related themes

- [[Paycheck And Bills Out Of Sync]] — every person brings their own pay rhythm
  ([[Pay Rhythm Setting]]).
- [[Tracking Without Willpower]] — offline logging is what keeps a quick add quick.
