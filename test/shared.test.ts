import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { renderBody, toResourceMapperFields } from '../nodes/Bannx/shared/fields';
import { deliveryToRender, verifySignature } from '../nodes/BannxTrigger/delivery';

describe('toResourceMapperFields', () => {
	it('maps bannx template fields to n8n mapper fields', () => {
		const out = toResourceMapperFields([
			{ key: 'headline', label: 'Headline', type: 'string', required: true },
			{ key: 'price', label: 'price', type: 'number', required: false },
			{ key: 'qty', label: 'qty', type: 'integer', required: false },
			{ key: 'onSale', label: 'onSale', type: 'boolean', required: false },
			{ key: 'photo', label: 'photo', type: 'image', required: false },
			{ key: 'items', label: 'items', type: 'list', required: false },
			{ key: 'to', label: 'to', type: 'object', required: false },
			{ key: 'size', label: 'size', type: 'string', required: false, choices: [{ value: 'S', label: 'Small' }] },
		]);
		expect(out.map((f) => [f.id, f.type])).toEqual([
			['headline', 'string'],
			['price', 'number'],
			['qty', 'number'],
			['onSale', 'boolean'],
			['photo', 'string'],
			['items', 'array'],
			['to', 'object'],
			['size', 'options'],
		]);
		expect(out[0]).toMatchObject({ displayName: 'Headline', required: true, defaultMatch: false, display: true });
		expect(out[7]!.options).toEqual([{ name: 'Small', value: 'S' }]);
	});
});

describe('renderBody', () => {
	it('drops empty variables and blank options', () => {
		expect(
			renderBody('png', { headline: 'Hi', empty: '', none: null }, { size: 'story', brand: '', draft: false, scale: 2 }),
		).toEqual({ format: 'png', variables: { headline: 'Hi' }, size: 'story', scale: 2 });
	});

	it('sends draft and variation only when set', () => {
		expect(renderBody('mp4', {}, { draft: true, variation: 'v1' })).toEqual({
			format: 'mp4',
			variables: {},
			draft: true,
			variation: 'v1',
		});
	});
});

describe('verifySignature', () => {
	const body = '{"id":"d1","event":"render.completed"}';
	const sig = `sha256=${createHmac('sha256', 'secret-1234567890').update(body).digest('hex')}`;

	it('accepts the HMAC bannx sends', () => {
		expect(verifySignature('secret-1234567890', body, sig)).toBe(true);
	});

	it('rejects a wrong, missing or malformed signature', () => {
		expect(verifySignature('other-secret-123456', body, sig)).toBe(false);
		expect(verifySignature('secret-1234567890', body, undefined)).toBe(false);
		expect(verifySignature('secret-1234567890', body, 'sha256=zz')).toBe(false);
	});
});

describe('deliveryToRender', () => {
	it('flattens a render.completed delivery', () => {
		expect(
			deliveryToRender({
				id: 'd1',
				event: 'render.completed',
				timestamp: 't',
				spaceId: 's',
				data: { templateId: 't1', format: 'png', url: 'u', creditsCharged: 1 },
			}),
		).toEqual({ id: 'd1', event: 'render.completed', templateId: 't1', format: 'png', url: 'u', timestamp: 't' });
	});
});
