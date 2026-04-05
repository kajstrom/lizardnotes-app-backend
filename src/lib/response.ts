import type { APIGatewayProxyResultV2 } from 'aws-lambda';

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function ok(body: unknown): APIGatewayProxyResultV2 {
  return json(200, body);
}

export function created(body: unknown): APIGatewayProxyResultV2 {
  return json(201, body);
}

export function noContent(): APIGatewayProxyResultV2 {
  return { statusCode: 204 };
}

export function badRequest(message: string): APIGatewayProxyResultV2 {
  return json(400, { message });
}

export function notFound(message = 'Not found'): APIGatewayProxyResultV2 {
  return json(404, { message });
}

export function notImplemented(): APIGatewayProxyResultV2 {
  return json(501, { message: 'Not implemented' });
}

export function internalError(message = 'Internal server error'): APIGatewayProxyResultV2 {
  return json(500, { message });
}
