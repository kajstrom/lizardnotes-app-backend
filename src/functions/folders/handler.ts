import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { deleteItem, getItem, putItem, queryItems, updateItem } from '../../lib/dynamo.js';
import { requireEnv } from '../../lib/env.js';
import { badRequest, created, internalError, noContent, notFound, ok } from '../../lib/response.js';
import type { Folder } from '../../types/index.js';
import { folderKey, userPartitionKey } from '../../types/index.js';

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

async function listFolders(userId: string): Promise<APIGatewayProxyResultV2> {
  const tableName = requireEnv('TABLE_NAME');
  const folders = await queryItems<Folder>({
    TableName: tableName,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': userPartitionKey(userId),
      ':skPrefix': 'FOLDER#',
    },
  });
  return ok(folders);
}

async function createFolder(
  userId: string,
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const body = parseBody(event);
  if (!body) return badRequest('Missing or invalid request body');

  const name = body['name'];
  if (typeof name !== 'string' || name.length === 0) {
    return badRequest('Missing required field: name');
  }

  const parentFolderId =
    'parentFolderId' in body ? ((body['parentFolderId'] as string | null) ?? null) : null;

  const tableName = requireEnv('TABLE_NAME');

  let path: string;
  if (parentFolderId == null) {
    path = `/${name}`;
  } else {
    const parent = await getItem<Folder>({
      TableName: tableName,
      Key: folderKey(userId, parentFolderId),
    });
    if (!parent) return notFound('Parent folder not found');
    path = `${parent.path}/${name}`;
  }

  const folderId = randomUUID();
  const now = new Date().toISOString();
  const key = folderKey(userId, folderId);

  const folder = {
    ...key,
    userId,
    folderId,
    name,
    ...(parentFolderId != null ? { parentFolderId } : {}),
    path,
    createdAt: now,
    updatedAt: now,
  } as unknown as Folder;

  await putItem({ TableName: tableName, Item: folder as unknown as Record<string, unknown> });
  return created(folder);
}

async function updateFolder(
  userId: string,
  folderId: string,
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const body = parseBody(event);
  if (!body) return badRequest('Missing or invalid request body');

  const hasName = 'name' in body;
  const hasParentFolderId = 'parentFolderId' in body;

  if (!hasName && !hasParentFolderId) {
    return badRequest('No fields to update');
  }

  const tableName = requireEnv('TABLE_NAME');
  const key = folderKey(userId, folderId);

  const existing = await getItem<Folder>({ TableName: tableName, Key: key });
  if (!existing) return notFound('Folder not found');

  const newName = hasName ? (body['name'] as string) : existing.name;
  const newParentFolderId = hasParentFolderId
    ? ((body['parentFolderId'] as string | null) ?? null)
    : existing.parentFolderId;

  let newPath: string;
  if (newParentFolderId == null) {
    newPath = `/${newName}`;
  } else {
    const parent = await getItem<Folder>({
      TableName: tableName,
      Key: folderKey(userId, newParentFolderId),
    });
    if (!parent) return notFound('Parent folder not found');
    newPath = `${parent.path}/${newName}`;
  }

  const now = new Date().toISOString();
  const fields: Record<string, unknown> = { updatedAt: now, path: newPath };
  if (hasName) fields['name'] = newName;
  if (hasParentFolderId && newParentFolderId != null) fields['parentFolderId'] = newParentFolderId;

  const fieldKeys = Object.keys(fields);
  const expressionParts = fieldKeys.map((_, i) => `#f${i} = :v${i}`);
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, unknown> = {};
  fieldKeys.forEach((k, i) => {
    expressionAttributeNames[`#f${i}`] = k;
    expressionAttributeValues[`:v${i}`] = fields[k];
  });

  const removeParentFolderId = hasParentFolderId && newParentFolderId == null;
  if (removeParentFolderId) expressionAttributeNames['#pfi'] = 'parentFolderId';

  await updateItem({
    TableName: tableName,
    Key: key,
    UpdateExpression:
      `SET ${expressionParts.join(', ')}` + (removeParentFolderId ? ' REMOVE #pfi' : ''),
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
  });

  return ok({ ...existing, ...fields });
}

async function deleteFolder(userId: string, folderId: string): Promise<APIGatewayProxyResultV2> {
  const tableName = requireEnv('TABLE_NAME');
  await deleteItem({ TableName: tableName, Key: folderKey(userId, folderId) });
  return noContent();
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = extractUserId(event);
    if (!userId) return badRequest('Unauthorized');

    const method = event.requestContext.http.method;
    const folderId = event.pathParameters?.['folderId'];

    if (method === 'GET' && !folderId) return await listFolders(userId);
    if (method === 'POST' && !folderId) return await createFolder(userId, event);
    if (method === 'PUT' && folderId) return await updateFolder(userId, folderId, event);
    if (method === 'DELETE' && folderId) return await deleteFolder(userId, folderId);

    return internalError('Unknown route');
  } catch (err) {
    console.error('Unhandled error:', err);
    return internalError();
  }
};
