import { createHash } from "node:crypto";
import { FieldValue, Firestore, type Query } from "@google-cloud/firestore";
import type { CircleRecord, Membership, UserRecord } from "../domain/types.js";
import type { CircleCollection, CircleRepo, ListOptions, Store, UserRepo } from "./types.js";

/** gRPC status code Firestore returns when create() targets an existing document. */
const ALREADY_EXISTS = 6;

/** Firestore document ids may not contain "/" — hash arbitrary keys into safe ids. */
const safeId = (key: string) => createHash("sha256").update(key).digest("hex").slice(0, 40);

class FirestoreCollection<T extends { id: string }> implements CircleCollection<T> {
  constructor(
    private readonly db: Firestore,
    private readonly name: string,
  ) {}

  private col(circleId: string) {
    return this.db.collection("circles").doc(circleId).collection(this.name);
  }

  async list(circleId: string, options: ListOptions<T> = {}): Promise<T[]> {
    let q: Query = this.col(circleId);
    for (const f of options.where ?? []) q = q.where(f.field, f.op, f.value);
    if (options.orderBy) q = q.orderBy(options.orderBy.field, options.orderBy.direction);
    if (options.limit) q = q.limit(options.limit);
    const snap = await q.get();
    return snap.docs.map((d) => d.data() as T);
  }

  async get(circleId: string, id: string): Promise<T | null> {
    const snap = await this.col(circleId).doc(id).get();
    return snap.exists ? (snap.data() as T) : null;
  }

  async put(circleId: string, doc: T): Promise<T> {
    await this.col(circleId).doc(doc.id).set(doc);
    return doc;
  }

  async delete(circleId: string, id: string): Promise<boolean> {
    const ref = this.col(circleId).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return false;
    await ref.delete();
    return true;
  }
}

class FirestoreCircles implements CircleRepo {
  constructor(private readonly db: Firestore) {}

  async create(circle: CircleRecord): Promise<void> {
    await this.db.collection("circles").doc(circle.id).create(circle);
  }
  async get(id: string): Promise<CircleRecord | null> {
    const snap = await this.db.collection("circles").doc(id).get();
    return snap.exists ? (snap.data() as CircleRecord) : null;
  }
  async findByCode(code: string): Promise<CircleRecord | null> {
    const snap = await this.db.collection("circles").where("code", "==", code).limit(1).get();
    return snap.empty ? null : (snap.docs[0]!.data() as CircleRecord);
  }
  async update(id: string, patch: Partial<Omit<CircleRecord, "id">>): Promise<void> {
    await this.db.collection("circles").doc(id).update(patch);
  }
  async listIds(): Promise<string[]> {
    // select() with no fields lists existing documents only, without reading their data.
    const snap = await this.db.collection("circles").select().get();
    return snap.docs.map((d) => d.id);
  }
}

class FirestoreUsers implements UserRepo {
  constructor(private readonly db: Firestore) {}

  /** Email uniqueness is enforced by creating `userEmails/{hash}` and the user in one transaction. */
  async create(user: UserRecord): Promise<boolean> {
    const emailRef = this.db.collection("userEmails").doc(safeId(user.email));
    const userRef = this.db.collection("users").doc(user.id);
    try {
      await this.db.runTransaction(async (tx) => {
        tx.create(emailRef, { userId: user.id });
        tx.create(userRef, user);
      });
      return true;
    } catch (err) {
      if ((err as { code?: number }).code === ALREADY_EXISTS) return false;
      throw err;
    }
  }
  async get(id: string): Promise<UserRecord | null> {
    const snap = await this.db.collection("users").doc(id).get();
    return snap.exists ? (snap.data() as UserRecord) : null;
  }
  async findByEmail(email: string): Promise<UserRecord | null> {
    const link = await this.db.collection("userEmails").doc(safeId(email)).get();
    const userId = link.exists ? (link.get("userId") as string) : null;
    return userId ? this.get(userId) : null;
  }
  async update(id: string, patch: Partial<Omit<UserRecord, "id" | "email">>): Promise<void> {
    await this.db.collection("users").doc(id).update(patch);
  }
  readonly memberships = {
    list: async (userId: string): Promise<Membership[]> => {
      const snap = await this.db.collection("users").doc(userId).collection("circles").get();
      return snap.docs.map((d) => d.data() as Membership);
    },
    put: async (userId: string, membership: Membership): Promise<void> => {
      await this.db.collection("users").doc(userId).collection("circles").doc(membership.id).set(membership);
    },
    delete: async (userId: string, circleId: string): Promise<void> => {
      await this.db.collection("users").doc(userId).collection("circles").doc(circleId).delete();
    },
  };
}

export interface FirestoreCredentials {
  client_email: string;
  private_key: string;
}

/**
 * Google Cloud Firestore store. On Google Cloud it uses Application Default Credentials;
 * elsewhere (for example a serverless host) pass a service-account key explicitly.
 */
export function createFirestoreStore(projectId: string | undefined, databaseId: string, credentials?: FirestoreCredentials): Store {
  const db = new Firestore({ projectId, databaseId, ignoreUndefinedProperties: true, ...(credentials && { credentials }) });
  const sub = (circleId: string, name: string) => db.collection("circles").doc(circleId).collection(name);

  return {
    users: new FirestoreUsers(db),
    circles: new FirestoreCircles(db),
    members: new FirestoreCollection(db, "members"),
    medications: new FirestoreCollection(db, "medications"),
    doseLogs: new FirestoreCollection(db, "doseLogs"),
    appointments: new FirestoreCollection(db, "appointments"),
    activity: new FirestoreCollection(db, "activity"),
    notifications: new FirestoreCollection(db, "notifications"),
    async claimReminder(circleId, key) {
      try {
        await sub(circleId, "reminderClaims").doc(safeId(key)).create({ key, at: new Date().toISOString() });
        return true;
      } catch (err) {
        if ((err as { code?: number }).code === ALREADY_EXISTS) return false;
        throw err;
      }
    },
    async releaseReminder(circleId, key) {
      await sub(circleId, "reminderClaims").doc(safeId(key)).delete();
    },
    async increment(scope, key) {
      const ref = db.collection("counters").doc(safeId(`${scope}/${key}`));
      await ref.set({ key, value: FieldValue.increment(1) }, { merge: true });
      const snap = await ref.get();
      return Number(snap.get("value") ?? 0);
    },
    async peek(scope, key) {
      const snap = await db.collection("counters").doc(safeId(`${scope}/${key}`)).get();
      return snap.exists ? Number(snap.get("value") ?? 0) : 0;
    },
    async ping() {
      try {
        await db.collection("circles").limit(1).get();
        return true;
      } catch {
        return false;
      }
    },
  };
}
