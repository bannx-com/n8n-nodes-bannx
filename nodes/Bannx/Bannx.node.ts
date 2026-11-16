import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
	INodeType,
	INodeTypeDescription,
	ResourceMapperFields,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { renderBody, toResourceMapperFields, type BannxField } from './shared/fields';
import { bannxApiRequest } from './shared/transport';

// a clip can take a few minutes to render; n8n has no 30-second step limit
const RENDER_TIMEOUT_MS = 10 * 60 * 1000;

export class Bannx implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Bannx',
		name: 'bannx',
		icon: { light: 'file:../../icons/bannx.svg', dark: 'file:../../icons/bannx.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Render Bannx design templates to images, PDFs and videos',
		defaults: { name: 'Bannx' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'bannxApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Render', value: 'render' },
					{ name: 'Template', value: 'template' },
				],
				default: 'template',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['template'] } },
				options: [
					{
						name: 'Get Many',
						value: 'getAll',
						action: 'Get many templates',
						description: 'List the templates in your space',
					},
					{
						name: 'Render',
						value: 'render',
						action: 'Render a template',
						description: 'Render a template with your data and get the file URL',
					},
				],
				default: 'render',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['render'] } },
				options: [
					{
						name: 'Get Many',
						value: 'getRecent',
						action: 'Get recent renders',
						description: 'Get the latest finished renders in your space',
					},
				],
				default: 'getRecent',
			},

			// ---- template: render ----
			{
				displayName: 'Template',
				name: 'templateId',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				displayOptions: { show: { resource: ['template'], operation: ['render'] } },
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: { searchListMethod: 'searchTemplates', searchable: true },
					},
					{
						displayName: 'By ID',
						name: 'id',
						type: 'string',
						placeholder: 'e.g. 6ad5445522fce7cf8445d292',
					},
				],
				description: 'The template to render',
			},
			{
				displayName: 'Format',
				name: 'format',
				type: 'options',
				displayOptions: { show: { resource: ['template'], operation: ['render'] } },
				options: [
					{ name: 'Animated GIF', value: 'gif' },
					{ name: 'MP4 Video', value: 'mp4' },
					{ name: 'PDF Document', value: 'pdf' },
					{ name: 'PNG Image', value: 'png' },
					{ name: 'SVG Image', value: 'svg' },
					{ name: 'WebM Video', value: 'webm' },
					{ name: 'WebP Image', value: 'webp' },
				],
				default: 'png',
				description: 'File type to render. Videos and GIFs can take a minute.',
			},
			{
				displayName: 'Variables',
				name: 'variables',
				type: 'resourceMapper',
				noDataExpression: true,
				default: { mappingMode: 'defineBelow', value: null },
				required: true,
				displayOptions: { show: { resource: ['template'], operation: ['render'] } },
				typeOptions: {
					loadOptionsDependsOn: ['templateId.value'],
					resourceMapper: {
						resourceMapperMethod: 'getTemplateVariables',
						mode: 'add',
						fieldWords: { singular: 'variable', plural: 'variables' },
						addAllFields: true,
						multiKeyMatch: false,
						supportAutoMap: true,
					},
				},
				description: "The template's variables. Leave one empty to keep the template's own value.",
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['template'], operation: ['render'] } },
				options: [
					{
						displayName: 'Brand',
						name: 'brand',
						type: 'string',
						default: '',
						description: 'Render with another brand of your space: its name or website URL',
					},
					{
						displayName: 'Scale',
						name: 'scale',
						type: 'number',
						typeOptions: { minValue: 0.25, maxValue: 4, numberPrecision: 2 },
						default: 1,
						description: 'Resolution multiplier, 0.25 to 4',
					},
					{
						displayName: 'Size',
						name: 'size',
						type: 'string',
						default: '',
						placeholder: 'e.g. story or 1080x1350',
						description: 'Render at another size without changing the template: a preset such as og, story or leaderboard, or WIDTHxHEIGHT',
					},
					{
						displayName: 'Use Unpublished Changes',
						name: 'draft',
						type: 'boolean',
						default: false,
						description: 'Whether to render the latest saved design instead of the published version',
					},
					{
						displayName: 'Variation ID',
						name: 'variation',
						type: 'string',
						default: '',
						description: 'A saved variation of the template to apply',
					},
				],
			},

			// ---- template: get many ----
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				displayOptions: { show: { resource: ['template'], operation: ['getAll'] } },
				default: false,
				description: 'Whether to return all results or only up to a given limit',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				displayOptions: { show: { resource: ['template'], operation: ['getAll'], returnAll: [false] } },
				typeOptions: { minValue: 1, maxValue: 100 },
				default: 50,
				description: 'Max number of results to return',
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { resource: ['template'], operation: ['getAll'] } },
				options: [
					{
						displayName: 'Search',
						name: 'search',
						type: 'string',
						default: '',
						description: 'Text the template name or description contains',
					},
				],
			},

			// ---- render: get many ----
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				displayOptions: { show: { resource: ['render'], operation: ['getRecent'] } },
				typeOptions: { minValue: 1, maxValue: 50 },
				default: 50,
				description: 'Max number of results to return',
			},
			{
				displayName: 'Template ID',
				name: 'templateId',
				type: 'string',
				displayOptions: { show: { resource: ['render'], operation: ['getRecent'] } },
				default: '',
				description: 'Only renders of this template. Leave empty for every template.',
			},
		],
	};

	methods = {
		listSearch: {
			async searchTemplates(
				this: ILoadOptionsFunctions,
				filter?: string,
				paginationToken?: string,
			): Promise<INodeListSearchResult> {
				const page = paginationToken ? Number(paginationToken) : 1;
				const res = await bannxApiRequest.call(this, 'GET', '/templates', undefined, {
					page,
					perPage: 50,
					...(filter ? { search: filter } : {}),
				});
				const list = (res.list as IDataObject[]) ?? [];
				return {
					results: list.map((t) => ({
						name: t.width && t.height ? `${t.name} (${t.width}×${t.height})` : String(t.name),
						value: String(t.id),
					})),
					paginationToken: page < Number(res.pagesCount ?? 1) ? String(page + 1) : undefined,
				};
			},
		},
		resourceMapping: {
			async getTemplateVariables(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
				const templateId = this.getNodeParameter('templateId', undefined, { extractValue: true }) as string;
				if (!templateId) return { fields: [] };
				const res = await bannxApiRequest.call(this, 'GET', `/templates/${encodeURIComponent(templateId)}/fields`);
				return { fields: toResourceMapperFields((res.fields as unknown as BannxField[]) ?? []) };
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				let results: IDataObject[] = [];

				if (resource === 'template' && operation === 'render') {
					const templateId = this.getNodeParameter('templateId', i, '', { extractValue: true }) as string;
					const format = this.getNodeParameter('format', i, 'png') as string;
					const mode = this.getNodeParameter('variables.mappingMode', i, 'defineBelow') as string;
					const variables =
						mode === 'autoMapInputData'
							? items[i].json
							: ((this.getNodeParameter('variables.value', i, {}) as IDataObject) ?? {});
					const options = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
					results = [
						await bannxApiRequest.call(
							this,
							'POST',
							`/templates/${encodeURIComponent(templateId)}/render`,
							renderBody(format, variables, options),
							undefined,
							RENDER_TIMEOUT_MS,
						),
					];
				} else if (resource === 'template' && operation === 'getAll') {
					const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
					const limit = returnAll ? 100 : (this.getNodeParameter('limit', i, 50) as number);
					const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
					let page = 1;
					for (;;) {
						const res = await bannxApiRequest.call(this, 'GET', '/templates', undefined, {
							...(filters.search ? { search: filters.search } : {}),
							page,
							perPage: limit,
						});
						results.push(...((res.list as IDataObject[]) ?? []));
						if (!returnAll || page >= Number(res.pagesCount ?? 1)) break;
						page++;
					}
					if (!returnAll) results = results.slice(0, limit);
				} else if (resource === 'render' && operation === 'getRecent') {
					const limit = this.getNodeParameter('limit', i, 50) as number;
					const templateId = this.getNodeParameter('templateId', i, '') as string;
					const res = await bannxApiRequest.call(this, 'GET', '/renders', undefined, {
						limit,
						...(templateId ? { templateId } : {}),
					});
					results = (res.list as IDataObject[]) ?? [];
				}

				out.push(
					...this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(results), {
						itemData: { item: i },
					}),
				);
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, {
					itemIndex: i,
					description: (error as { description?: string }).description,
				});
			}
		}
		return [out];
	}
}
