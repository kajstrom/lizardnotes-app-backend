import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { ok, created, noContent, badRequest, notFound, internalError } from './response.js';

function asStructured(result: unknown): APIGatewayProxyStructuredResultV2 {
  return result as APIGatewayProxyStructuredResultV2;
}

describe('ok', () => {
  it('returns 200 with JSON body and content-type header', () => {
    const result = asStructured(ok({ id: '1', name: 'Test' }));
    expect(result.statusCode).toBe(200);
    expect(result.headers?.['Content-Type']).toBe('application/json');
    expect(result.body).toBe(JSON.stringify({ id: '1', name: 'Test' }));
  });
});

describe('created', () => {
  it('returns 201 with JSON body and content-type header', () => {
    const result = asStructured(created({ id: 'new' }));
    expect(result.statusCode).toBe(201);
    expect(result.headers?.['Content-Type']).toBe('application/json');
    expect(result.body).toBe(JSON.stringify({ id: 'new' }));
  });
});

describe('noContent', () => {
  it('returns 204 with content-type header and empty JSON body', () => {
    const result = asStructured(noContent());
    expect(result.statusCode).toBe(204);
    expect(result.headers?.['Content-Type']).toBe('application/json');
    expect(result.body).toBe('{}');
  });
});

describe('badRequest', () => {
  it('returns 400 with message in JSON body', () => {
    const result = asStructured(badRequest('Invalid input'));
    expect(result.statusCode).toBe(400);
    expect(result.headers?.['Content-Type']).toBe('application/json');
    expect(result.body).toBe(JSON.stringify({ message: 'Invalid input' }));
  });
});

describe('notFound', () => {
  it('returns 404 with message in JSON body', () => {
    const result = asStructured(notFound('Item not found'));
    expect(result.statusCode).toBe(404);
    expect(result.headers?.['Content-Type']).toBe('application/json');
    expect(result.body).toBe(JSON.stringify({ message: 'Item not found' }));
  });

  it('uses default message when none provided', () => {
    const result = asStructured(notFound());
    expect(result.statusCode).toBe(404);
    expect(result.body).toBe(JSON.stringify({ message: 'Not found' }));
  });
});

describe('internalError', () => {
  it('returns 500 with message in JSON body', () => {
    const result = asStructured(internalError('Something broke'));
    expect(result.statusCode).toBe(500);
    expect(result.headers?.['Content-Type']).toBe('application/json');
    expect(result.body).toBe(JSON.stringify({ message: 'Something broke' }));
  });

  it('uses default message when none provided', () => {
    const result = asStructured(internalError());
    expect(result.statusCode).toBe(500);
    expect(result.body).toBe(JSON.stringify({ message: 'Internal server error' }));
  });
});
