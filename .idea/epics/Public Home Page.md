---
title: Public Home Page
created: 2026-11-15
updated: 2026-11-15
tags: [epic, many-people]
status: planned
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

- [ ] A signed-out visitor at `/` gets the public home page with a 200 status, not a redirect to sign in; a signed-in owner at `/` still gets the number, and every private page still refuses a signed-out visitor — a security review approves the guard change (3 pts) ^tsk-04a739
- [ ] The page says in short sentences and common words what Payday does (what is safe to spend until payday, bills not missed, when loans end), how it works in three steps, that it is free, and that the budget stays private; the main button is "Sign in" (3 pts) ^tsk-5dab69
- [ ] Until [[Many People On One Site]], the page says plainly that accounts for new people are not open yet, and never offers a sign-up that does not exist (1 pt) ^tsk-499c09
- [ ] The public pages carry a title, a meta description, a canonical address, `lang`, and Open Graph tags; `robots.txt` lists a sitemap of the public pages; `/signin` may be indexed; private pages are never in the sitemap (2 pts) ^tsk-d572c8
- [ ] Lighthouse's SEO audit scores 100 on `/` and `/signin` on the deployed site, in its mobile setting, and accessibility scores at least 95 (2 pts) ^tsk-498d8c
- [ ] The page reads without JavaScript, uses only `tokens.css`, adds nothing to the signed-in home screen's JavaScript budget, and Playwright tests show it at iPhone, Android and laptop sizes (2 pts) ^tsk-2c985a

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
