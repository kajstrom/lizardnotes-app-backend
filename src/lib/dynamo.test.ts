import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { queryItems, getItem, putItem, updateItem, deleteItem } from './dynamo.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

interface TestItem {
  id: string;
  name: string;
}

describe('queryItems', () => {
  it('returns typed array of items', async () => {
    const items = [{ id: '1', name: 'Alpha' }];
    ddbMock.on(QueryCommand).resolves({ Items: items });

    const result = await queryItems<TestItem>({
      TableName: 'test-table',
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': 'USER#123' },
    });

    expect(result).toEqual(items);
    expect(ddbMock).toHaveReceivedCommandTimes(QueryCommand, 1);
  });

  it('returns empty array when Items is undefined', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: undefined });

    const result = await queryItems<TestItem>({
      TableName: 'test-table',
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': 'USER#empty' },
    });

    expect(result).toEqual([]);
  });
});

describe('getItem', () => {
  it('returns item when found', async () => {
    const item = { id: '42', name: 'Found' };
    ddbMock.on(GetCommand).resolves({ Item: item });

    const result = await getItem<TestItem>({
      TableName: 'test-table',
      Key: { PK: 'USER#123', SK: 'FOLDER#abc' },
    });

    expect(result).toEqual(item);
    expect(ddbMock).toHaveReceivedCommandTimes(GetCommand, 1);
  });

  it('returns null when item is not found', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const result = await getItem<TestItem>({
      TableName: 'test-table',
      Key: { PK: 'USER#123', SK: 'FOLDER#missing' },
    });

    expect(result).toBeNull();
  });
});

describe('putItem', () => {
  it('sends PutCommand and resolves', async () => {
    ddbMock.on(PutCommand).resolves({});

    await expect(
      putItem({
        TableName: 'test-table',
        Item: { PK: 'USER#123', SK: 'FOLDER#new', name: 'New Folder' },
      }),
    ).resolves.toBeUndefined();

    expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 1);
  });
});

describe('updateItem', () => {
  it('sends UpdateCommand and resolves', async () => {
    ddbMock.on(UpdateCommand).resolves({});

    await expect(
      updateItem({
        TableName: 'test-table',
        Key: { PK: 'USER#123', SK: 'FOLDER#abc' },
        UpdateExpression: 'SET #n = :name',
        ExpressionAttributeNames: { '#n': 'name' },
        ExpressionAttributeValues: { ':name': 'Updated' },
      }),
    ).resolves.toBeUndefined();

    expect(ddbMock).toHaveReceivedCommandTimes(UpdateCommand, 1);
  });
});

describe('deleteItem', () => {
  it('sends DeleteCommand and resolves', async () => {
    ddbMock.on(DeleteCommand).resolves({});

    await expect(
      deleteItem({
        TableName: 'test-table',
        Key: { PK: 'USER#123', SK: 'FOLDER#abc' },
      }),
    ).resolves.toBeUndefined();

    expect(ddbMock).toHaveReceivedCommandTimes(DeleteCommand, 1);
  });
});
