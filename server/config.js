import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  maxQueryDepth: Number(process.env.MAX_QUERY_DEPTH ?? 8),
  debugSql: Boolean(process.env.DEBUG_SQL),
};
