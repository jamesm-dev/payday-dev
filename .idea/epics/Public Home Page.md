---
title: Public Home Page
created: 2026-11-15
updated: 2026-11-15
tags: [epic, many-people]
status: done
theme: Many People And Any Device
phase: 8
sources: [Found In Search]
---

# Public Home Page

## Outcome

Someone who is not signed in and opens the site sees a short public home page that says what
Payday does, in simple words that older people who are not native English speakers read on the
first try, and want to try. The public pages score 100 in Lighthouse's SEO audit. A signed-in
owner still opens straight on their number.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [x] A signed-out visitor at `/` gets the public home page with a 200 status, not a redirect to sign in; a signed-in owner at `/` still gets the number, and every private page still refuses a signed-out visitor — a security review approves the guard change — verified by guard.test.ts (98, including a sweep of every route and a check that no endpoint answers `/`), page.server.test.ts, headers.test.ts, auth.e2e.ts, landing.e2e.ts and netlify-function.smoke.ts 9/9; security review approved in its second round, 2026-11-15 (3 pts) ^tsk-04a739
- [x] The page says in short sentences and common words what Payday does (what is safe to spend until payday, bills not missed, when loans end), how it works in three steps, that it is free, and that the budget stays private; the main button is "Sign in" — verified by landing.e2e.ts at iPhone, Android and laptop sizes, each claim checked against the app (no ads or tracking, installable from its manifest), 2026-11-15 (3 pts) ^tsk-5dab69
- [x] Until [[Many People On One Site]], the page says plainly that accounts for new people are not open yet, and never offers a sign-up that does not exist — verified by landing.e2e.ts (the note shown; no sign-up wording, link or button), 2026-11-15 (1 pt) ^tsk-499c09
- [x] The public pages carry a title, a meta description, a canonical address, `lang`, and Open Graph tags; `robots.txt` lists a sitemap of the public pages; `/signin` may be indexed; private pages are never in the sitemap — verified by sitemap.test.ts, landing.e2e.ts and netlify-function.smoke.ts; the sitemap is prerendered, so it never passes the session hook, 2026-11-15 (2 pts) ^tsk-d572c8
- [x] Lighthouse's SEO audit scores 100 on `/` and `/signin` on the deployed site, in its mobile setting, and accessibility scores at least 95 — verified by Lighthouse 13.6.0, mobile, on payday-birc.netlify.app after deploy 6af97c2c (31d16ca): SEO 100 and accessibility 100 on both pages, 2026-11-15 (2 pts) ^tsk-498d8c
- [x] The page reads without JavaScript, uses only `tokens.css`, keeps the signed-in home screen inside its 60 KB JavaScript budget, and Playwright tests show it at iPhone, Android and laptop sizes — verified by landing.e2e.ts (JavaScript off, no sideways scroll at 375px) and budget.e2e.ts: 54.1 KB of 60 on Android, 2026-11-15 (2 pts) ^tsk-2c985a

> [!note] Amended 2026-11-15
> This criterion first read "adds nothing to the signed-in home screen's JavaScript budget". The page
> lives at `/`, in the same route as the home screen, so its markup is compiled into that route's
> script: it adds 1.0 KB (53.1 to 54.1 KB of 60). Keeping it out would need a separate route behind a
> redirect, which costs the 200 at `/` that the first criterion asks for. The budget is what matters,
> and it holds; amended by `/setup` after the security review named the gap.

## Approach

A public route outside the sign-in guard renders the page for a signed-out visitor at `/`; the
signed-in path is unchanged. It is static text, so it can be prerendered or served with a long
cache. The wording follows the plain-language rewrite done on 2026-11-15 for the check-in, now
called the payday update on screen.

## Dependencies

- Builds on: [[Deploy On Netlify]] (it needs the live address for the canonical and the audit)
- Needs, for its sign-up button: [[Many People On One Site]]

> [!warning] Risks
> - The guard in `hooks.server.ts` and `routes/signin/` are caution paths: one owner's financial
>   data sits behind them. Early warning: any private route answering a signed-out visitor with
>   200. A test sweeps every route.
> - Inviting people who cannot sign up yet. Early warning: sign-in attempts with no account; the
>   page's honest note is the guard.

## Related

- Theme: [[Many People And Any Device]]
- From: [[Found In Search]]
- Phase: [[ROADMAP]]
