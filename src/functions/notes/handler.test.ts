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
  noteId?: string,
  body?: unknown,
  userId?: string | null,
  queryStringParameters?: Record<string, string>,
): APIGatewayProxyEventV2 {
  return {
    requestContext: {
      http: { method },
      authorizer: userId !== null ? { jwt: { claims: { sub: userId ?? 'user-123' } } } : undefined,
    },
    pathParameters: noteId ? { noteId } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    queryStringParameters,
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

const sampleNote = {
  PK: 'USER#user-123',
  SK: 'NOTE#note-1',
  userId: 'user-123',
  noteId: 'note-1',
  folderId: 'folder-1',
  title: 'My Note',
  content: '# Hello',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const sampleAttachment = {
  PK: 'USER#user-123',
  SK: 'ATTACH#attach-1',
  userId: 'user-123',
  attachmentId: 'attach-1',
  noteId: 'note-1',
  filename: 'file.png',
  s3Key: 'user-123/attach-1',
  mimeType: 'image/png',
  size: 1024,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('listNotes', () => {
  it('returns 200 with array of notes', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [sampleNote] });

    const result = asStructured(await handler(makeEvent('GET')));

    expect(result.statusCode).toBe(200);
    expect(parseBody(result)).toEqual([sampleNote]);
  });

  it('returns 200 with empty array when no notes exist', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const result = asStructured(await handler(makeEvent('GET')));

    expect(result.statusCode).toBe(200);
    expect(parseBody(result)).toEqual([]);
  });

  it('returns 200 with filtered array when folderId query param provided', async () => {
    const otherNote = { ...sampleNote, noteId: 'note-2', SK: 'NOTE#note-2', folderId: 'folder-2' };
    ddbMock.on(QueryCommand).resolves({ Items: [sampleNote, otherNote] });

    const result = asStructured(
      await handler(makeEvent('GET', undefined, undefined, undefined, { folderId: 'folder-1' })),
    );

    expect(result.statusCode).toBe(200);
    expect(parseBody(result)).toEqual([sampleNote]);
  });
});

describe('createNote', () => {
  it('returns 201 with new note when title and folderId provided', async () => {
    ddbMock.on(GetCommand).resolves({ Item: sampleFolder });
    ddbMock.on(PutCommand).resolves({});

    const result = asStructured(
      await handler(makeEvent('POST', undefined, { title: 'Test Note', folderId: 'folder-1' })),
    );

    expect(result.statusCode).toBe(201);
    const body = parseBody(result) as Record<string, unknown>;
    expect(body['title']).toBe('Test Note');
    expect(body['folderId']).toBe('folder-1');
    expect(body['userId']).toBe('user-123');
    expect(typeof body['noteId']).toBe('string');
    expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 1);
  });

  it('returns 201 with empty content when content not provided', async () => {
    ddbMock.on(GetCommand).resolves({ Item: sampleFolder });
    ddbMock.on(PutCommand).resolves({});

    const result = asStructured(
      await handler(makeEvent('POST', undefined, { title: 'Test Note', folderId: 'folder-1' })),
    );

    expect(result.statusCode).toBe(201);
    const body = parseBody(result) as Record<string, unknown>;
    expect(body['content']).toBe('');
  });

  it('returns 400 when body is missing', async () => {
    const result = asStructured(await handler(makeEvent('POST')));

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when title is missing', async () => {
    const result = asStructured(
      await handler(makeEvent('POST', undefined, { folderId: 'folder-1' })),
    );

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when folderId is missing', async () => {
    const result = asStructured(
      await handler(makeEvent('POST', undefined, { title: 'Test Note' })),
    );

    expect(result.statusCode).toBe(400);
  });

  it('returns 404 when referenced folderId does not exist', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const result = asStructured(
      await handler(
        makeEvent('POST', undefined, { title: 'Test Note', folderId: 'nonexistent-folder' }),
      ),
    );

    expect(result.statusCode).toBe(404);
  });
});

