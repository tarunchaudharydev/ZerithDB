import Dexie, { type Table } from "dexie";
import { v7 as uuidv7 } from "uuid";
import type {
  ZerithDBConfig,
  Document,
  QueryFilter,
  InsertResult,
  UpdateSpec,
} from "zerithdb-core";
import { ZerithDBError, ErrorCode } from "zerithdb-core";

/**
 * A handle to a single named collection within the ZerithDB local database.
 * All operations are async and backed by IndexedDB.
 */
export class CollectionClient<T extends Record<string, any> = Record<string, any>> {
  constructor(
    private readonly table: Table<Document<T>>,
    private readonly collectionName: string
  ) {}

  /**
 * Inserts a new document into the collection.
 *
 * Automatically assigns:
 * - `_id`
 * - `_createdAt`
 * - `_updatedAt`
 *
 * @param document - Document data to insert into the collection
 * @returns Promise resolving to the inserted document identifier
 *
 * @throws {ZerithDBError}
 * Thrown when the document cannot be persisted to IndexedDB.
 *
 * @example
 * ```typescript
 * const todos = app.db("todos");
 *
 * const result = await todos.insert({
 *   text: "Learn ZerithDB",
 *   done: false,
 * });
 *
 * console.log(result.id);
 * ```
 */
  async insert(document: T): Promise<InsertResult> {
    const now = Date.now();
    const id = uuidv7();
    const doc: Document<T> = {
      ...document,
      _id: id,
      _createdAt: now,
      _updatedAt: now,
    };

    try {
      await this.table.add(doc);
      return { id };
    } catch (err) {
      throw new ZerithDBError(
        ErrorCode.DB_WRITE_FAILED,
        `Failed to insert into collection "${this.collectionName}"`,
        { cause: err }
      );
    }
  }

  /**
 * Inserts multiple documents into the collection in a single atomic operation.
 *
 * Each document automatically receives:
 * - `_id`
 * - `_createdAt`
 * - `_updatedAt`
 *
 * @param documents - Array of documents to insert
 * @returns Promise resolving to insertion metadata for all inserted documents
 *
 * @throws {ZerithDBError}
 * Thrown when the bulk insert operation fails.
 *
 * @example
 * ```typescript
 * await todos.insertMany([
 *   { text: "Write docs", done: false },
 *   { text: "Ship release", done: false },
 * ]);
 * ```
 */
  
  async insertMany(documents: T[]): Promise<InsertResult[]> {
    const now = Date.now();
    const docs = documents.map((doc) => ({
      ...doc,
      _id: uuidv7(),
      _createdAt: now,
      _updatedAt: now,
    })) as Document<T>[];

    try {
      await this.table.bulkAdd(docs);
      return docs.map((d) => ({ id: d._id }));
    } catch (err) {
      throw new ZerithDBError(
        ErrorCode.DB_WRITE_FAILED,
        `Failed to bulk insert into collection "${this.collectionName}"`,
        { cause: err }
      );
    }
  }

  /**
 * Finds documents matching a query filter.
 *
 * All filter conditions are combined using logical AND semantics.
 *
 * @param filter - Query filter used to match documents
 * @returns Promise resolving to an array of matching documents
 *
 * @throws {ZerithDBError}
 * Thrown when the query operation fails.
 *
 * @example
 * ```typescript
 * const active = await todos.find({
 *   done: false
 * });
 *
 * const highPriority = await todos.find({
 *   priority: { $gte: 3 }
 * });
 * ```
 */
  
  async find(filter: QueryFilter<T> = {}): Promise<Document<T>[]> {
    try {
      const all = await this.table.toArray();
      return all.filter((doc) => this.matchesFilter(doc, filter));
    } catch (err) {
      throw new ZerithDBError(
        ErrorCode.DB_READ_FAILED,
        `Failed to query collection "${this.collectionName}"`,
        { cause: err }
      );
    }
  }

 /**
 * Finds a single document by its `_id`.
 *
 * @param id - Unique document identifier
 * @returns Promise resolving to the matching document or `undefined`
 * if the document does not exist
 *
 * @throws {ZerithDBError}
 * Thrown when the read operation fails.
 *
 * @example
 * ```typescript
 * const todo = await todos.findById("doc_123");
 * ```
 */

  
  async findById(id: string): Promise<Document<T> | undefined> {
    try {
      return await this.table.get(id);
    } catch (err) {
      throw new ZerithDBError(
        ErrorCode.DB_READ_FAILED,
        `Failed to get document "${id}" from "${this.collectionName}"`,
        { cause: err }
      );
    }
  }

  /**
 * Updates documents matching a query filter.
 *
 * Supports partial updates using update operators such as `$set`.
 *
 * Automatically updates the `_updatedAt` timestamp.
 *
 * @param filter - Query filter used to select matching documents
 * @param spec - Update specification describing document mutations
 * @returns Promise resolving to the number of updated documents
 *
 * @throws {ZerithDBError}
 * Thrown when the update operation fails.
 *
 * @example
 * ```typescript
 * await todos.update(
 *   { done: false },
 *   {
 *     $set: {
 *       done: true
 *     }
 *   }
 * );
 * ```
 */

  
  async update(filter: QueryFilter<T>, spec: UpdateSpec<T>): Promise<number> {
    try {
      const matches = await this.find(filter);
      const now = Date.now();

      await this.table.bulkPut(
        matches.map((doc) => ({
          ...doc,
          ...(spec.$set ?? {}),
          _updatedAt: now,
        }))
      );

      return matches.length;
    } catch (err) {
      throw new ZerithDBError(
        ErrorCode.DB_WRITE_FAILED,
        `Failed to update documents in "${this.collectionName}"`,
        { cause: err }
      );
    }
  }

