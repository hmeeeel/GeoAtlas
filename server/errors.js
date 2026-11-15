import { GraphQLError } from 'graphql';

export function badInput(message, field) {
  return new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT', ...(field && { field }) } });
}

export function notFound(message) {
  return new GraphQLError(message, { extensions: { code: 'NOT_FOUND' } });
}
