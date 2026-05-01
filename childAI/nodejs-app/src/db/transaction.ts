import { Kysely, Transaction } from 'kysely';
import { Database, getDb } from './kysely';

type TxFn<T> = (trx: Transaction<Database>) => Promise<T>;

/**
 * Run a callback inside a database transaction.
 * Commits on success, rolls back on error.
 */
export async function withTransaction<T>(fn: TxFn<T>): Promise<T> {
  const db = getDb();
  return db.transaction().execute(fn);
}
