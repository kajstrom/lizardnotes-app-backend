import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let client: S3Client | null = null;

export function getClient(): S3Client {
  if (!client) {
    client = new S3Client({ region: process.env.AWS_REGION });
  }
  return client;
}

export async function getPresignedPutUrl(bucket: string, key: string): Promise<string> {
  return getSignedUrl(getClient(), new PutObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: 15 * 60,
  });
}

export async function getPresignedGetUrl(bucket: string, key: string): Promise<string> {
  return getSignedUrl(getClient(), new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: 60 * 60,
  });
}
