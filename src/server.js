import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

const blockedPaths = new Set([
  '/api/v1/password/email',
  '/api/v1/password/reset',
  '/api/v1/editPassword',
  '/api/v1/firstAcess'
]);

function success(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function failure(error) {
  const payload = typeof error?.toJSON === 'function'
    ? error.toJSON()
    : { name: error?.name || 'Error', message: error?.message || 'Request failed' };
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function visibleOperation(operation) {
  return !blockedPaths.has(operation.path);
}

function compactOperation(operation) {
  return {
    id: operation.id,
    method: operation.method,
    path: operation.path,
    pathParameters: operation.pathParameters,
    access: operation.access,
    sourceCallCount: operation.sourceCallCount,
    observedInChrome: operation.observedInChrome,
    available: visibleOperation(operation)
  };
}

export function buildMcpServer({ client, operations, frontendVersion }) {
  const server = new McpServer({ name: 'fenix-mcp', version: '1.0.0' });
  const byId = new Map(operations.map((operation) => [operation.id, operation]));

  server.registerTool(
    'fenix_list_endpoints',
    {
      description: 'Lista operações encontradas no frontend Fênix. O catálogo indica evidência no navegador e usa uma classificação heurística de leitura/escrita.',
      inputSchema: z.object({
        search: z.string().max(120).optional(),
        method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
        access: z.enum(['read-only', 'mutating-or-unclear']).optional(),
        observed_in_chrome: z.boolean().optional(),
        include_unavailable: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).max(1000).default(0)
      })
    },
    async ({ search, method, access, observed_in_chrome, include_unavailable, limit, offset }) => {
      const normalized = (search || '').toLowerCase();
      const filtered = operations.filter((operation) =>
        (include_unavailable || visibleOperation(operation)) &&
        (!method || operation.method === method) &&
        (!access || operation.access === access) &&
        (observed_in_chrome === undefined || operation.observedInChrome === observed_in_chrome) &&
        (!normalized || `${operation.id} ${operation.method} ${operation.path}`.toLowerCase().includes(normalized))
      );
      return success({
        frontendVersion,
        count: filtered.length,
        offset,
        limit,
        endpoints: filtered.slice(offset, offset + limit).map(compactOperation)
      });
    }
  );

  server.registerTool(
    'fenix_api_call',
    {
      description: 'Chama uma operação do catálogo do frontend Fênix. Não aceita host ou caminho arbitrário. POST, PUT, PATCH e DELETE exigem confirm_mutation=true; chamadas multipart e anexos não são suportados.',
      inputSchema: z.object({
        operation_id: z.string().min(1).max(160),
        path_parameters: z.record(z.string(), z.string()).optional(),
        query: z.record(z.string(), z.unknown()).optional(),
        body: z.unknown().optional(),
        confirm_mutation: z.boolean().optional()
      })
    },
    async ({ operation_id, path_parameters, query, body, confirm_mutation }) => {
      const operation = byId.get(operation_id);
      if (!operation) return failure(new Error('Unknown operation_id. Use fenix_list_endpoints to inspect the catalog.'));
      if (!visibleOperation(operation)) return failure(new Error('This authentication or password-management operation is unavailable through the MCP tool.'));
      if (operation.method !== 'GET' && confirm_mutation !== true) {
        return failure(new Error('Set confirm_mutation=true to explicitly authorize this POST, PUT, PATCH, or DELETE call.'));
      }
      try {
        const result = await client.request({ operation, pathParameters: path_parameters, query, body });
        return success(result);
      } catch (error) {
        return failure(error);
      }
    }
  );

  return server;
}
