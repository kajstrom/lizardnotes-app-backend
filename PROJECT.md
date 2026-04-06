# LizardNotes App — Project Overview

A personal notes application inspired by Obsidian, supporting markdown documents and file attachments. Built for web, mobile, and desktop via Flutter, with a serverless AWS backend.

---

## Goals & Constraints

- **Personal hobby project** — small number of users (< 10)
- **Minimal AWS costs** — target < $5/month at steady state.
- **Independent deployments** — frontend and backend deploy separately
- **Managed with CDK** — all AWS infrastructure as code
- **CI/CD via GitHub Actions** — one pipeline per repo

---

## Repository Structure

Three repositories, one Claude Code session per repo:

### 1. `lizardnotes-app-frontend`
Flutter application targeting web, mobile, and desktop.

- Dart / Flutter
- Communicates with backend via REST API
- Auth handled via AWS Cognito (Amplify or direct Cognito SDK)
- GitHub Actions: build and deploy per platform target

### 2. `lizardnotes-app-backend`
Lambda-based API — business logic and data access.

- AWS Lambda (TypeScript / Node.js runtime)
- Amazon API Gateway (HTTP API — cheaper than REST API)
- Amazon Cognito for auth (JWT validation at API Gateway)
- DynamoDB for note metadata and content
- S3 for file attachments
- Reads config (e.g. bucket names, API URLs) from AWS SSM Parameter Store at deploy time
- GitHub Actions: deploy Lambda code on push to main

### 3. `lizardnotes-app-infra`
CDK infrastructure — provisions all AWS resources.

- AWS CDK (TypeScript)
- Defines: Cognito User Pool, API Gateway, Lambda functions, DynamoDB table, S3 bucket
- Exports outputs to SSM Parameter Store for consumption by the backend pipeline
- Deployed independently; changes here are infrequent
- GitHub Actions: `cdk deploy` on push to main

---

## AWS Infrastructure

| Service | Purpose | Cost |
|---|---|---|
| AWS Lambda | API compute | Always free (1M req/month) |
| API Gateway (HTTP) | API front door | Free 12mo, then ~$1/M requests |
| DynamoDB | Notes + metadata storage | Always free (25 GB) |
| S3 | Attachment storage | Free up to 5 GB |
| Cognito | User identity & auth | Free up to 50K MAU |
| CloudFront | CDN for web frontend | Always free (1 TB/month) |
| SSM Parameter Store | Cross-repo config sharing | Free (standard params) |

**Estimated cost:** $0/month (year 1), ~$1–3/month (year 2+)

### Cost optimisation notes
- Use **HTTP API** (not REST API) in API Gateway — ~70% cheaper per request
- Long-term: replace API Gateway with **Lambda Function URLs** to eliminate that cost entirely
- Use **DynamoDB on-demand billing** (PAY_PER_REQUEST) — no idle capacity charges
- SSM **standard parameters only** — advanced params cost $0.05/param/month, not needed here

---

## Cross-Repo Config Pattern

The infra repo writes CDK stack outputs to SSM Parameter Store after each deploy. The backend repo reads these values during its GitHub Actions pipeline (e.g. S3 bucket name, Cognito pool ID) so no values are hardcoded across repos.

---

## Key Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Frontend framework | Flutter | Web + mobile + desktop from single codebase |
| Backend compute | Lambda (TypeScript) | Serverless, minimal cost at low traffic |
| Database | DynamoDB | Always-free tier, fits document/note structure |
| Auth | AWS Cognito | Native AWS integration, free for small user counts |
| IaC tool | AWS CDK (TypeScript) | Native AWS, good Lambda/API Gateway support |
| Repo strategy | 3 repos | Independent deploys, focused Claude Code sessions |
| API type | HTTP API (not REST) | Sufficient features, lower cost |
| Config sharing | SSM Parameter Store | Decouples infra and backend repos cleanly |
| Cognito auth flow | SRP (`ALLOW_USER_SRP_AUTH`) | Password never leaves the device; see note below |

### Cognito SRP auth — implementation notes

The App Client is configured for `ALLOW_USER_SRP_AUTH` and `ALLOW_REFRESH_TOKEN_AUTH` only. Plain username/password (`ALLOW_USER_PASSWORD_AUTH`) is intentionally disabled.

