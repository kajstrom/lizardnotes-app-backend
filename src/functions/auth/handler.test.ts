import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { handler } from './handler.js';

function makeEvent(claims?: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    requestContext: {
      authorizer: claims !== undefined ? { jwt: { claims } } : undefined,
    },
  } as unknown as APIGatewayProxyEventV2;
}

function asStructured(result: unknown): APIGatewayProxyStructuredResultV2 {
  return result as APIGatewayProxyStructuredResultV2;
}

function parseBody(result: APIGatewayProxyStructuredResultV2): Record<string, string> {
  return JSON.parse(result.body ?? '{}') as Record<string, string>;
}

describe('GET /auth/me', () => {
  it('returns 200 with userId, email, and username when all claims present', async () => {
    const result = asStructured(
      await handler(
        makeEvent({
          sub: 'user-123',
          email: 'test@example.com',
          'cognito:username': 'testuser',
        }),
      ),
    );
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe(
      JSON.stringify({ userId: 'user-123', email: 'test@example.com', username: 'testuser' }),
    );
  });

  it('returns 400 when authorizer claims are missing entirely', async () => {
    const result = asStructured(await handler(makeEvent(undefined)));
    expect(result.statusCode).toBe(400);
    expect(parseBody(result).message).toBe('Missing auth claims');
  });

  it('returns 400 when sub claim is missing', async () => {
    const result = asStructured(
      await handler(makeEvent({ email: 'test@example.com', 'cognito:username': 'testuser' })),
    );
    expect(result.statusCode).toBe(400);
    expect(parseBody(result).message).toBe('Missing auth claims');
  });

  it('returns 400 when email claim is missing', async () => {
    const result = asStructured(
      await handler(makeEvent({ sub: 'user-123', 'cognito:username': 'testuser' })),
    );
    expect(result.statusCode).toBe(400);
    expect(parseBody(result).message).toBe('Missing auth claims');
  });

  it('returns 400 when cognito:username claim is missing', async () => {
    const result = asStructured(
      await handler(makeEvent({ sub: 'user-123', email: 'test@example.com' })),
    );
    expect(result.statusCode).toBe(400);
    expect(parseBody(result).message).toBe('Missing auth claims');
  });
});
