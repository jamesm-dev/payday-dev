---
title: Your Account And Your Data
created: 2026-11-15
updated: 2026-11-15
tags: [epic, many-people]
status: planned
theme: Many People And Any Device
phase: 9
sources: [Many People On One Site]
---

# Your Account And Your Data

## Outcome

Each person can read, in plain words, what Payday keeps about them and why, download their whole
budget, and delete their account and everything in it. Their passkeys, recovery codes and sessions
are theirs alone.

## Acceptance criteria

Each carries **points** and a permanent task reference id. Points come first because a block
reference must be the last thing on the line. Write `1 pt`, and `N pts` for anything else. Assign the id once and never reassign it.

- [ ] A privacy notice and terms, in plain words, say what is stored, why, for how long, and who to contact, in line with the Philippines' Data Privacy Act of 2012; they are public pages linked from the product page, sign-in and Settings (2 pts) ^tsk-99efff
- [ ] Delete my account: after a confirmation, every row that belongs to the person is removed in one transaction under the owner lock, and they are signed out on every device (3 pts) ^tsk-3ad574
- [ ] Download my data: the full backup works for each person, holding only their budget (1 pt) ^tsk-125906
- [ ] Passkeys, recovery codes and sessions belong to each person; a person who signs in with Google can add their device's PIN, fingerprint or face (3 pts) ^tsk-2ad8f3
- [ ] Settings › Security shows how the person signs in (Google, password, or both) and can sign out every other device (1 pt) ^tsk-5ff868

## Approach

The pages are static and prerendered, like the sitemap. Deletion reuses Start over's transaction and
adds the person's own row and sign-in state. Passkeys today use one fixed user handle; each person
gets their own ([[ADR-0022 Open Sign-Up With A Limit]]).

## Dependencies

- Blocked by: [[Every Budget Has Its Owner]]
- Builds on: [[Backup Download And Restore]], [[Private Single User Access]]

> [!warning] Risks
> - A delete that misses a table leaves a stranger's data behind. Early warning: a test that lists
>   every table and checks none still holds the deleted person's id.

## Related

- Theme: [[Many People And Any Device]]
- From: [[Many People On One Site]]
- Phase: [[ROADMAP]]
