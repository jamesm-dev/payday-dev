---
title: ADR-0010 Password Sign-In With Optional Passkeys
created: 2026-11-01
updated: 2026-11-01
tags: [adr, decision]
status: accepted
decision: a password is the way in; passkeys are an optional extra; recovery codes stay
supersedes: ADR-0006 Passkeys For A Single Owner
superseded_by:
---

# ADR-0010 Password Sign-In With Optional Passkeys

Supersedes [[ADR-0006 Passkeys For A Single Owner]].

## Context

[[ADR-0006 Passkeys For A Single Owner]] made passkeys the only way in. After using it, the owner
chose to change that: they found the word "passkey" confusing, and wanted a plain way in that works
on any device without having set that device up first. The decision is theirs, made on 2026-11-01.

The app still holds salary, balances and every loan, still sits on the public internet, and is still
one person's. The phone glance at [[Safe To Spend Number]] still has to stay fast.

## Options

| Option | Pros | Cons |
|---|---|---|
| Password first, passkeys optional | Familiar; works on any device at once; a password manager fills it; the device unlock stays for those who want it | A password can be guessed, reused or phished; two ways in to defend |
| Passkeys only (ADR-0006) | Phishing-resistant; nothing to guess | The word and the setup confused the owner; each new device needs its own setup |
| Password plus a second factor | Stronger than a password alone | Slower on a phone; a second thing to lose, for one user |
| Email magic link | No password to remember | Needs an email provider; slow on a phone |

## Decision

A password is the primary way in. It is hashed with scrypt from Node's `crypto` (N=2^15, r=8, p=3, a
16-byte salt, a 64-byte key), stored as a string that names its own parameters so they can be raised
later, and checked in constant time. It must be 12 to 256 characters and not one repeated character,
a short repeated pattern, or anything containing the setup code. There are no composition rules.

Passkeys stay, relabelled in plain words as "this device's PIN, fingerprint or face" with "passkey"
only in small text. The owner can add or remove them freely, including the last one, because the
password always remains. Recovery codes stay, and a recovery-code sign-in now leads straight to
choosing a new password, which it may do without the old one for 10 minutes: that is the way back
from a forgotten password.

Everything ADR-0006 protected is kept: registration closed after the first owner, and a setup code
for the first registration in production; sessions on the server; a five-minute step-up before
adding or removing a device, changing the password or making new recovery codes (a password or a
passkey sign-in or confirmation counts as one); and per-address limits on wrong tries. Because a
password can be guessed from many addresses at once, a global brake adds a short delay to every
password and recovery attempt as recent failures across all addresses pile up, capped at three
seconds, so guessing is slowed without ever locking the owner out. Changing the password ends every
other session. Proposed and accepted on the owner's instruction, 2026-11-01.

## Consequences

- **Phishing resistance is now optional.** A password typed into a look-alike page can be stolen,
  where a passkey cannot, and adding a passkey does not close the password path while the password
  still works. Making passkeys the only way in again would be a new decision.
- The password is guessable in a way a passkey was not. The defence is the length rule, scrypt's
  cost, the per-address limit, the global brake, and the setup code at the start.
- Memory: each hash needs about 32 MiB. At most two run at once, so it fits the 256 MB machine.
  One hash takes about 0.3 seconds, which is the price of every sign-in.
- A new migration adds `owner.password_hash`. An owner who registered before this change has no
  password; they sign in with a passkey or a recovery code and set one.
- The domain no longer has to be fixed before the owner can sign in, since the password does not
  depend on it. Passkeys, if added, still do.
- Losing the password and every recovery code locks the owner out, as losing every passkey and the
  codes did before. The codes are still the only way back, and registration says so plainly.
- The Playwright suite now proves password sign-in on all three device projects, WebKit included,
  which the passkey tests never could. Passkey sign-in is tested on Chromium only, as before.
