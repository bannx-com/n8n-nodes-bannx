import { describe, expect, it, vi } from 'vitest';
import { BannxApi } from '../credentials/BannxApi.credentials';
import { Bannx } from '../nodes/Bannx/Bannx.node';
import { BannxTrigger } from '../nodes/BannxTrigger/BannxTrigger.node';
import { makeContext } from './context';

const run = (node: Bannx, ctx: ReturnType<typeof makeContext>) => node.execute.call(ctx as never);

describe('BannxApi credentials', () => {
	it('sends the key as a bearer token and tests against /me', () => {
		const c = new BannxApi();
		expect(c.authenticate.properties.headers).toEqual({ Authorization: '=Bearer {{$credentials.apiKey}}' });
		expect(c.test.request.url).toBe('/api/v1/integrations/me');
		expect(c.properties.find((p) => p.name === 'apiKey')?.typeOptions?.password).toBe(true);
	});
});

describe('Bannx node', () => {
	it('is usable as an AI tool', () => {
		expect(new Bannx().description.usableAsTool).toBe(true);
	});

	it('renders a template with mapped variables', async () => {
		const ctx = makeContext({
			resource: 'template',
			operation: 'render',
			templateId: { mode: 'list', value: 't1' },
			format: 'png',
			variables: { mappingMode: 'defineBelow', value: { headline: 'Sale', price: 9 } },
			additionalFields: { size: 'story' },
		});
		ctx.http.mockResolvedValue({ ok: true, templateId: 't1', format: 'png', url: 'https://cdn/x.png' });
		const out = await run(new Bannx(), ctx);
		const [cred, req] = ctx.http.mock.calls[0]!;
		expect(cred).toBe('bannxApi');
		expect(req).toMatchObject({
			method: 'POST',
			url: 'https://bannx.test/api/v1/integrations/templates/t1/render',
			body: { format: 'png', variables: { headline: 'Sale', price: 9 }, size: 'story' },
			json: true,
		});
		expect(out[0]![0]!.json).toMatchObject({ url: 'https://cdn/x.png' });
		expect(out[0]![0]!.pairedItem).toEqual({ item: 0 });
	});

	it('lists templates with paging and search', async () => {
		const ctx = makeContext({ resource: 'template', operation: 'getAll', returnAll: false, limit: 2, filters: { search: 'sale' } });
		ctx.http.mockResolvedValue({ list: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], pagesCount: 1 });
		const out = await run(new Bannx(), ctx);
		expect(ctx.http.mock.calls[0]![1]).toMatchObject({ method: 'GET', qs: { search: 'sale', page: 1, perPage: 2 } });
		expect(out[0]!.map((i) => i.json.id)).toEqual(['a', 'b']);
	});

	it('pages through every template when Return All is on', async () => {
		const ctx = makeContext({ resource: 'template', operation: 'getAll', returnAll: true, filters: {} });
		ctx.http
			.mockResolvedValueOnce({ list: [{ id: 'a' }], pagesCount: 2 })
			.mockResolvedValueOnce({ list: [{ id: 'b' }], pagesCount: 2 });
		const out = await run(new Bannx(), ctx);
		expect(ctx.http).toHaveBeenCalledTimes(2);
		expect(out[0]!.map((i) => i.json.id)).toEqual(['a', 'b']);
	});

	it('reads recent renders', async () => {
		const ctx = makeContext({ resource: 'render', operation: 'getRecent', limit: 3, templateId: '' });
		ctx.http.mockResolvedValue({ list: [{ id: 'r1', url: 'u' }] });
		const out = await run(new Bannx(), ctx);
		expect(ctx.http.mock.calls[0]![1]).toMatchObject({ url: 'https://bannx.test/api/v1/integrations/renders', qs: { limit: 3 } });
		expect(out[0]![0]!.json).toEqual({ id: 'r1', url: 'u' });
	});

	it('wraps API errors in a NodeApiError with the bannx message', async () => {
		const ctx = makeContext({ resource: 'render', operation: 'getRecent', limit: 3 });
		ctx.http.mockRejectedValue(Object.assign(new Error('Request failed with status code 403'), {
			httpCode: '403',
			response: { status: 403, data: { message: 'This API key is missing the `template.read` scope.' } },
		}));
		await expect(run(new Bannx(), ctx)).rejects.toThrow();
	});
});

