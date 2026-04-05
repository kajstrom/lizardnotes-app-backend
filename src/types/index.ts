export interface Folder {
  userId: string;
  folderId: string;
  name: string;
  parentFolderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  userId: string;
  noteId: string;
  folderId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  userId: string;
  attachmentId: string;
  noteId: string;
  filename: string;
  contentType: string;
  createdAt: string;
}
