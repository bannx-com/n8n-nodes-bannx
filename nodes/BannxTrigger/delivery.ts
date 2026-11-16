import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IDataObject } from 'n8n-workflow';

/**
 * bannx signs each delivery to a subscription made with a secret:
 * `X-Webhook-Signature: sha256=<hex HMAC-SHA256 of the raw body>`.
 */
export function verifySignature(secret: string, rawBody: string, header: string | undefined): boolean {
	if (!header || !header.startsWith('sha256=')) return false;
	const expected = Buffer.from(createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex'), 'hex');
	const given = Buffer.from(header.slice('sha256='.length), 'hex');
	return given.length === expected.length && timingSafeEqual(given, expected);
}

/** `{ id, event, timestamp, data: { templateId, format, url, … } }` → one flat render item. */
export function deliveryToRender(body: IDataObject): IDataObject {
	const data = (body.data ?? {}) as IDataObject;
	return {
		id: body.id ?? null,
		event: body.event ?? null,
		templateId: data.templateId ?? null,
		format: data.format ?? null,
		url: data.url ?? null,
		timestamp: body.timestamp ?? null,
	};
}
