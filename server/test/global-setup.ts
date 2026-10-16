import mongoose from 'mongoose';
import { assertTestDatabase } from './test-env.js';

/** Drops the _test database once before the suite; never touches any other (specs/06 §1.1). */
export default async function globalSetup(): Promise<void> {
  const connection = await mongoose
    .createConnection(process.env.MONGODB_URI as string)
    .asPromise();
  try {
    assertTestDatabase(connection.name);
    await connection.dropDatabase();
  } finally {
    await connection.close();
  }
}
