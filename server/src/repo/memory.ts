import type { CircleRecord, Membership, UserRecord } from "../domain/types.js";
import type { CircleCollection, CircleRepo, ListOptions, Store, UserRepo } from "./types.js";

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

class MemoryCollection<T extends { id: string }> implements CircleCollection<T> {
  private readonly data = new Map<string, Map<string, T>>();

  private bucket(circleId: string): Map<string, T> {
    let b = this.data.get(circleId);
    if (!b) {
      b = new Map();
      this.data.set(circleId, b);
    }
    return b;
  }

  async list(circleId: string, options: ListOptions<T> = {}): Promise<T[]> {
    let rows = [...this.bucket(circleId).values()];
    for (const f of options.where ?? []) {
      rows = rows.filter((r) => {
        const v = r[f.field] as unknown;
        if (f.op === "==") return v === f.value;
        return f.op === ">=" ? compare(v, f.value) >= 0 : compare(v, f.value) <= 0;
      });
    }
    if (options.orderBy) {
      const { field, direction } = options.orderBy;
      rows.sort((a, b) => compare(a[field], b[field]) * (direction === "asc" ? 1 : -1));
    }
    return structuredClone(options.limit ? rows.slice(0, options.limit) : rows);
  }

  async get(circleId: string, id: string): Promise<T | null> {
    const doc = this.bucket(circleId).get(id);
    return doc ? structuredClone(doc) : null;
  }

  async put(circleId: string, doc: T): Promise<T> {
    this.bucket(circleId).set(doc.id, structuredClone(doc));
    return doc;
  }

  async delete(circleId: string, id: string): Promise<boolean> {
    return this.bucket(circleId).delete(id);
  }
}

class MemoryCircles implements CircleRepo {
  private readonly byId = new Map<string, CircleRecord>();

  async create(circle: CircleRecord): Promise<void> {
    this.byId.set(circle.id, structuredClone(circle));
  }
  async get(id: string): Promise<CircleRecord | null> {
    const c = this.byId.get(id);
    return c ? structuredClone(c) : null;
  }
  async findByCode(code: string): Promise<CircleRecord | null> {
    for (const c of this.byId.values()) if (c.code === code) return structuredClone(c);
    return null;
  }
  async update(id: string, patch: Partial<Omit<CircleRecord, "id">>): Promise<void> {
    const c = this.byId.get(id);
    if (c) this.byId.set(id, { ...c, ...patch });
  }
  async listIds(): Promise<string[]> {
    return [...this.byId.keys()];
  }
}

class MemoryUsers implements UserRepo {
  private readonly byId = new Map<string, UserRecord>();
  private readonly links = new Map<string, Map<string, Membership>>();

  async create(user: UserRecord): Promise<boolean> {
    if (await this.findByEmail(user.email)) return false;
    this.byId.set(user.id, structuredClone(user));
    return true;
  }
  async get(id: string): Promise<UserRecord | null> {
    const u = this.byId.get(id);
    return u ? structuredClone(u) : null;
  }
  async findByEmail(email: string): Promise<UserRecord | null> {
    for (const u of this.byId.values()) if (u.email === email) return structuredClone(u);
    return null;
  }
  async update(id: string, patch: Partial<Omit<UserRecord, "id" | "email">>): Promise<void> {
    const u = this.byId.get(id);
    if (u) this.byId.set(id, { ...u, ...patch });
  }
  readonly memberships = {
    list: async (userId: string): Promise<Membership[]> => [...(this.links.get(userId)?.values() ?? [])].map((m) => ({ ...m })),
    put: async (userId: string, membership: Membership): Promise<void> => {
      const forUser = this.links.get(userId) ?? new Map<string, Membership>();
      forUser.set(membership.id, { ...membership });
      this.links.set(userId, forUser);
    },
    delete: async (userId: string, circleId: string): Promise<void> => {
      this.links.get(userId)?.delete(circleId);
    },
  };
}

/** In-process store for local development and tests. Data is lost on restart. */
export function createMemoryStore(): Store {
  const claims = new Set<string>();
  const counters = new Map<string, number>();
  return {
    users: new MemoryUsers(),
    circles: new MemoryCircles(),
    members: new MemoryCollection(),
    medications: new MemoryCollection(),
    doseLogs: new MemoryCollection(),
    appointments: new MemoryCollection(),
    activity: new MemoryCollection(),
    notifications: new MemoryCollection(),
    async claimReminder(circleId, key) {
      const k = `${circleId}/${key}`;
      if (claims.has(k)) return false;
      claims.add(k);
      return true;
    },
    async releaseReminder(circleId, key) {
      claims.delete(`${circleId}/${key}`);
    },
    async increment(scope, key) {
      const k = `${scope}/${key}`;
      const next = (counters.get(k) ?? 0) + 1;
      counters.set(k, next);
      return next;
    },
    async peek(scope, key) {
      return counters.get(`${scope}/${key}`) ?? 0;
    },
    async ping() {
      return true;
    },
  };
}