describe('getNote', () => {
  it('returns 200 with note when found', async () => {
    ddbMock.on(GetCommand).resolves({ Item: sampleNote });

    const result = asStructured(await handler(makeEvent('GET', 'note-1')));

    expect(result.statusCode).toBe(200);
    expect(parseBody(result)).toEqual(sampleNote);
  });

  it('returns 404 when note does not exist', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const result = asStructured(await handler(makeEvent('GET', 'nonexistent-note')));

    expect(result.statusCode).toBe(404);
  });
});

describe('updateNote', () => {
  it('returns 200 with updated note when title is changed', async () => {
    ddbMock.on(GetCommand).resolves({ Item: sampleNote });
    ddbMock.on(UpdateCommand).resolves({});

    const result = asStructured(await handler(makeEvent('PUT', 'note-1', { title: 'Renamed' })));

    expect(result.statusCode).toBe(200);
    const body = parseBody(result) as Record<string, unknown>;
    expect(body['title']).toBe('Renamed');
    expect(ddbMock).toHaveReceivedCommandTimes(UpdateCommand, 1);
  });

  it('returns 200 with updated note when content is changed', async () => {
    ddbMock.on(GetCommand).resolves({ Item: sampleNote });
    ddbMock.on(UpdateCommand).resolves({});

    const result = asStructured(
      await handler(makeEvent('PUT', 'note-1', { content: '# Updated' })),
    );

    expect(result.statusCode).toBe(200);
    const body = parseBody(result) as Record<string, unknown>;
    expect(body['content']).toBe('# Updated');
  });

  it('returns 400 when body is empty', async () => {
    const result = asStructured(await handler(makeEvent('PUT', 'note-1', {})));

    expect(result.statusCode).toBe(400);
  });

  it('returns 404 when note does not exist', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const result = asStructured(
      await handler(makeEvent('PUT', 'nonexistent-note', { title: 'X' })),
    );

    expect(result.statusCode).toBe(404);
  });

  it('returns 404 when updated folderId does not exist', async () => {
    ddbMock.on(GetCommand).resolvesOnce({ Item: sampleNote }).resolvesOnce({ Item: undefined });

    const result = asStructured(
      await handler(makeEvent('PUT', 'note-1', { folderId: 'nonexistent-folder' })),
    );

    expect(result.statusCode).toBe(404);
  });
});

describe('unhandled errors', () => {
  it('returns 500 when DynamoDB throws unexpectedly', async () => {
    ddbMock.on(GetCommand).rejects(new Error('DynamoDB unavailable'));

    const result = asStructured(
      await handler(makeEvent('POST', undefined, { title: 'Test', folderId: 'folder-1' })),
    );

    expect(result.statusCode).toBe(500);
  });
});

describe('deleteNote', () => {
  it('returns 204 and deletes note and its attachment records', async () => {
    ddbMock.on(GetCommand).resolves({ Item: sampleNote });
    ddbMock.on(QueryCommand).resolves({ Items: [sampleAttachment] });
    ddbMock.on(DeleteCommand).resolves({});

    const result = asStructured(await handler(makeEvent('DELETE', 'note-1')));

    expect(result.statusCode).toBe(204);
    expect(ddbMock).toHaveReceivedCommandTimes(DeleteCommand, 2);
  });

  it('returns 204 when note has no attachments', async () => {
    ddbMock.on(GetCommand).resolves({ Item: sampleNote });
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    ddbMock.on(DeleteCommand).resolves({});

    const result = asStructured(await handler(makeEvent('DELETE', 'note-1')));

    expect(result.statusCode).toBe(204);
    expect(ddbMock).toHaveReceivedCommandTimes(DeleteCommand, 1);
  });

  it('returns 404 when note does not exist', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const result = asStructured(await handler(makeEvent('DELETE', 'nonexistent-note')));

    expect(result.statusCode).toBe(404);
  });

  it('returns 400 when userId is missing from authorizer claims', async () => {
    const result = asStructured(await handler(makeEvent('DELETE', 'note-1', undefined, null)));

    expect(result.statusCode).toBe(400);
    const body = parseBody(result) as Record<string, string>;
    expect(body['message']).toBe('Unauthorized');
  });
});