describe('BannxTrigger webhook lifecycle', () => {
	const trigger = new BannxTrigger();
	const hooks = trigger.webhookMethods.default;

	it('subscribes with a fresh signing secret and stores the id', async () => {
		const ctx = makeContext({ event: 'render.completed', templateId: { mode: 'list', value: 't1' } });
		ctx.http.mockResolvedValue({ id: 'h1', event: 'render.completed' });
		expect(await hooks.create.call(ctx as never)).toBe(true);
		const req = ctx.http.mock.calls[0]![1];
		expect(req).toMatchObject({ method: 'POST', url: 'https://bannx.test/api/v1/integrations/hooks' });
		expect(req.body).toMatchObject({
			targetUrl: 'https://n8n.example.com/webhook/abc',
			event: 'render.completed',
			platform: 'n8n',
			templateId: 't1',
		});
		expect(req.body.secret).toMatch(/^[a-f0-9]{48}$/);
		expect(ctx.staticData).toMatchObject({ webhookId: 'h1', webhookSecret: req.body.secret });
	});

	it('reports a stored subscription bannx still has', async () => {
		const ctx = makeContext({}, { staticData: { webhookId: 'h1' } });
		ctx.http.mockResolvedValue({ id: 'h1' });
		expect(await hooks.checkExists.call(ctx as never)).toBe(true);
		expect(ctx.http.mock.calls[0]![1]).toMatchObject({ method: 'GET', url: 'https://bannx.test/api/v1/integrations/hooks/h1' });
	});

	it('forgets a subscription bannx no longer has', async () => {
		const ctx = makeContext({}, { staticData: { webhookId: 'h1', webhookSecret: 's' } });
		ctx.http.mockRejectedValue(Object.assign(new Error('404'), { httpCode: '404' }));
		expect(await hooks.checkExists.call(ctx as never)).toBe(false);
		expect(ctx.staticData).toEqual({});
	});

	it('has nothing to check before the first subscribe', async () => {
		const ctx = makeContext({});
		expect(await hooks.checkExists.call(ctx as never)).toBe(false);
		expect(ctx.http).not.toHaveBeenCalled();
	});

	it('unsubscribes and clears its state, also when bannx already removed it', async () => {
		const ctx = makeContext({}, { staticData: { webhookId: 'h1', webhookSecret: 's' } });
		ctx.http.mockRejectedValue(Object.assign(new Error('404'), { httpCode: '404' }));
		expect(await hooks.delete.call(ctx as never)).toBe(true);
		expect(ctx.http.mock.calls[0]![1]).toMatchObject({ method: 'DELETE', url: 'https://bannx.test/api/v1/integrations/hooks/h1' });
		expect(ctx.staticData).toEqual({});
	});
});

describe('BannxTrigger deliveries', async () => {
	const { createHmac } = await import('node:crypto');
	const secret = 'a'.repeat(48);
	const body = { id: 'd1', event: 'render.completed', timestamp: 't', spaceId: 's', data: { templateId: 't1', format: 'png', url: 'u' } };
	const raw = JSON.stringify(body);
	const sign = (s: string) => `sha256=${createHmac('sha256', s).update(raw).digest('hex')}`;

	const hookCtx = (headers: Record<string, string>, templateId = '') => {
		const status = vi.fn(() => ({ send: vi.fn() }));
		const ctx = makeContext({ event: 'render.completed', templateId: { mode: 'list', value: templateId } }, { staticData: { webhookId: 'h1', webhookSecret: secret } });
		return Object.assign(ctx, {
			status,
			getRequestObject: () => ({ rawBody: Buffer.from(raw) }),
			getBodyData: () => body,
			getHeaderData: () => headers,
			getResponseObject: () => ({ status }),
		});
	};

	it('starts the workflow on a correctly signed delivery', async () => {
		const res = await new BannxTrigger().webhook.call(hookCtx({ 'x-webhook-signature': sign(secret) }) as never);
		expect(res.workflowData?.[0]?.[0]?.json).toMatchObject({ id: 'd1', templateId: 't1', url: 'u' });
	});

	it('answers 401 to a forged or unsigned delivery', async () => {
		for (const headers of [{ 'x-webhook-signature': sign('wrong-secret') }, {}]) {
			const ctx = hookCtx(headers);
			const res = await new BannxTrigger().webhook.call(ctx as never);
			expect(res).toEqual({ noWebhookResponse: true });
			expect(ctx.status).toHaveBeenCalledWith(401);
		}
	});

	it('ignores renders of other templates', async () => {
		const res = await new BannxTrigger().webhook.call(hookCtx({ 'x-webhook-signature': sign(secret) }, 't2') as never);
		expect(res.workflowData).toBeUndefined();
	});
});
