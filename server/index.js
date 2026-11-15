import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createYoga } from 'graphql-yoga';
import { GraphQLError } from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { createDb } from '../db/connection.js';
import { config } from './config.js';
import { createContainer } from './container.js';
import { resolvers } from './resolvers.js';
import { depthLimitRule } from './depthLimit.js';

const typeDefs = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.graphql'), 'utf8');
const schema = makeExecutableSchema({ typeDefs, resolvers });

const db = createDb();
if (config.debugSql) db.on('query', (q) => console.log('[sql]', q.sql, JSON.stringify(q.bindings)));
const container = createContainer(db);

const USER_ERROR_CODES = ['BAD_USER_INPUT', 'NOT_FOUND'];
const log = (...parts) => console.error(`[${new Date().toISOString()}]`, ...parts);

const plugins = [
  {
    onValidate({ addValidationRule }) {
      addValidationRule(depthLimitRule(config.maxQueryDepth));
    },
    onExecute({ args }) {
      const operation = args.operationName ?? args.document.definitions.find((d) => d.kind === 'OperationDefinition')?.selectionSet.selections[0]?.name?.value ?? 'anonymous';
      return {
        onExecuteDone({ result }) {
          for (const err of result.errors ?? []) {
            if (USER_ERROR_CODES.includes(err.extensions?.code)) log(`operation=${operation}`, `${err.extensions.code}:`, err.message);
          }
        },
      };
    },
  },
];

const yoga = createYoga({
  schema,
  context: () => container.createContext(),
  graphqlEndpoint: '/graphql',
  plugins,
  // Непредвиденные ошибки: клиент получает общее сообщение, подробности - в лог.
  maskedErrors: {
    maskError(error, message) {
      const original = error?.originalError ?? error;
      // Ошибки пользователя (BAD_USER_INPUT, NOT_FOUND) не маскируются
      if (USER_ERROR_CODES.includes(original?.extensions?.code)) return error;
      log('unexpected error:', original?.stack ?? original);
      return new GraphQLError(message, { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
    },
  },
  logging: false,
});

const server = createServer(yoga);
server.listen(config.port, () => console.log(`GeoAtlas GraphQL: http://localhost:${config.port}/graphql`));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(async () => { await db.destroy(); process.exit(0); }));
}
