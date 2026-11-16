import { randomBytes } from 'node:crypto';
import type {
	IDataObject,
	IHookFunctions,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { bannxApiRequest, isNotFound } from '../Bannx/shared/transport';
import { deliveryToRender, verifySignature } from './delivery';

export class BannxTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Bannx Trigger',
		name: 'bannxTrigger',
		icon: { light: 'file:../../icons/bannx.svg', dark: 'file:../../icons/bannx.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Starts the workflow when a Bannx template finishes rendering',
		defaults: { name: 'Bannx Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'bannxApi', required: true }],
		webhooks: [{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' }],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				options: [
					{
						name: 'Render Completed',
						value: 'render.completed',
						description: 'A template finished rendering, from the editor, the API or another workflow',
					},
				],
				default: 'render.completed',
				required: true,
			},
			{
				displayName: 'Template',
				name: 'templateId',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: { searchListMethod: 'searchTemplates', searchable: true },
					},
					{ displayName: 'By ID', name: 'id', type: 'string' },
				],
				description: 'Only renders of this template. Leave empty for every render in the space.',
			},
		],
	};

	methods = {
		listSearch: {
			async searchTemplates(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
				const res = await bannxApiRequest.call(this, 'GET', '/templates', undefined, {
					perPage: 100,
					...(filter ? { search: filter } : {}),
				});
				return {
					results: ((res.list as IDataObject[]) ?? []).map((t) => ({ name: String(t.name), value: String(t.id) })),
				};
			},
		},
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const state = this.getWorkflowStaticData('node');
				if (!state.webhookId) return false;
				try {
					await bannxApiRequest.call(this, 'GET', `/hooks/${encodeURIComponent(String(state.webhookId))}`);
					return true;
				} catch (error) {
					if (!isNotFound(error) && !isNotFound((error as { cause?: unknown }).cause)) {
						throw new NodeOperationError(this.getNode(), error as Error);
					}
					delete state.webhookId;
					delete state.webhookSecret;
					return false;
				}
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const state = this.getWorkflowStaticData('node');
				const templateId = this.getNodeParameter('templateId', '', { extractValue: true }) as string;
				// bannx signs every delivery with this; webhook() rejects anything unsigned
				const secret = randomBytes(24).toString('hex');
				const res = await bannxApiRequest.call(this, 'POST', '/hooks', {
					targetUrl: this.getNodeWebhookUrl('default') as string,
					event: this.getNodeParameter('event') as string,
					platform: 'n8n',
					secret,
					...(templateId ? { templateId } : {}),
				});
				state.webhookId = res.id;
				state.webhookSecret = secret;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const state = this.getWorkflowStaticData('node');
				if (state.webhookId) {
					try {
						await bannxApiRequest.call(this, 'DELETE', `/hooks/${encodeURIComponent(String(state.webhookId))}`);
					} catch (error) {
						if (!isNotFound(error) && !isNotFound((error as { cause?: unknown }).cause)) return false;
					}
				}
				delete state.webhookId;
				delete state.webhookSecret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const state = this.getWorkflowStaticData('node');
		const req = this.getRequestObject() as unknown as { rawBody?: Buffer };
		const body = this.getBodyData() as IDataObject;
		const secret = state.webhookSecret as string | undefined;

		// Fail closed: create() always stores a secret, so a delivery without
		// one to check against is never trusted. Re-activating the workflow
		// subscribes again with a fresh secret.
		const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(body);
		const header = this.getHeaderData()['x-webhook-signature'] as string | undefined;
		if (!secret || !verifySignature(secret, raw, header)) {
			const res = this.getResponseObject();
			res.status(401).send('Invalid signature');
			return { noWebhookResponse: true };
		}

		const event = this.getNodeParameter('event') as string;
		const templateId = this.getNodeParameter('templateId', '', { extractValue: true }) as string;
		const data = (body.data ?? {}) as IDataObject;
		if ((body.event && body.event !== event) || (templateId && data.templateId !== templateId)) {
			return { webhookResponse: 'ignored' };
		}
		return { workflowData: [this.helpers.returnJsonArray([deliveryToRender(body)])] };
	}
}
