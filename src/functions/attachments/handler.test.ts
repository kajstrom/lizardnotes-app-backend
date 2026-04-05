import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { handler } from './handler.js';
import { getPresignedGetUrl, getPresignedPutUrl } from '../../lib/s3.js';

jest.mock('../../lib/s3.js');

const mockGetPresignedGetUrl = jest.mocked(getPresignedGetUrl);
const mockGetPresignedPutUrl = jest.mocked(getPresignedPutUrl);

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);

beforeEach(() => {
  ddbMock.reset();
  s3Mock.reset();
  mockGetPresignedGetUrl.mockReset();
  mockGetPresignedPutUrl.mockReset();
  mockGetPresignedGetUrl.mockResolvedValue('https://mock-get-url');
  mockGetPresignedPutUrl.mockResolvedValue('https://mock-put-url');
  process.env['TABLE_NAME'] = 'test-table';
  process.env['ATTACHMENTS_BUCKET'] = 'test-bucket';
});

function makeEvent(
  method: string,
  noteId?: string,
  attachmentId?: string,
  body?: unknown,
  userId?: string | null,
): APIGatewayProxyEventV2 {
  return {
    requestContext: {
      http: { method },
      authorizer: userId !== null ? { jwt: { claims: { sub: userId ?? 'user-123' } } } : undefined,
    },
    pathParameters: {
      ...(noteId ? { noteId } : {}),
      ...(attachmentId ? { attachmentId } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  } as unknown as APIGatewayProxyEventV2;
}

function asStructured(result: unknown): APIGatewayProxyStructuredResultV2 {
  return result as APIGatewayProxyStructuredResultV2;
}

function parseBody(result: APIGatewayProxyStructuredResultV2): unknown {
  return JSON.parse(result.body ?? '{}');
}

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
  pk: 'USER#user-123',
  sk: 'ATTACH#attach-1',
  userId: 'user-123',
  attachmentId: 'attach-1',
  noteId: 'note-1',
  filename: 'file.png',
  s3Key: 'attachments/user-123/note-1/attach-1/file.png',
  mimeType: 'image/png',
  size: 1024,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('listAttachments', () => {
  it('returns 200 with attachments array including downloadUrl per item', async () => {
    ddbMock.on(GetCommand).resolves({ Item: sampleNote });
    ddbMock.on(QueryCommand).resolves({ Items: [sampleAttachment] });

    const result = asStructured(await handler(makeEvent('GET', 'note-1')));

    expect(result.statusCode).toBe(200);
    const body = parseBody(result) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0]!['attachmentId']).toBe('attach-1');
    expect(body[0]!['downloadUrl']).toBe('https://mock-get-url');
    expect(mockGetPresignedGetUrl).toHaveBeenCalledWith('test-bucket', sampleAttachment.s3Key);
  });

  it('returns 200 with empty array when note has no attachments', async () => {
    ddbMock.on(GetCommand).resolves({ Item: sampleNote });
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const result = asStructured(await handler(makeEvent('GET', 'note-1')));

    expect(result.statusCode).toBe(200);
    expect(parseBody(result)).toEqual([]);
  });

  it('returns 404 when note does not exist', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const result = asStructured(await handler(makeEvent('GET', 'note-1')));

    expect(result.statusCode).toBe(404);
    const body = parseBody(result) as Record<string, string>;
    expect(body['message']).toBe('Note not found');
  });
});

