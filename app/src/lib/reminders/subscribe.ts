/**
 * The VAPID public key arrives as base64url text; `PushManager.subscribe` wants its bytes.
 */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
	const padded = base64url
		.replace(/-/g, '+')
		.replace(/_/g, '/')
		.padEnd(Math.ceil(base64url.length / 4) * 4, '=');
	const raw = atob(padded);
	const bytes = new Uint8Array(new ArrayBuffer(raw.length));
	for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
	return bytes;
}
