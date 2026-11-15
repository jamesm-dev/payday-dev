---
title: Found In Search
created: 2026-11-15
updated: 2026-11-15
tags: [idea, many-people]
status: committed
theme: Many People And Any Device
horizon: now
impact: 3
effort: 2
confidence: 4
epic: [Public Home Page, Product Landing Page]
---

# Found In Search

## Pitch

The site's public pages pass a search-engine audit at 100: a public home page that says what Payday
is in simple words, and sign-in and sign-up pages search engines may list. Every page behind sign-in
stays out of search.

The owner's words, 2026-11-15: "the app should pass the SEO testing 100% if possible".

## Why it might work

- The public surface is small: a home page for signed-out visitors, sign-in, sign-up. Lighthouse's
  SEO audit checks things a small page can meet in full: a title, a meta description, a 200 status,
  a valid `robots.txt`, crawlable links, a canonical address, readable text and tap targets.
- Private pages already answer a signed-out visitor with a redirect or a 401, so a crawler never
  sees a budget.

## Why it might not

- Today it would fail on purpose. `/signin` carries `noindex` and no meta description, and `/`
  redirects a signed-out visitor to it, because the site is one person's private budget and
  registration closes after the first owner.
- Being found only helps once other people can sign up: until [[Many People On One Site]], search
  would bring strangers to a site they cannot use.

> [!warning] Riskiest assumption
> That "SEO testing" means Lighthouse's SEO category, checked on the public pages only. A crawler
> tool that also scores the private pages can never reach 100, because they must stay hidden.

The owner then said, the same day: "yes, create a homepage for the app with contents simple enough
for the users to be attracted to use it". So the home page comes first, with a "Sign in" button and
an honest note that accounts for new people are not open yet; the sign-up button waits for
[[Many People On One Site]].

## What would raise confidence

- [ ] A Lighthouse SEO run on the live sign-in page, to list exactly what fails today.

## Related

- Theme: [[Many People And Any Device]]
- Needs: [[Many People On One Site]]
- Session: [[2026-11-15 Brainstorm - Pay Rhythm And Early Bills]]