describe('createAttachment', () => {
  it('returns 201 with attachment record and uploadUrl', async () => {
    ddbMock.on(GetCommand).resolves({ Item: sampleNote });
    ddbMock.on(PutCommand).resolves({});

    const result = asStructured(
      await handler(
        makeEvent('POST', 'note-1', undefined, {
          filename: 'photo.png',
          mimeType: 'image/png',
          size: 2048,
        }),
      ),
    );

    expect(result.statusCode).toBe(201);
    const body = parseBody(result) as Record<string, unknown>;
    expect(body['uploadUrl']).toBe('https://mock-put-url');
    const attachment = body['attachment'] as Record<string, unknown>;
    expect(attachment['filename']).toBe('photo.png');
    expect(attachment['mimeType']).toBe('image/png');
    expect(attachment['size']).toBe(2048);
    expect(attachment['noteId']).toBe('note-1');
    expect(attachment['userId']).toBe('user-123');
    expect(typeof attachment['attachmentId']).toBe('string');
    expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 1);
  });

  it('derives s3Key in the correct format', async () => {
    ddbMock.on(GetCommand).resolves({ Item: sampleNote });
    ddbMock.on(PutCommand).resolves({});

    const result = asStructured(
      await handler(
        makeEvent('POST', 'note-1', undefined, {
          filename: 'doc.pdf',
          mimeType: 'application/pdf',
          size: 512,
        }),
      ),
    );

    expect(result.statusCode).toBe(201);
    const body = parseBody(result) as Record<string, unknown>;
    const attachment = body['attachment'] as Record<string, unknown>;
    const attachmentId = attachment['attachmentId'] as string;
    expect(attachment['s3Key']).toBe(`attachments/user-123/note-1/${attachmentId}/doc.pdf`);
  });

  it('returns 400 when body is missing', async () => {
    ddbMock.on(GetCommand).resolves({ Item: sampleNote });

    const result = asStructured(await handler(makeEvent('POST', 'note-1')));

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when filename is missing', async () => {
    ddbMock.on(GetCommand).resolves({ Item: sampleNote });

    const result = asStructured(
      await handler(makeEvent('POST', 'note-1', undefined, { mimeType: 'image/png', size: 1024 })),
    );

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when mimeType is missing', async () => {
    ddbMock.on(GetCommand).resolves({ Item: sampleNote });

    const result = asStructured(
      await handler(makeEvent('POST', 'note-1', undefined, { filename: 'file.png', size: 1024 })),
    );

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when size is missing', async () => {
    ddbMock.on(GetCommand).resolves({ Item: sampleNote });

    const result = asStructured(
      await handler(
        makeEvent('POST', 'note-1', undefined, { filename: 'file.png', mimeType: 'image/png' }),
      ),
    );

    expect(result.statusCode).toBe(400);
  });

  it('returns 404 when note does not exist', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const result = asStructured(
      await handler(
        makeEvent('POST', 'note-1', undefined, {
          filename: 'file.png',
          mimeType: 'image/png',
          size: 1024,
        }),
      ),
    );

    expect(result.statusCode).toBe(404);
    const body = parseBody(result) as Record<string, string>;
    expect(body['message']).toBe('Note not found');
  });
});

describe('deleteAttachment', () => {
  it('returns 204, deletes S3 object and DynamoDB record', async () => {
    ddbMock.on(GetCommand).resolves({ Item: sampleAttachment });
    ddbMock.on(DeleteCommand).resolves({});
    s3Mock.on(DeleteObjectCommand).resolves({});

    const result = asStructured(await handler(makeEvent('DELETE', 'note-1', 'attach-1')));

    expect(result.statusCode).toBe(204);
    expect(ddbMock).toHaveReceivedCommandTimes(DeleteCommand, 1);
    expect(s3Mock).toHaveReceivedCommandTimes(DeleteObjectCommand, 1);
    expect(s3Mock).toHaveReceivedCommandWith(DeleteObjectCommand, {
      Bucket: 'test-bucket',
      Key: sampleAttachment.s3Key,
    });
  });

  it('returns 404 when attachment record does not exist', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const result = asStructured(await handler(makeEvent('DELETE', 'note-1', 'attach-1')));

    expect(result.statusCode).toBe(404);
    const body = parseBody(result) as Record<string, string>;
    expect(body['message']).toBe('Attachment not found');
  });

  it('returns 404 when attachment.noteId does not match path noteId', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { ...sampleAttachment, noteId: 'other-note' } });

    const result = asStructured(await handler(makeEvent('DELETE', 'note-1', 'attach-1')));

    expect(result.statusCode).toBe(404);
    const body = parseBody(result) as Record<string, string>;
    expect(body['message']).toBe('Attachment not found');
  });

  it('returns 400 when userId is missing from authorizer claims', async () => {
    const result = asStructured(
      await handler(makeEvent('DELETE', 'note-1', 'attach-1', undefined, null)),
    );

    expect(result.statusCode).toBe(400);
    const body = parseBody(result) as Record<string, string>;
    expect(body['message']).toBe('Unauthorized');
  });
});
