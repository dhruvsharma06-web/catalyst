import type {
  Activity,
  Appointment,
  CircleRecord,
  DoseLog,
  Medication,
  Member,
  Membership,
  Notification,
  UserRecord,
} from "../domain/types.js";

export type Filter<T> = { field: keyof T & string; op: "==" | ">=" | "<="; value: string | number | boolean };

export interface ListOptions<T> {
  where?: Filter<T>[];
  orderBy?: { field: keyof T & string; direction: "asc" | "desc" };
  limit?: number;
}

/** A collection of documents that belongs to one care circle. */
export interface CircleCollection<T extends { id: string }> {
  list(circleId: string, options?: ListOptions<T>): Promise<T[]>;
  get(circleId: string, id: string): Promise<T | null>;
  /** Creates or replaces a document. */
  put(circleId: string, doc: T): Promise<T>;
  delete(circleId: string, id: string): Promise<boolean>;
}

export interface CircleRepo {
  create(circle: CircleRecord): Promise<void>;
  get(id: string): Promise<CircleRecord | null>;
  findByCode(code: string): Promise<CircleRecord | null>;
  update(id: string, patch: Partial<Omit<CircleRecord, "id">>): Promise<void>;
  listIds(): Promise<string[]>;
}

export interface UserRepo {
  /** Creates the account; returns false when the email is already registered. */
  create(user: UserRecord): Promise<boolean>;
  get(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  update(id: string, patch: Partial<Omit<UserRecord, "id" | "email">>): Promise<void>;
  /** The user's circle memberships (an index kept alongside circle members). */
  memberships: {
    list(userId: string): Promise<Membership[]>;
    put(userId: string, membership: Membership): Promise<void>;
    delete(userId: string, circleId: string): Promise<void>;
  };
}

export interface Store {
  users: UserRepo;
  circles: CircleRepo;
  members: CircleCollection<Member>;
  medications: CircleCollection<Medication>;
  doseLogs: CircleCollection<DoseLog>;
  appointments: CircleCollection<Appointment>;
  activity: CircleCollection<Activity>;
  notifications: CircleCollection<Notification>;
  /** Exactly-once guard for reminders: true only for the first caller to claim `key`. */
  claimReminder(circleId: string, key: string): Promise<boolean>;
  releaseReminder(circleId: string, key: string): Promise<void>;
  /** Atomically increments a named counter in `scope` (a circle or account id) and returns the new value. */
  increment(scope: string, key: string): Promise<number>;
  /** Reads a counter without changing it (0 when unset). */
  peek(scope: string, key: string): Promise<number>;
  /** Reports whether the backing store is reachable (used by /ready). */
  ping(): Promise<boolean>;
}
