import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  QueryCommandInput,
  PutCommandInput,
  UpdateCommandInput,
  DeleteCommandInput,
  GetCommandInput,
} from '@aws-sdk/lib-dynamodb';

let client: DynamoDBDocumentClient | null = null;

export function getClient(): DynamoDBDocumentClient {
  if (!client) {
    client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return client;
}

export async function queryItems<T>(params: QueryCommandInput): Promise<T[]> {
  const result = await getClient().send(new QueryCommand(params));
  const items = result.Items ?? [];
  return items as unknown as T[];
}

export async function putItem(params: PutCommandInput): Promise<void> {
  await getClient().send(new PutCommand(params));
}

export async function updateItem(params: UpdateCommandInput): Promise<void> {
  await getClient().send(new UpdateCommand(params));
}

export async function deleteItem(params: DeleteCommandInput): Promise<void> {
  await getClient().send(new DeleteCommand(params));
}

export async function getItem<T>(params: GetCommandInput): Promise<T | null> {
  const result = await getClient().send(new GetCommand(params));
  return (result.Item ?? null) as unknown as T | null;
}
