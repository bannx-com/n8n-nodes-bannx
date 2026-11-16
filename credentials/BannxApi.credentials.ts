import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class BannxApi implements ICredentialType {
	name = 'bannxApi';

	displayName = 'Bannx API';

	icon: Icon = { light: 'file:../icons/bannx.svg', dark: 'file:../icons/bannx.dark.svg' };

	documentationUrl = 'https://bannx.com/docs/integrations/n8n';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Create one in bannx under Settings → Space → Developers. Leave its scopes unrestricted, or allow Template Render API, Template Read API and Webhook Subscriptions API.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://bannx.com',
			description: 'Change only for a bannx server other than bannx.com',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}',
			url: '/api/v1/integrations/me',
			method: 'GET',
		},
	};
}
