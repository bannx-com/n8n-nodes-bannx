import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

type Ctx = IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions;

/**
 * One request to the bannx integration API (`/api/v1/integrations/*`) with the
 * node's bannx credential. Errors become NodeApiError with bannx's own message,
 * which names the missing scope, template or credit problem.
 */
export async function bannxApiRequest(
	this: Ctx,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	qs?: IDataObject,
	timeout?: number,
): Promise<IDataObject> {
	const credentials = await this.getCredentials('bannxApi');
	const base = String(credentials.baseUrl || 'https://bannx.com').replace(/\/+$/, '');
	const options: IHttpRequestOptions = {
		method,
		url: `${base}/api/v1/integrations${path}`,
		json: true,
		...(body ? { body } : {}),
		...(qs ? { qs } : {}),
		...(timeout ? { timeout } : {}),
	};
	try {
		return (await this.helpers.httpRequestWithAuthentication.call(this, 'bannxApi', options)) as IDataObject;
	} catch (error) {
		const data = (error as { response?: { data?: { message?: string } } }).response?.data;
		throw new NodeApiError(this.getNode(), error as JsonObject, {
			...(data?.message ? { message: data.message } : {}),
		});
	}
}

/** True when bannx answered 404, for "does this still exist" checks. */
export function isNotFound(error: unknown): boolean {
	const e = error as { httpCode?: string; response?: { status?: number }; cause?: { response?: { status?: number } } };
	return e?.httpCode === '404' || e?.response?.status === 404 || e?.cause?.response?.status === 404;
}
