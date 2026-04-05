import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { deleteItem, getItem, putItem, queryItems, updateItem } from '../../lib/dynamo.js';
import { requireEnv } from '../../lib/env.js';
import { badRequest, created, internalError, noContent, notFound, ok } from '../../lib/response.js';
import type { Attachment, Note } from '../../types/index.js';
import { folderKey, noteKey, userPartitionKey } from '../../types/index.js';

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

async function listNotes(
  userId: string,
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const tableName = requireEnv('TABLE_NAME');
  const notes = await queryItems<Note>({
    TableName: tableName,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': userPartitionKey(userId),
      ':skPrefix': 'NOTE#',
    },
  });

  const folderId = event.queryStringParameters?.['folderId'];
  if (folderId) {
    return ok(notes.filter((n) => n.folderId === folderId));
  }
  return ok(notes);
}

async function createNote(
  userId: string,
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const body = parseBody(event);
  if (!body) return badRequest('Missing or invalid request body');

  const title = body['title'];
  if (typeof title !== 'string' || title.length === 0) {
    return badRequest('Missing required field: title');
  }

  const folderId = body['folderId'];
  if (typeof folderId !== 'string' || folderId.length === 0) {
    return badRequest('Missing required field: folderId');
  }

  const content = typeof body['content'] === 'string' ? body['content'] : '';

  const tableName = requireEnv('TABLE_NAME');

  const folder = await getItem({ TableName: tableName, Key: folderKey(userId, folderId) });
  if (!folder) return notFound('Folder not found');

  const noteId = randomUUID();
  const now = new Date().toISOString();
  const key = noteKey(userId, noteId);

  const note = {
    ...key,
    userId,
    noteId,
    folderId,
    title,
    content,
    createdAt: now,
    updatedAt: now,
  } as unknown as Note;

  await putItem({ TableName: tableName, Item: note as unknown as Record<string, unknown> });
  return created(note);
}

async function getNote(userId: string, noteId: string): Promise<APIGatewayProxyResultV2> {
  const tableName = requireEnv('TABLE_NAME');
  const note = await getItem<Note>({ TableName: tableName, Key: noteKey(userId, noteId) });
  if (!note) return notFound('Note not found');
  return ok(note);
}

async function updateNote(
  userId: string,
  noteId: string,
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const body = parseBody(event);
  if (!body) return badRequest('Missing or invalid request body');

  const hasTitle = 'title' in body;
  const hasContent = 'content' in body;
  const hasFolderId = 'folderId' in body;

  if (!hasTitle && !hasContent && !hasFolderId) {
    return badRequest('No fields to update');
  }

  const tableName = requireEnv('TABLE_NAME');
  const key = noteKey(userId, noteId);

  const existing = await getItem<Note>({ TableName: tableName, Key: key });
  if (!existing) return notFound('Note not found');

  if (hasFolderId) {
    const newFolderId = body['folderId'] as string;
    const folder = await getItem({ TableName: tableName, Key: folderKey(userId, newFolderId) });
    if (!folder) return notFound('Folder not found');
  }

  const now = new Date().toISOString();
  const fields: Record<string, unknown> = { updatedAt: now };
  if (hasTitle) fields['title'] = body['title'];
  if (hasContent) fields['content'] = body['content'];
  if (hasFolderId) fields['folderId'] = body['folderId'];

  const fieldKeys = Object.keys(fields);
  const expressionParts = fieldKeys.map((_, i) => `#f${i} = :v${i}`);
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, unknown> = {};
  fieldKeys.forEach((k, i) => {
    expressionAttributeNames[`#f${i}`] = k;
    expressionAttributeValues[`:v${i}`] = fields[k];
  });

  await updateItem({
    TableName: tableName,
    Key: key,
    UpdateExpression: `SET ${expressionParts.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
  });

  return ok({ ...existing, ...fields });
}

async function deleteNote(userId: string, noteId: string): Promise<APIGatewayProxyResultV2> {
  const tableName = requireEnv('TABLE_NAME');

  const existing = await getItem<Note>({ TableName: tableName, Key: noteKey(userId, noteId) });
  if (!existing) return notFound('Note not found');

  const attachments = await queryItems<Attachment>({
    TableName: tableName,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': userPartitionKey(userId),
      ':skPrefix': 'ATTACH#',
    },
  });

  const noteAttachments = attachments.filter((a) => a.noteId === noteId);
  for (const attachment of noteAttachments) {
    await deleteItem({
      TableName: tableName,
      Key: { PK: attachment.pk, SK: attachment.sk },
    });
  }

  await deleteItem({ TableName: tableName, Key: noteKey(userId, noteId) });
  return noContent();
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const userId = extractUserId(event);
  if (!userId) return badRequest('Unauthorized');

  const method = event.requestContext.http.method;
  const noteId = event.pathParameters?.['noteId'];

  if (method === 'GET' && !noteId) return listNotes(userId, event);
  if (method === 'POST' && !noteId) return createNote(userId, event);
  if (method === 'GET' && noteId) return getNote(userId, noteId);
  if (method === 'PUT' && noteId) return updateNote(userId, noteId, event);
  if (method === 'DELETE' && noteId) return deleteNote(userId, noteId);

  return internalError('Unknown route');
};
