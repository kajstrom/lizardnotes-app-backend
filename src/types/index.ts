export interface Folder {
  pk: string;
  sk: string;
  userId: string;
  folderId: string;
  name: string;
  parentFolderId: string | null;
  path: string;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  pk: string;
  sk: string;
  userId: string;
  noteId: string;
  folderId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  pk: string;
  sk: string;
  userId: string;
  attachmentId: string;
  noteId: string;
  filename: string;
  s3Key: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export function folderKey(userId: string, folderId: string): { PK: string; SK: string } {
  return { PK: `USER#${userId}`, SK: `FOLDER#${folderId}` };
}

export function noteKey(userId: string, noteId: string): { PK: string; SK: string } {
  return { PK: `USER#${userId}`, SK: `NOTE#${noteId}` };
}

export function attachmentKey(userId: string, attachmentId: string): { PK: string; SK: string } {
  return { PK: `USER#${userId}`, SK: `ATTACH#${attachmentId}` };
}

export function userPartitionKey(userId: string): string {
  return `USER#${userId}`;
}
