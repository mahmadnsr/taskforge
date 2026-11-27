import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Test } from '@nestjs/testing';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import '../tasks/entities/task.entity.js';
import { AnalyticsResolver } from './analytics.resolver.js';

const { parse, validate } = createRequire(import.meta.url)('graphql') as typeof import('graphql');

describe('analytics GraphQL contract', () => {
  it('validates every frontend analytics operation against the code-first schema', async () => {
    const module = await Test.createTestingModule({ imports: [GraphQLSchemaBuilderModule] }).compile();
    try {
      const schema = await module.get(GraphQLSchemaFactory).create([AnalyticsResolver]);
      const source = readFileSync(new URL('../../../frontend/src/pages/analytics.graphql.ts', import.meta.url), 'utf8');
      const operations = [...source.matchAll(/gql`([\s\S]*?)`/g)].map((match) => match[1]);
      expect(operations).toHaveLength(3);
      for (const operation of operations) {
        expect(validate(schema, parse(operation)).map((error) => error.message)).toEqual([]);
      }
      expect(schema.getQueryType()?.getFields().projectProgress).toBeDefined();
    } finally {
      await module.close();
    }
  });
});
