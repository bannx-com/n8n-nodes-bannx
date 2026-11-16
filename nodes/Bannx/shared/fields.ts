import type { FieldType, IDataObject, ResourceMapperField } from 'n8n-workflow';

/** A template field as `GET /api/v1/integrations/templates/:id/fields` returns it. */
export interface BannxField {
	key: string;
	label: string;
	type: string;
	required: boolean;
	default?: string;
	helpText?: string;
	choices?: Array<{ value: string; label: string }>;
}

const MAPPER_TYPE: Record<string, FieldType> = {
	string: 'string',
	text: 'string',
	image: 'string',
	color: 'string',
	number: 'number',
	integer: 'number',
	boolean: 'boolean',
	list: 'array',
	object: 'object',
};

/** bannx template fields → n8n resource-mapper fields, in the template's order. */
export function toResourceMapperFields(fields: BannxField[]): ResourceMapperField[] {
	return (fields ?? []).map((f) => {
		const hasChoices = Array.isArray(f.choices) && f.choices.length > 0;
		return {
			id: f.key,
			displayName: f.label || f.key,
			required: !!f.required,
			defaultMatch: false,
			display: true,
			canBeUsedToMatch: false,
			type: hasChoices ? 'options' : (MAPPER_TYPE[f.type] ?? 'string'),
			...(hasChoices ? { options: f.choices!.map((c) => ({ name: c.label, value: c.value })) } : {}),
		};
	});
}

const isBlank = (v: unknown) => v === undefined || v === null || v === '';

/** The render request: empty variables keep the template's own value. */
export function renderBody(format: string, variables: IDataObject, options: IDataObject): IDataObject {
	const vars: IDataObject = {};
	for (const [k, v] of Object.entries(variables ?? {})) if (!isBlank(v)) vars[k] = v;
	const body: IDataObject = { format, variables: vars };
	if (!isBlank(options.size)) body.size = options.size;
	if (!isBlank(options.brand)) body.brand = options.brand;
	if (!isBlank(options.variation)) body.variation = options.variation;
	if (options.draft === true) body.draft = true;
	if (typeof options.scale === 'number' && options.scale !== 1) body.scale = options.scale;
	return body;
}
