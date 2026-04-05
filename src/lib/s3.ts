import { S3Client } from '@aws-sdk/client-s3';
import { requireEnv } from './env.js';

export const s3Client = new S3Client({});

export const ATTACHMENTS_BUCKET = requireEnv('ATTACHMENTS_BUCKET');
