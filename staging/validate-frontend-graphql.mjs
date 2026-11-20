import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildClientSchema,
  getIntrospectionQuery,
  parse,
  validate,
} from '../frontend/node_modules/graphql/index.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourceDirectory = path.resolve(scriptDirectory, '../frontend/src');
const endpoint = 'http://127.0.0.1:3300/graphql';

async function sourceFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.tsx?$/.test(entry.name) ? [target] : [];
  }));
  return files.flat();
}

async function liveSchema() {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: getIntrospectionQuery() }),
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json();
  if (!response.ok || result.errors?.length || !result.data) {
    throw new Error('Could not introspect the local staging GraphQL schema');
  }
  return buildClientSchema(result.data);
}

async function run() {
  const schema = await liveSchema();
  const files = await sourceFiles(sourceDirectory);
  const failures = [];
  let operationCount = 0;

  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    const documents = source.matchAll(/\bgql\s*`([\s\S]*?)`/g);
    for (const document of documents) {
      operationCount++;
      const graphqlSource = document[1];
      const relativeFile = path.relative(path.resolve(scriptDirectory, '..'), file);
      if (graphqlSource.includes('${')) {
        failures.push(`${relativeFile}: interpolated GraphQL documents are not supported by this validator`);
        continue;
      }
      try {
        const errors = validate(schema, parse(graphqlSource));
        failures.push(...errors.map((error) => `${relativeFile}: ${error.message}`));
      } catch (error) {
        failures.push(`${relativeFile}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  if (operationCount === 0) throw new Error('No frontend GraphQL operations were found');
  if (failures.length) {
    throw new Error(`Frontend GraphQL contract validation failed:\n${failures.join('\n')}`);
  }
  console.log(`Frontend GraphQL contract passed: ${operationCount} operations match the live staging schema.`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
