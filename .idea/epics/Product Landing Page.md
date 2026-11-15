---
title: Product Landing Page
created: 2026-11-15
updated: 2026-11-15
tags: [epic, many-people]
status: planned
theme: Many People And Any Device
phase: 10
sources: [Found In Search, Many People On One Site]
---

# Product Landing Page

## Outcome

A visitor who is not signed in finds a product page that describes Payday accurately, shows the
real app, makes them want to try it, and starts their account with one tap. Its SEO is perfect on
the live site. It replaces the plain page from [[Public Home Page]] at the same address.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [ ] The page says accurately what Payday is and is not: a free budget app that says what is safe to spend until payday, keeps money for every bill, and shows when loans end; not a loan, not a bank, no ads, data not sold — every claim checked against the app in a test (3 pts) ^tsk-d22bce
- [ ] The first screen has the name, a one-line promise and "Continue with Google" (with "Sign in" for existing accounts); then the benefits, how it works in three steps, the app's screens, a short FAQ ("Is this a loan?", "Is it free?", "Who sees my money?"), and the button again at the end (5 pts) ^tsk-c7fcd1
- [ ] The screens are taken from the real app with a made-up household by a script, sized for phones, with alt text and fixed sizes so nothing shifts while loading, and kept true as the app changes (3 pts) ^tsk-161509
- [ ] Lighthouse on the live site, mobile: SEO 100 and accessibility at least 95; a title, description, canonical address, an Open Graph image, structured data describing a free finance web app, and the sitemap listing the public pages (3 pts) ^tsk-464e30
- [ ] On a phone on 4G the first screen shows within 2 seconds, and the page's own JavaScript stays small enough that the signed-in home screen stays inside its 60 KB budget (2 pts) ^tsk-121277
- [ ] When sign-up is full, the page says so in plain words and offers "Sign in" only (1 pt) ^tsk-82cdc6
- [ ] The page is interactive, animated with anime.js (the owner's choice): a "try it" example where the visitor moves sliders for pay and bills and watches an example number change, labelled as an example and never a real budget, plus gentle motion on the app's screens and each section as it comes into view. It reads in full without JavaScript, does not move at all for people who ask for reduced motion, and anime.js loads only for the signed-out page, so the signed-in home screen stays within its 60 KB (5 pts) ^tsk-619b8d

## Approach

The landing lives in the `/` route for signed-out visitors, as now ([[Public Home Page]]), so the
guard's read-only rule for `/` is unchanged. The name stays "Payday" for now, and the page says in
its first lines that it is a budget app, not a lender, because "payday" in search means payday
loans. English only for now. Screens are made with Playwright from the seed household. Motion
uses anime.js, imported only when the signed-out page runs in the browser, and the "try it"
example uses the same pay-and-bills arithmetic the app does, in miniature, with whole minor units
([[ADR-0025 Anime.js For The Landing Page]]).

## Dependencies

- Blocked by: [[Sign In With Google]] (its main button), [[Your Account And Your Data]] (the privacy
  notice it links)
- Builds on: [[Public Home Page]]

> [!warning] Risks
> - "Payday" read as a payday lender. Early warning: visitors leaving at once, or questions about
>   loans; a new name is an open question.
> - Screens drifting from the real app. Early warning: the screenshot script failing or showing old
>   wording.
> - Motion that slows the page or hides text from search. Early warning: Lighthouse below 100 on
>   SEO, or the first screen slower than 2 seconds on 4G with the animation library loaded.

## Related

- Theme: [[Many People And Any Device]]
- From: [[Found In Search]], [[Many People On One Site]]
- Phase: [[ROADMAP]]
