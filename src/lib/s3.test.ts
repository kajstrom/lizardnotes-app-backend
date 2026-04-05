import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getPresignedPutUrl, getPresignedGetUrl } from './s3.js';

jest.mock('@aws-sdk/s3-request-presigner');

const mockGetSignedUrl = jest.mocked(getSignedUrl);
const s3Mock = mockClient(S3Client);

beforeEach(() => {
  s3Mock.reset();
  mockGetSignedUrl.mockReset();
  mockGetSignedUrl.mockResolvedValue('https://mock-presigned-url');
});

describe('getPresignedPutUrl', () => {
  it('invokes getSignedUrl with PutObjectCommand and 15 minute expiry', async () => {
    const url = await getPresignedPutUrl('my-bucket', 'uploads/file.png');

    expect(url).toBe('https://mock-presigned-url');
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.any(S3Client),
      expect.any(PutObjectCommand),
      { expiresIn: 900 },
    );
  });

  it('passes the correct bucket and key to PutObjectCommand', async () => {
    await getPresignedPutUrl('target-bucket', 'notes/note-1/photo.jpg');

    const call = mockGetSignedUrl.mock.calls.at(0);
    const command = call?.[1] as PutObjectCommand;
    expect(command.input).toEqual({ Bucket: 'target-bucket', Key: 'notes/note-1/photo.jpg' });
  });
});

describe('getPresignedGetUrl', () => {
  it('invokes getSignedUrl with GetObjectCommand and 60 minute expiry', async () => {
    const url = await getPresignedGetUrl('my-bucket', 'uploads/file.png');

    expect(url).toBe('https://mock-presigned-url');
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.any(S3Client),
      expect.any(GetObjectCommand),
      { expiresIn: 3600 },
    );
  });

  it('passes the correct bucket and key to GetObjectCommand', async () => {
    await getPresignedGetUrl('target-bucket', 'notes/note-1/photo.jpg');

    const call = mockGetSignedUrl.mock.calls.at(0);
    const command = call?.[1] as GetObjectCommand;
    expect(command.input).toEqual({ Bucket: 'target-bucket', Key: 'notes/note-1/photo.jpg' });
  });
});