  /**
 * Deletes documents matching a query filter.
 *
 * @param filter - Query filter used to select documents for deletion
 * @returns Promise resolving to the number of deleted documents
 *
 * @throws {ZerithDBError}
 * Thrown when the delete operation fails.
 *
 * @example
 * ```typescript
 * await todos.delete({
 *   done: true
 * });
 * ```
 */
  
  async delete(filter: QueryFilter<T>): Promise<number> {
    try {
      const matches = await this.find(filter);
      await this.table.bulkDelete(matches.map((d) => d._id));
      return matches.length;
    } catch (err) {
      throw new ZerithDBError(
        ErrorCode.DB_DELETE_FAILED,
        `Failed to delete documents from "${this.collectionName}"`,
        { cause: err }
      );
    }
  }

  /**
 * Deletes every document in the collection.
 *
 * @returns Promise resolving when the collection has been cleared
 *
 * @throws {ZerithDBError}
 * Thrown when the clear operation fails.
 *
 * @example
 * ```typescript
 * await todos.clearAll();
 * ```
 */
  
  async clearAll(): Promise<void> {
    try {
      await this.table.clear();
    } catch (err) {
      throw new ZerithDBError(
        ErrorCode.DB_DELETE_FAILED,
        `Failed to clear collection "${this.collectionName}"`,
        { cause: err }
      );
    }
  }

  /**
 * Counts documents matching a query filter.
 *
 * @param filter - Query filter used to count matching documents
 * @returns Promise resolving to the total number of matching documents
 *
 * @example
 * ```typescript
 * const completed = await todos.count({
 *   done: true
 * });
 * ```
 */
  
  async count(filter: QueryFilter<T> = {}): Promise<number> {
    const docs = await this.find(filter);
    return docs.length;
  }

  private matchesFilter(doc: Document<T>, filter: QueryFilter<T>): boolean {
    for (const [key, condition] of Object.entries(filter)) {
      const fieldValue = (doc as Record<string, any>)[key];

      if (condition === null || typeof condition !== "object") {
        if (fieldValue !== condition) return false;
        continue;
      }

      const ops = condition as Record<string, any>;
      if ("$eq" in ops && fieldValue !== ops["$eq"]) return false;
      if ("$ne" in ops && fieldValue === ops["$ne"]) return false;
      if ("$gt" in ops && !((fieldValue as any) > (ops["$gt"] as never))) return false;
      if ("$gte" in ops && !((fieldValue as any) >= (ops["$gte"] as never))) return false;
      if ("$lt" in ops && !((fieldValue as any) < (ops["$lt"] as never))) return false;
      if ("$lte" in ops && !((fieldValue as any) <= (ops["$lte"] as never))) return false;
      if ("$in" in ops && !(ops["$in"] as unknown[]).includes(fieldValue)) return false;
      if ("$nin" in ops && (ops["$nin"] as unknown[]).includes(fieldValue)) return false;
    }
    return true;
  }
}

class ZerithDBDexie extends Dexie {
  private readonly tableMap = new Map<string, Table>();

  constructor(appId: string) {
    super(`zerithdb_${appId}`);
  }

  ensureCollection(name: string): Table {
    if (!this.tableMap.has(name)) {
      // Dexie requires version upgrade to add tables — we use a dynamic schema pattern
      const version = (this.verno ?? 0) + 1;
      const existingTableNames = this.tableMap.keys();
      const schema: Record<string, string> = { [name]: "_id, _createdAt, _updatedAt" };
      for (const existingName of existingTableNames) {
        schema[existingName] = "_id, _createdAt, _updatedAt";
      }
      this.version(version).stores(schema);
      this.tableMap.set(name, this.table(name));
    }
    // biome-ignore lint: map guarantees this is defined
    return this.tableMap.get(name)!;
  }
}

/**
 * Internal database client. Wraps Dexie and manages collection instances.
 * Use via {@link ZerithDBApp.db} — not instantiated directly.
 */
export class DbClient {
  private readonly dexie: ZerithDBDexie;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly collections = new Map<string, CollectionClient<any>>();

  constructor(config: ZerithDBConfig) {
    this.dexie = new ZerithDBDexie(config.appId);
  }

  collection<T extends Record<string, any>>(name: string): CollectionClient<T> {
    if (!this.collections.has(name)) {
      const table = this.dexie.ensureCollection(name);
      this.collections.set(name, new CollectionClient<T>(table as Table<Document<T>>, name));
    }
    return this.collections.get(name) as CollectionClient<T>;
  }

  async dispose(): Promise<void> {
    this.dexie.close();
  }
}
