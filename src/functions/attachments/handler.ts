import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { deleteItem, getItem, putItem, queryItems } from '../../lib/dynamo.js';
import { requireEnv } from '../../lib/env.js';
import { badRequest, created, internalError, noContent, notFound, ok } from '../../lib/response.js';
import { getPresignedGetUrl, getPresignedPutUrl } from '../../lib/s3.js';
import type { Attachment, Note } from '../../types/index.js';
import { attachmentKey, noteKey, userPartitionKey } from '../../types/index.js';

function extractUserId(event: APIGatewayProxyEventV2): string | null {
  const ctx = event.requestContext as unknown as {
    authorizer?: { jwt?: { claims?: Record<string, string> } };
  };
  return ctx.authorizer?.jwt?.claims?.['sub'] ?? null;
}

function parseBody(event: APIGatewayProxyEventV2): Record<string, unknown> | null {
  if (!event.body) return null;
  try {
    return JSON.parse(event.body) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function listAttachments(userId: string, noteId: string): Promise<APIGatewayProxyResultV2> {
  const tableName = requireEnv('TABLE_NAME');
  const bucketName = requireEnv('ATTACHMENTS_BUCKET');

  const note = await getItem<Note>({ TableName: tableName, Key: noteKey(userId, noteId) });
  if (!note) return notFound('Note not found');

  const attachments = await queryItems<Attachment>({
    TableName: tableName,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': userPartitionKey(userId),
      ':skPrefix': 'ATTACH#',
    },
  });

  const noteAttachments = attachments.filter((a) => a.noteId === noteId);

  const withUrls = await Promise.all(
    noteAttachments.map(async (a) => ({
      ...a,
      downloadUrl: await getPresignedGetUrl(bucketName, a.s3Key),
    })),
  );

  return ok(withUrls);
}

async function createAttachment(
  userId: string,
  noteId: string,
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const tableName = requireEnv('TABLE_NAME');
  const bucketName = requireEnv('ATTACHMENTS_BUCKET');

  const note = await getItem<Note>({ TableName: tableName, Key: noteKey(userId, noteId) });
  if (!note) return notFound('Note not found');

  const body = parseBody(event);
  if (!body) return badRequest('Missing or invalid request body');

  const { filename, mimeType, size } = body;

  if (typeof filename !== 'string' || filename.length === 0) {
    return badRequest('Missing required field: filename');
  }
  if (typeof mimeType !== 'string' || mimeType.length === 0) {
    return badRequest('Missing required field: mimeType');
  }
  if (typeof size !== 'number') {
    return badRequest('Missing required field: size');
  }

  const attachmentId = randomUUID();
  const s3Key = `attachments/${userId}/${noteId}/${attachmentId}/${filename}`;
  const key = attachmentKey(userId, attachmentId);
  const createdAt = new Date().toISOString();

  const attachment: Attachment = {
    ...key,
    pk: key.PK,
    sk: key.SK,
    userId,
    attachmentId,
    noteId,
    filename,
    s3Key,
    mimeType,
    size,
    createdAt,
  };

  await putItem({ TableName: tableName, Item: attachment as unknown as Record<string, unknown> });

  const uploadUrl = await getPresignedPutUrl(bucketName, s3Key);

  return created({ attachment, uploadUrl });
}

async function deleteAttachment(
  userId: string,
  noteId: string,
  attachmentId: string,
): Promise<APIGatewayProxyResultV2> {
  const tableName = requireEnv('TABLE_NAME');
  const bucketName = requireEnv('ATTACHMENTS_BUCKET');

  const attachment = await getItem<Attachment>({
    TableName: tableName,
    Key: attachmentKey(userId, attachmentId),
  });

  if (!attachment) return notFound('Attachment not found');
  if (attachment.noteId !== noteId) return notFound('Attachment not found');

  const s3 = new S3Client({ region: process.env['AWS_REGION'] });
  await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: attachment.s3Key }));

  await deleteItem({ TableName: tableName, Key: attachmentKey(userId, attachmentId) });

  return noContent();
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = extractUserId(event);
    if (!userId) return badRequest('Unauthorized');

    const method = event.requestContext.http.method;
    const noteId = event.pathParameters?.['noteId'];
    const attachmentId = event.pathParameters?.['attachmentId'];

    if (method === 'GET' && noteId && !attachmentId) return await listAttachments(userId, noteId);
    if (method === 'POST' && noteId && !attachmentId)
      return await createAttachment(userId, noteId, event);
    if (method === 'DELETE' && noteId && attachmentId)
      return await deleteAttachment(userId, noteId, attachmentId);

    return internalError('Unknown route');
  } catch (err) {
    console.error('Unhandled error:', err);
    return internalError();
  }
};