**What SRP means for the Flutter client:**
- Use the [`amazon_cognito_identity_dart_2`](https://pub.dev/packages/amazon_cognito_identity_dart_2) package (or Amplify Flutter's `Auth` category), both of which implement SRP natively.
- Do **not** call the Cognito `InitiateAuth` API with `AuthFlow: USER_PASSWORD_AUTH` — the App Client will reject it.
- SRP is a multi-step challenge/response handshake: `InitiateAuth` → Cognito returns an `SRP_A` challenge → client responds with `RespondToAuthChallenge` → tokens are returned. The Cognito SDK handles this automatically; you do not implement the maths yourself.

**Why the CDK synth output includes OAuth fields:**
CDK automatically adds `AllowedOAuthFlows` and `AllowedOAuthScopes` to any `UserPoolClient`. These fields are for the Cognito Hosted UI / OAuth2 flows and have no effect on SRP auth. The callback and logout URLs are set to `https://kstrm.com` as a placeholder and should be updated to the real redirect URLs (including any custom scheme for mobile, e.g. `myapp://callback`) when the frontend's URLs are known.

---

## DynamoDB Data Model

**Table name:** `lizardnotes`  
**Billing mode:** PAY_PER_REQUEST (on-demand)  
**Primary key:** `PK` (String, partition key) + `SK` (String, sort key)

### Entity patterns

| Entity | PK | SK | Attributes |
|---|---|---|---|
| Folder | `USER#<userId>` | `FOLDER#<folderId>` | `name`, `parentFolderId` (null = root), `path`, `createdAt`, `updatedAt` |
| Note | `USER#<userId>` | `NOTE#<noteId>` | `folderId`, `title`, `content` (markdown), `createdAt`, `updatedAt` |
| Attachment | `USER#<userId>` | `ATTACH#<attachmentId>` | `noteId`, `filename`, `s3Key`, `mimeType`, `size`, `createdAt` |

All entities for a given user share the same partition, enabling efficient single-partition queries across entity types.

### Global Secondary Index: `parentFolderId-index`

| | Attribute | Type |
|---|---|---|
| Partition key | `userId` | String |
| Sort key | `parentFolderId` | String |
| Projection | ALL | — |

**Purpose:** efficiently query all direct children of any folder. Without this index, listing the contents of a folder would require a full table scan or a filter expression on a large partition.

---

## SSM Parameter Store

All parameters are written by the infra stack after `cdk deploy` and read by the backend and frontend repos at deploy/build time. No values are hardcoded across repos. The infra repo must be deployed before the backend or frontend repos.

All parameters use the SSM standard tier.

### Cognito

| Parameter path | Description | Consumer |
|---|---|---|
| `/lizardnotes/cognito/userPoolId` | Cognito User Pool ID | backend + frontend |
| `/lizardnotes/cognito/userPoolArn` | Cognito User Pool ARN | backend |
| `/lizardnotes/cognito/appClientId` | Cognito App Client ID | frontend |

### DynamoDB

| Parameter path | Description | Consumer |
|---|---|---|
| `/lizardnotes/dynamodb/tableName` | DynamoDB table name | backend |
| `/lizardnotes/dynamodb/tableArn` | DynamoDB table ARN | backend |

### S3

| Parameter path | Description | Consumer |
|---|---|---|
| `/lizardnotes/s3/attachmentsBucketName` | Attachments bucket name | backend |
| `/lizardnotes/s3/attachmentsBucketArn` | Attachments bucket ARN | backend |

### Deployment

| Parameter path | Description | Consumer |
|---|---|---|
| `/lizardnotes/deployment/bucketName` | Lambda deployment artifacts bucket name | backend pipeline |
| `/lizardnotes/deployment/bucketArn` | Lambda deployment artifacts bucket ARN | backend pipeline |

### Lambda

| Parameter path | Description | Consumer |
|---|---|---|
| `/lizardnotes/lambda/foldersFunctionArn` | Folders Lambda ARN | backend pipeline |
| `/lizardnotes/lambda/notesFunctionArn` | Notes Lambda ARN | backend pipeline |
| `/lizardnotes/lambda/attachmentsFunctionArn` | Attachments Lambda ARN | backend pipeline |
| `/lizardnotes/lambda/authFunctionArn` | Auth Lambda ARN | backend pipeline |

### API Gateway

| Parameter path | Description | Consumer |
|---|---|---|
| `/lizardnotes/apigateway/apiUrl` | HTTP API endpoint URL | backend + frontend |
| `/lizardnotes/apigateway/apiId` | API ID | backend |

---

## Backend Repository Contract

Everything `lizardnotes-app-backend` needs to know about the infrastructure. No values should be hardcoded — all are read from SSM at deploy time.

### Deployment pipeline

1. Read SSM parameters to obtain bucket names, ARNs, and function ARNs.
2. Zip each function's code and upload to the deployment bucket (`/lizardnotes/deployment/bucketName`) under the key `functions/<functionName>/function.zip`.
3. Call `aws lambda update-function-code` with the ARN from SSM to deploy the new code.

| Function | S3 key |
|---|---|
| folders | `functions/folders/function.zip` |
| notes | `functions/notes/function.zip` |
| attachments | `functions/attachments/function.zip` |
| auth | `functions/auth/function.zip` |

### Runtime environment variables

These are injected into every Lambda function at deploy time by the infra stack:

| Variable | Value |
|---|---|
| `TABLE_NAME` | DynamoDB table name |
| `ATTACHMENTS_BUCKET` | S3 attachments bucket name |

### Auth

All API routes are protected by a Cognito JWT authorizer. The JWT is passed in the `Authorization` header as a Bearer token.

Inside the Lambda handler, the authenticated user's Cognito sub (userId) is available at:

```
event.requestContext.authorizer.jwt.claims.sub
```

### API specification

`openapi.yaml` in `lizardnotes-app-backend` is the source of truth for all API contracts (schemas, request/response bodies, security). Validated by Redocly CLI on every push to `master`. The Flutter frontend uses this spec to generate its Dart HTTP client.

Validate locally: `npm run validate:api`

### API route table

| Method | Path | Lambda |
|---|---|---|
| `GET` | `/folders` | folders |
| `POST` | `/folders` | folders |
| `PUT` | `/folders/{folderId}` | folders |
| `DELETE` | `/folders/{folderId}` | folders |
| `GET` | `/notes` | notes |
| `POST` | `/notes` | notes |
| `GET` | `/notes/{noteId}` | notes |
| `PUT` | `/notes/{noteId}` | notes |
| `DELETE` | `/notes/{noteId}` | notes |
| `GET` | `/notes/{noteId}/attachments` | attachments |
| `POST` | `/notes/{noteId}/attachments` | attachments |
| `DELETE` | `/notes/{noteId}/attachments/{attachmentId}` | attachments |
| `GET` | `/auth/me` | auth |

### DynamoDB access patterns (quick reference)

**Key design:** `PK` (partition key) + `SK` (sort key), both strings.

| Query | Condition |
|---|---|
| All entities for a user | `PK = USER#<userId>` |
| Folders for a user | `PK = USER#<userId>` AND `SK begins_with FOLDER#` |
| Notes for a user | `PK = USER#<userId>` AND `SK begins_with NOTE#` |
| Attachments for a user | `PK = USER#<userId>` AND `SK begins_with ATTACH#` |
| Direct children of a folder | GSI `parentFolderId-index`: `userId = <userId>` AND `parentFolderId = <folderId>` |

**GSI — `parentFolderId-index`:** partition key `userId`, sort key `parentFolderId`, projection ALL. Use this to list the direct children of any folder without a full-partition scan.

For notes belonging to a specific folder, filter on the `folderId` attribute after querying `PK = USER#<userId>` with `SK begins_with NOTE#`, or add a GSI if query volume warrants it.

For attachments belonging to a specific note, filter on the `noteId` attribute after querying `PK = USER#<userId>` with `SK begins_with ATTACH#`.

### S3 attachment pattern

Attachments are never served via the API directly. The backend generates presigned S3 URLs and returns them to the client, which interacts with S3 directly.

**Upload flow:**
1. Client calls `POST /notes/{noteId}/attachments`.
2. Lambda creates the attachment metadata record in DynamoDB and generates a presigned S3 **PUT** URL.
3. Lambda returns the presigned URL to the client.
4. Client uploads the file directly to S3 using the presigned URL.

**Download flow:**
1. Client calls `GET /notes/{noteId}/attachments/{attachmentId}`.
2. Lambda generates a presigned S3 **GET** URL for the attachment's `s3Key`.
3. Lambda returns the presigned URL to the client.
4. Client fetches the file directly from S3 using the presigned URL.

**Presigned URL expiry:**
- Upload (PUT): **15 minutes**
- Download (GET): **60 minutes**

---

## Future Considerations

- Full-text search: OpenSearch Serverless or DynamoDB + Lambda-side filtering (cost TBD)
- Real-time sync: API Gateway WebSocket or AppSync
- Offline support: Flutter local storage + sync on reconnect
- Sharing / collaboration: Cognito groups + DynamoDB item-level permissions
