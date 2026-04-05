import { folderKey, noteKey, attachmentKey, userPartitionKey } from './index.js';

describe('folderKey', () => {
  it('builds correct PK and SK', () => {
    expect(folderKey('user-1', 'folder-abc')).toEqual({
      PK: 'USER#user-1',
      SK: 'FOLDER#folder-abc',
    });
  });
});

describe('noteKey', () => {
  it('builds correct PK and SK', () => {
    expect(noteKey('user-2', 'note-xyz')).toEqual({
      PK: 'USER#user-2',
      SK: 'NOTE#note-xyz',
    });
  });
});

describe('attachmentKey', () => {
  it('builds correct PK and SK', () => {
    expect(attachmentKey('user-3', 'attach-999')).toEqual({
      PK: 'USER#user-3',
      SK: 'ATTACH#attach-999',
    });
  });
});

describe('userPartitionKey', () => {
  it('returns USER# prefixed string', () => {
    expect(userPartitionKey('user-42')).toBe('USER#user-42');
  });
});
