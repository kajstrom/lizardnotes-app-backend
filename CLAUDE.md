# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

This repository is in the **pre-implementation phase**. The full specification lives in `PROJECT.md`. No Lambda code exists yet.

## Runtime

**TypeScript** (Node.js Lambda runtime). All Lambda functions are written in TypeScript and compiled before deployment.

## Architecture Overview

LizardNotes is a personal Obsidian-style markdown notes app. This repo (`lizardnotes-app-backend`) contains four AWS Lambda functions exposed via an API Gateway HTTP API. Infrastructure is provisioned separately in `lizardnotes-app-infra` (CDK/TypeScript) and configuration is shared via SSM Parameter Store.

### Lambda functions

| Function | Routes |
|---|---|
| `folders` | `GET/POST /folders`, `PUT/DELETE /folders/{folderId}` |
| `notes` | `GET/POST /notes`, `GET/PUT/DELETE /notes/{noteId}` |
| `attachments` | `GET/POST /notes/{noteId}/attachments`, `DELETE /notes/{noteId}/attachments/{attachmentId}` |
| `auth` | `GET /auth/me` |

### Deployment pipeline (GitHub Actions)

1. Read SSM parameters to get bucket name, function ARNs, etc.
2. Zip each function's code, upload to S3 deployment bucket under `functions/<functionName>/function.zip`.
3. Call `aws lambda update-function-code` with the ARN from SSM.

No values are hardcoded — everything comes from SSM at deploy time. The infra repo must be deployed first.

## DynamoDB Data Model

**Table:** `lizardnotes` — single table, PAY_PER_REQUEST billing.  
**Key:** `PK` (partition) + `SK` (sort), both strings.

| Entity | PK | SK |
|---|---|---|
| Folder | `USER#<userId>` | `FOLDER#<folderId>` |
| Note | `USER#<userId>` | `NOTE#<noteId>` |
| Attachment | `USER#<userId>` | `ATTACH#<attachmentId>` |

All user data shares one partition — efficient for single-user queries.

**GSI `parentFolderId-index`:** partition key `userId`, sort key `parentFolderId`, projection ALL. Use this to list direct children of any folder.

### Access patterns

| Query | Key condition |
|---|---|
| All folders for user | `PK = USER#<userId>` AND `SK begins_with FOLDER#` |
| All notes for user | `PK = USER#<userId>` AND `SK begins_with NOTE#` |
| All attachments for user | `PK = USER#<userId>` AND `SK begins_with ATTACH#` |
| Children of folder | GSI: `userId = <userId>` AND `parentFolderId = <folderId>` |

Notes by folder and attachments by note: filter on `folderId`/`noteId` after querying by prefix (no GSI needed at current scale).

## Runtime Environment Variables

Injected into every Lambda by the infra stack:

| Variable | Purpose |
|---|---|
| `TABLE_NAME` | DynamoDB table name |
| `ATTACHMENTS_BUCKET` | S3 attachments bucket name |

## Auth

All routes require a Cognito JWT Bearer token (validated by API Gateway). Inside any Lambda handler, the authenticated user ID is:

```
event.requestContext.authorizer.jwt.claims.sub
```

Use this as `<userId>` in all DynamoDB keys — never trust a user-supplied ID.

## S3 Attachment Pattern

Attachments are never proxied through Lambda. The flow:

- **Upload:** `POST /notes/{noteId}/attachments` → Lambda creates DynamoDB record + returns presigned S3 PUT URL (15 min expiry) → client uploads directly to S3.
- **Download:** `GET /notes/{noteId}/attachments/{attachmentId}` → Lambda returns presigned S3 GET URL (60 min expiry) → client fetches directly from S3.

## SSM Parameter Paths

Key paths read by the backend pipeline:

- `/lizardnotes/deployment/bucketName` — S3 bucket for Lambda zip artifacts
- `/lizardnotes/lambda/{folders,notes,attachments,auth}FunctionArn` — Lambda ARNs for `update-function-code`
- `/lizardnotes/dynamodb/tableName` — injected as `TABLE_NAME`
- `/lizardnotes/s3/attachmentsBucketName` — injected as `ATTACHMENTS_BUCKET`
- `/lizardnotes/cognito/userPoolId` — for JWT authorizer config

## Related Repositories

- `lizardnotes-app-infra` — CDK stack (provisions all AWS resources, writes SSM params)
- `lizardnotes-app-frontend` — Flutter app (web/mobile/desktop)
