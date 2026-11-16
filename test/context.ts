import { vi } from 'vitest';

type Params = Record<string, unknown>;

/** A minimal n8n function context: parameters, credentials and an HTTP mock. */
export function makeContext(params: Params, opts: { items?: number; staticData?: Params; webhookUrl?: string } = {}) {
	const http = vi.fn();
	const staticData: Params = opts.staticData ?? {};
	const ctx = {
		http,
		staticData,
		getInputData: () => Array.from({ length: opts.items ?? 1 }, () => ({ json: {} })),
		// execute: (name, itemIndex, fallback, options); hooks and webhooks: (name, fallback, options)
		getNodeParameter: (name: string, ...rest: unknown[]) => {
			const [fallback, o] = (typeof rest[0] === 'number' ? rest.slice(1) : rest) as [unknown, { extractValue?: boolean } | undefined];
			const path = name.split('.');
			let v: unknown = params;
			for (const p of path) v = v && typeof v === 'object' ? (v as Params)[p] : undefined;
			if (o?.extractValue && v && typeof v === 'object' && 'value' in (v as Params)) v = (v as Params).value;
			return v === undefined ? fallback : v;
		},
		getCredentials: async () => ({ apiKey: 'k', baseUrl: 'https://bannx.test/' }),
		getNode: () => ({ name: 'bannx', type: 'n8n-nodes-bannx.bannx', typeVersion: 1, parameters: {} }),
		continueOnFail: () => false,
		getWorkflowStaticData: () => staticData,
		getNodeWebhookUrl: () => opts.webhookUrl ?? 'https://n8n.example.com/webhook/abc',
		helpers: {
			httpRequestWithAuthentication: http,
			returnJsonArray: (d: unknown) => (Array.isArray(d) ? d : [d]).map((json) => ({ json })),
			constructExecutionMetaData: (items: unknown[], meta: { itemData: { item: number } }) =>
				(items as Array<Record<string, unknown>>).map((it) => ({ ...it, pairedItem: meta.itemData })),
		},
	};
	return ctx;
}
