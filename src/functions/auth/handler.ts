import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { badRequest, ok } from '../../lib/response.js';

type JwtClaims = Record<string, string | number | boolean | string[] | undefined>;

function extractClaims(event: APIGatewayProxyEventV2): JwtClaims | undefined {
  const ctx = event.requestContext as unknown as { authorizer?: { jwt?: { claims?: JwtClaims } } };
  return ctx.authorizer?.jwt?.claims;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

export const handler = (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const claims = extractClaims(event);

  if (!claims) {
    return Promise.resolve(badRequest('Missing auth claims'));
  }

  const userId = claims['sub'];
  const email = claims['email'];
  const username = claims['cognito:username'];

  if (!isNonEmptyString(userId) || !isNonEmptyString(email) || !isNonEmptyString(username)) {
    return Promise.resolve(badRequest('Missing auth claims'));
  }

  return Promise.resolve(ok({ userId, email, username }));
};
