import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { handler } from './handler.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  process.env['TABLE_NAME'] = 'test-table';
});

function makeEvent(
  method: string,
  folderId?: string,
  body?: unknown,
  userId?: string | null,
): APIGatewayProxyEventV2 {
  return {
    requestContext: {
      http: { method },
      authorizer: userId !== null ? { jwt: { claims: { sub: userId ?? 'user-123' } } } : undefined,
    },
    pathParameters: folderId ? { folderId } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  } as unknown as APIGatewayProxyEventV2;
}

function asStructured(result: unknown): APIGatewayProxyStructuredResultV2 {
  return result as APIGatewayProxyStructuredResultV2;
}

function parseBody(result: APIGatewayProxyStructuredResultV2): unknown {
  return JSON.parse(result.body ?? '{}');
}

const sampleFolder = {
  PK: 'USER#user-123',
  SK: 'FOLDER#folder-1',
  userId: 'user-123',
  folderId: 'folder-1',
  name: 'Notes',
  parentFolderId: null,
  path: '/Notes',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('listFolders', () => {
  it('returns 200 with array of folders', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [sampleFolder] });

    const result = asStructured(await handler(makeEvent('GET')));

    expect(result.statusCode).toBe(200);
    expect(parseBody(result)).toEqual([sampleFolder]);
  });

  it('returns 200 with empty array when no folders exist', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const result = asStructured(await handler(makeEvent('GET')));

    expect(result.statusCode).toBe(200);
    expect(parseBody(result)).toEqual([]);
  });
});

describe('createFolder', () => {
  it('returns 201 with new folder when name provided and parentFolderId is null', async () => {
    ddbMock.on(PutCommand).resolves({});

    const result = asStructured(await handler(makeEvent('POST', undefined, { name: 'Work' })));

    expect(result.statusCode).toBe(201);
    const body = parseBody(result) as Record<string, unknown>;
    expect(body['name']).toBe('Work');
    expect(body['path']).toBe('/Work');
    expect(body['parentFolderId']).toBeNull();
    expect(body['userId']).toBe('user-123');
    expect(typeof body['folderId']).toBe('string');
    expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 1);
  });

  it('returns 201 with correct path when valid parentFolderId provided', async () => {
    const parentFolder = { ...sampleFolder, path: '/Notes' };
    ddbMock.on(GetCommand).resolves({ Item: parentFolder });
    ddbMock.on(PutCommand).resolves({});

    const result = asStructured(
      await handler(makeEvent('POST', undefined, { name: 'Work', parentFolderId: 'folder-1' })),
    );

    expect(result.statusCode).toBe(201);
    const body = parseBody(result) as Record<string, unknown>;
    expect(body['path']).toBe('/Notes/Work');
    expect(body['parentFolderId']).toBe('folder-1');
  });

  it('returns 400 when body is missing', async () => {
    const result = asStructured(await handler(makeEvent('POST')));

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when name is missing', async () => {
    const result = asStructured(
      await handler(makeEvent('POST', undefined, { parentFolderId: null })),
    );

    expect(result.statusCode).toBe(400);
  });

  it('returns 404 when parentFolderId does not exist in DynamoDB', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const result = asStructured(
      await handler(
        makeEvent('POST', undefined, { name: 'Child', parentFolderId: 'nonexistent-id' }),
      ),
    );

    expect(result.statusCode).toBe(404);
  });
});

describe('updateFolder', () => {
  it('returns 200 with updated folder when name is changed', async () => {
    ddbMock.on(GetCommand).resolves({ Item: sampleFolder });
    ddbMock.on(UpdateCommand).resolves({});

    const result = asStructured(await handler(makeEvent('PUT', 'folder-1', { name: 'Renamed' })));

    expect(result.statusCode).toBe(200);
    const body = parseBody(result) as Record<string, unknown>;
    expect(body['name']).toBe('Renamed');
    expect(body['path']).toBe('/Renamed');
    expect(ddbMock).toHaveReceivedCommandTimes(UpdateCommand, 1);
  });

  it('returns 400 when body is empty', async () => {
    const result = asStructured(await handler(makeEvent('PUT', 'folder-1', {})));

    expect(result.statusCode).toBe(400);
  });

  it('returns 404 when folder does not exist', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const result = asStructured(await handler(makeEvent('PUT', 'folder-1', { name: 'New Name' })));

    expect(result.statusCode).toBe(404);
  });
});

describe('unhandled errors', () => {
  it('returns 500 when DynamoDB throws unexpectedly', async () => {
    ddbMock.on(PutCommand).rejects(new Error('DynamoDB unavailable'));

    const result = asStructured(await handler(makeEvent('POST', undefined, { name: 'Work' })));

    expect(result.statusCode).toBe(500);
  });
});

describe('deleteFolder', () => {
  it('returns 204 when folder is deleted', async () => {
    ddbMock.on(DeleteCommand).resolves({});

    const result = asStructured(await handler(makeEvent('DELETE', 'folder-1')));

    expect(result.statusCode).toBe(204);
    expect(ddbMock).toHaveReceivedCommandTimes(DeleteCommand, 1);
  });

  it('returns 400 when userId is missing from authorizer claims', async () => {
    const result = asStructured(await handler(makeEvent('DELETE', 'folder-1', undefined, null)));

    expect(result.statusCode).toBe(400);
    const body = parseBody(result) as Record<string, string>;
    expect(body['message']).toBe('Unauthorized');
  });
});
