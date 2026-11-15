import { ApolloClient, InMemoryCache } from '@apollo/client';

// обмен данными с сервером - /graphql.
export const client = new ApolloClient({
  uri: '/graphql',
  cache: new InMemoryCache(),
  defaultOptions: { watchQuery: { fetchPolicy: 'cache-and-network', notifyOnNetworkStatusChange: true } },
});
