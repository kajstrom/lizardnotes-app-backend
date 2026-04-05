# lizardnotes-app-backend

AWS Lambda functions for the LizardNotes API. Four functions are deployed behind an API Gateway HTTP API, with Cognito JWT authentication, DynamoDB for note/folder/attachment metadata, and S3 for attachment storage.

---

## Prerequisites

- Node.js 22
- AWS CLI (configured with appropriate credentials for local testing)
- `jq` (used by the deploy pipeline to parse SSM output)
- `zip` (used by the build step to package Lambda artifacts)

---

## Local development

```sh
npm ci              # install dependencies
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm run test        # Jest
npm run build       # typecheck + bundle + zip (outputs to dist/)
```

---

## Deployment

Deployment is automated via GitHub Actions on every push to `main`.

**Required GitHub Actions secrets:**

| Secret | Description |
|---|---|
| `AWS_ROLE_ARN` | ARN of the IAM role assumed via OIDC |
| `AWS_REGION` | AWS region (e.g. `eu-west-1`) |

**Pipeline steps:**

1. Install dependencies
2. Lint, typecheck, and test
3. Build and zip all four Lambda functions
4. Authenticate to AWS via OIDC
5. Read deployment config from SSM Parameter Store
6. Upload `function.zip` files to the S3 deployment bucket
7. Update each Lambda function's code
8. Wait for all updates to propagate

> The `lizardnotes-app-infra` CDK stack must be deployed before the first backend deploy. The infra stack provisions all AWS resources and writes the SSM parameters the pipeline reads.

### IAM role permissions

The role assumed via OIDC needs exactly three grants. Replace the placeholders with your actual account ID, region, and bucket name (the bucket name is known after the infra stack is deployed).

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadSSMParameters",
      "Effect": "Allow",
      "Action": "ssm:GetParametersByPath",
      "Resource": "arn:aws:ssm:<region>:<account-id>:parameter/lizardnotes/*"
    },
    {
      "Sid": "UploadLambdaZips",
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::<deployment-bucket>/functions/*"
    },
    {
      "Sid": "DeployLambdaFunctions",
      "Effect": "Allow",
      "Action": [
        "lambda:UpdateFunctionCode",
        "lambda:GetFunction"
      ],
      "Resource": [
        "arn:aws:lambda:<region>:<account-id>:function:lizardnotes-folders",
        "arn:aws:lambda:<region>:<account-id>:function:lizardnotes-notes",
        "arn:aws:lambda:<region>:<account-id>:function:lizardnotes-attachments",
        "arn:aws:lambda:<region>:<account-id>:function:lizardnotes-auth"
      ]
    }
  ]
}
```

`lambda:GetFunction` is required by `aws lambda wait function-updated`, which polls the function's `LastUpdateStatus` until it reaches a terminal state.

The role's trust policy must restrict assumption to this repository:

```json
{
  "Effect": "Allow",
  "Principal": {
    "Federated": "arn:aws:iam::<account-id>:oidc-provider/token.actions.githubusercontent.com"
  },
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": {
    "StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
    },
    "StringLike": {
      "token.actions.githubusercontent.com:sub": "repo:<github-org>/lizardnotes-app-backend:ref:refs/heads/main"
    }
  }
}
```

The `sub` condition locks the role to pushes on `main` in this repository only — it cannot be assumed by other repos, branches, or workflow triggers (e.g. pull requests).

---

## Project structure

```
src/
  functions/
    auth/         GET /auth/me
    folders/      GET/POST /folders, PUT/DELETE /folders/{folderId}
    notes/        GET/POST /notes, GET/PUT/DELETE /notes/{noteId}
    attachments/  GET/POST /notes/{noteId}/attachments, DELETE .../attachments/{attachmentId}
  lib/            Shared utilities (DynamoDB client, response helpers, etc.)
  types/          Shared TypeScript types
dist/             Build output (gitignored)
```

---

## Environment variables

Injected into every Lambda by the infra stack at deploy time:

| Variable | Source | Purpose |
|---|---|---|
| `TABLE_NAME` | SSM `/lizardnotes/dynamodb/tableName` | DynamoDB table name |
| `ATTACHMENTS_BUCKET` | SSM `/lizardnotes/s3/attachmentsBucketName` | S3 bucket for attachments |

---

## API routes

All routes require a Cognito JWT Bearer token.

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
