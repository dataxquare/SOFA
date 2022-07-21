jest.mock("@whatwg-node/fetch", () => {
  const original = jest.requireActual("@whatwg-node/fetch"); // Step 2.
  return {
    ...original,
    fetch: jest.fn().mockResolvedValue(({
      text: () => ({})
    })),
  };
});

import { fetch } from '@whatwg-node/fetch';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { PubSub } from 'graphql-subscriptions';
import supertest from 'supertest';
import { useSofa } from '../src';

const delay = (ms: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const testBook1 = {
  id: 'book-id-1',
  title: 'Test Book 1',
};
const testBook2 = {
  id: 'book-id-2',
  title: 'Test Book 2',
};
const BOOK_ADDED = 'BOOK_ADDED';
const typeDefs = /* GraphQL */ `
  type Book {
    id: ID!
    title: String!
  }
  type Subscription {
    onBook: Book!
  }
  type Query {
    books: [Book!]
  }
`;

test('should start subscriptions', async () => {
  (fetch as jest.Mock).mockClear();
  const pubsub = new PubSub();
  const sofa = useSofa({
    basePath: '/api',
    schema: makeExecutableSchema({
      typeDefs,
      resolvers: {
        Subscription: {
          onBook: {
            subscribe: () => pubsub.asyncIterator([BOOK_ADDED]),
          },
        },
      },
    }),
  });

  const res = await supertest(sofa)
    .post('/api/webhook')
    .send({ subscription: 'onBook', url: '/book' })
    .expect(200);
  expect(res.body).toEqual({ id: expect.any(String) });
  pubsub.publish(BOOK_ADDED, { onBook: testBook1 });
  await delay(1000);
  expect(fetch).toBeCalledTimes(1);
  expect(fetch).toBeCalledWith('/book', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: { onBook: { id: 'book-id-1', title: 'Test Book 1' } },
    }),
  });
  pubsub.publish(BOOK_ADDED, { onBook: testBook2 });
  await delay(1000);
  expect(fetch).toBeCalledTimes(2);
  expect(fetch).toBeCalledWith('/book', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 
      data: {
        onBook: { id: 'book-id-2', title: 'Test Book 2' } 
      }
    }),
  });
});

test('should stop subscriptions', async () => {
  (fetch as jest.Mock).mockClear();
  const pubsub = new PubSub();
  const sofa = useSofa({
    basePath: '/api',
    schema: makeExecutableSchema({
      typeDefs,
      resolvers: {
        Subscription: {
          onBook: {
            subscribe: () => pubsub.asyncIterator([BOOK_ADDED]),
          },
        },
      },
    }),
  });

  const res = await supertest(sofa)
    .post('/api/webhook')
    .send({ subscription: 'onBook', url: '/book' })
    .expect(200);
  pubsub.publish(BOOK_ADDED, { onBook: testBook1 });
  await delay(1000);
  expect(fetch).toBeCalledTimes(1);
  await supertest(sofa).delete(`/api/webhook/${res.body.id}`).expect(200);
  pubsub.publish(BOOK_ADDED, { onBook: testBook2 });
  await delay(1000);
  expect(fetch).toBeCalledTimes(1);
});
