/**
 * The three VAPID settings, checked together. Reminders are on only when all three are set and the
 * subject is a mailto: or https: address; otherwise `reason` says, in plain words, what is missing.
 * Pure: the env module passes the raw values in.
 */
export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

export type VapidResult =
	{ configured: true; config: VapidConfig } | { configured: false; reason: string };

export function vapidConfig(raw: {
	publicKey: string | undefined;
	privateKey: string | undefined;
	subject: string | undefined;
}): VapidResult {
	const missing: string[] = [];
	if (!raw.publicKey) missing.push('VAPID_PUBLIC_KEY');
	if (!raw.privateKey) missing.push('VAPID_PRIVATE_KEY');
	if (!raw.subject) missing.push('VAPID_SUBJECT');
	if (missing.length > 0) {
		return {
			configured: false,
			reason: `Reminders are not set up on this server yet. It is missing ${missing.join(', ')}.`
		};
	}
	if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/.test(raw.subject!)) {
		return {
			configured: false,
			reason:
				'Reminders are not set up on this server yet. VAPID_SUBJECT must start with mailto: or https://.'
		};
	}
	return {
		configured: true,
		config: { publicKey: raw.publicKey!, privateKey: raw.privateKey!, subject: raw.subject! }
	};
}
