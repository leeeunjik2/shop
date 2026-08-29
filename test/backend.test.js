import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import worker from "../src/worker.js";

const migrationSql = ["0001_init.sql", "0002_normalize_categories.sql"]
  .map((file) => readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"))
  .join("\n");

class TestD1PreparedStatement {
  constructor(owner, sql, bindings = []) {
    this.owner = owner;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new TestD1PreparedStatement(this.owner, this.sql, bindings);
  }

  async all() {
    const results = this.owner.database
      .prepare(this.sql)
      .all(...this.bindings);
    return { success: true, results, meta: { changes: 0 } };
  }

  async first(columnName = undefined) {
    const row = this.owner.database
      .prepare(this.sql)
      .get(...this.bindings);
    if (!row) return null;
    return columnName === undefined ? row : (row[columnName] ?? null);
  }

  async run() {
    return this.runSync();
  }

  runSync() {
    const result = this.owner.database
      .prepare(this.sql)
      .run(...this.bindings);
    return {
      success: true,
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }
}

class TestD1Database {
  constructor() {
    this.database = new DatabaseSync(":memory:");
    this.database.exec("PRAGMA foreign_keys = ON");
    this.database.exec(migrationSql);
    this.batchCallSizes = [];
  }

  prepare(sql) {
    return new TestD1PreparedStatement(this, sql);
  }

  async batch(statements) {
    this.batchCallSizes.push(statements.length);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement.runSync());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.database.close();
  }
}

function createEnvironment() {
  return {
    DB: new TestD1Database(),
    ASSETS: {
      fetch: async () => new Response("asset response"),
    },
  };
}

async function callApi(env, path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.cookie) headers.set("Cookie", options.cookie);

  let body;
  if (options.body !== undefined) {
    headers.set("Content-Type", options.contentType || "application/json");
    body =
      typeof options.body === "string"
        ? options.body
        : JSON.stringify(options.body);
  }

  const response = await worker.fetch(
    new Request(`https://shop.example${path}`, {
      method: options.method || "GET",
      headers,
      body,
    }),
    env,
  );

  const payload = response.headers
    .get("Content-Type")
    ?.startsWith("application/json")
    ? await response.json()
    : await response.text();

  return { response, payload };
}

function cookieFrom(response) {
  const setCookie = response.headers.get("Set-Cookie");
  assert.ok(setCookie, "a new anonymous session cookie should be set");
  return setCookie.split(";", 1)[0];
}

test("products API returns the exact eight seeded products and category pairs", async (t) => {
  const env = createEnvironment();
  t.after(() => env.DB.close());

  const { response, payload } = await callApi(env, "/api/products");
  assert.equal(response.status, 200);
  assert.equal(payload.products.length, 8);
  assert.deepEqual(
    payload.products.map(({ name, price, category, imageUrl }) => ({
      name,
      price,
      category,
      imageUrl,
    })),
    [
      { name: "미니멀 토트백", price: 89000, category: "잡화", imageUrl: "/products/bag.jpg" },
      { name: "클래식 손목시계", price: 145000, category: "잡화", imageUrl: "/products/watch.jpg" },
      { name: "시트러스 오드뚜왈렛", price: 78000, category: "뷰티", imageUrl: "/products/perfume.jpg" },
      { name: "매트 레드 립스틱", price: 32000, category: "뷰티", imageUrl: "/products/lipstick.jpg" },
      { name: "러닝화 블루", price: 112000, category: "신발", imageUrl: "/products/shoe.jpg" },
      { name: "러닝화 핑크", price: 112000, category: "신발", imageUrl: "/products/shoe2.jpg" },
      { name: "레드와인 피노타지", price: 42000, category: "식품", imageUrl: "/products/wine.jpg" },
      { name: "이탈리아 파스타 면", price: 6500, category: "식품", imageUrl: "/products/pasta.jpg" },
    ],
  );

  for (const category of ["잡화", "뷰티", "신발", "식품"]) {
    const filtered = await callApi(
      env,
      `/api/products?category=${encodeURIComponent(category)}`,
    );
    assert.equal(filtered.response.status, 200);
    assert.equal(filtered.payload.products.length, 2);
    assert.ok(filtered.payload.products.every((item) => item.category === category));
  }

  const invalid = await callApi(env, "/api/products?category=없는분류");
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.payload.error.code, "invalid_category");
});

test("cart merges quantities atomically and preserves 99 when an add would overflow", async (t) => {
  const env = createEnvironment();
  t.after(() => env.DB.close());

  const initial = await callApi(env, "/api/cart");
  assert.equal(initial.response.status, 200);
  assert.deepEqual(initial.payload, { items: [], total: 0 });
  const setCookie = initial.response.headers.get("Set-Cookie");
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Secure/);
  const cookie = cookieFrom(initial.response);

  let result = await callApi(env, "/api/cart", {
    method: "POST",
    cookie,
    body: { productId: 1, qty: 98 },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.payload.items[0].qty, 98);

  result = await callApi(env, "/api/cart", {
    method: "POST",
    cookie,
    body: { productId: 1, qty: 1 },
  });
  assert.equal(result.payload.items[0].qty, 99);

  result = await callApi(env, "/api/cart", {
    method: "POST",
    cookie,
    body: { productId: 1, qty: 1 },
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, "quantity_limit_exceeded");

  result = await callApi(env, "/api/cart", { cookie });
  assert.equal(result.payload.items[0].qty, 99);
  assert.equal(result.payload.total, 99 * 89000);

  const tooLow = await callApi(env, "/api/cart/1", {
    method: "PATCH",
    cookie,
    body: { qty: 0 },
  });
  assert.equal(tooLow.response.status, 400);

  const tooHigh = await callApi(env, "/api/cart/1", {
    method: "PATCH",
    cookie,
    body: { qty: 100 },
  });
  assert.equal(tooHigh.response.status, 400);

  const unchanged = await callApi(env, "/api/cart", { cookie });
  assert.equal(unchanged.payload.items[0].qty, 99);
});

test("cart totals, updates, deletes, and anonymous sessions stay isolated", async (t) => {
  const env = createEnvironment();
  t.after(() => env.DB.close());

  const sessionA = await callApi(env, "/api/cart");
  const cookieA = cookieFrom(sessionA.response);
  const sessionB = await callApi(env, "/api/cart");
  const cookieB = cookieFrom(sessionB.response);
  assert.notEqual(cookieA, cookieB);

  await callApi(env, "/api/cart", {
    method: "POST",
    cookie: cookieA,
    body: { productId: 1, qty: 2 },
  });
  await callApi(env, "/api/cart", {
    method: "POST",
    cookie: cookieA,
    body: { productId: 8, qty: 3 },
  });

  let cartA = await callApi(env, "/api/cart", { cookie: cookieA });
  assert.equal(cartA.payload.total, 2 * 89000 + 3 * 6500);
  assert.equal(cartA.payload.items.length, 2);

  const cartB = await callApi(env, "/api/cart", { cookie: cookieB });
  assert.deepEqual(cartB.payload, { items: [], total: 0 });

  cartA = await callApi(env, "/api/cart/8", {
    method: "PATCH",
    cookie: cookieA,
    body: { qty: 1 },
  });
  assert.equal(cartA.payload.total, 2 * 89000 + 6500);

  cartA = await callApi(env, "/api/cart/1", {
    method: "DELETE",
    cookie: cookieA,
  });
  assert.equal(cartA.payload.total, 6500);
  assert.deepEqual(cartA.payload.items.map((item) => item.productId), [8]);

  const missingDelete = await callApi(env, "/api/cart/1", {
    method: "DELETE",
    cookie: cookieA,
  });
  assert.equal(missingDelete.response.status, 404);
});

test("order creation snapshots prices, empties the cart in one batch, and protects ownership", async (t) => {
  const env = createEnvironment();
  t.after(() => env.DB.close());

  const responseA = await callApi(env, "/api/cart");
  const cookieA = cookieFrom(responseA.response);
  const responseB = await callApi(env, "/api/cart");
  const cookieB = cookieFrom(responseB.response);

  await callApi(env, "/api/cart", {
    method: "POST",
    cookie: cookieA,
    body: { productId: 1, qty: 2 },
  });
  await callApi(env, "/api/cart", {
    method: "POST",
    cookie: cookieA,
    body: { productId: 7, qty: 3 },
  });

  const created = await callApi(env, "/api/orders", {
    method: "POST",
    cookie: cookieA,
  });
  assert.equal(created.response.status, 201);
  assert.match(created.payload.order.id, /^[0-9a-f-]{36}$/);
  assert.equal(created.payload.order.status, "pending");
  assert.equal(created.payload.order.total, 2 * 89000 + 3 * 42000);
  assert.deepEqual(env.DB.batchCallSizes, [3]);

  const ownOrders = await callApi(env, "/api/orders", { cookie: cookieA });
  assert.equal(ownOrders.response.status, 200);
  assert.equal(ownOrders.payload.orders.length, 1);
  const otherOrders = await callApi(env, "/api/orders", { cookie: cookieB });
  assert.deepEqual(otherOrders.payload.orders, []);

  const cartAfterOrder = await callApi(env, "/api/cart", { cookie: cookieA });
  assert.deepEqual(cartAfterOrder.payload, { items: [], total: 0 });

  await env.DB.prepare("UPDATE products SET price = 1 WHERE id = 1").run();
  const ownOrder = await callApi(
    env,
    `/api/orders/${created.payload.order.id}`,
    { cookie: cookieA },
  );
  assert.equal(ownOrder.response.status, 200);
  assert.equal(ownOrder.payload.order.total, 304000);
  assert.equal(
    ownOrder.payload.order.items.find((item) => item.productId === 1).price,
    89000,
  );

  const otherSessionOrder = await callApi(
    env,
    `/api/orders/${created.payload.order.id}`,
    { cookie: cookieB },
  );
  assert.equal(otherSessionOrder.response.status, 404);
  assert.equal(otherSessionOrder.payload.error.code, "order_not_found");

  const emptyOrder = await callApi(env, "/api/orders", {
    method: "POST",
    cookie: cookieA,
  });
  assert.equal(emptyOrder.response.status, 409);
  assert.equal(emptyOrder.payload.error.code, "cart_empty");
});

test("API validation rejects malformed bodies and missing records without changing state", async (t) => {
  const env = createEnvironment();
  t.after(() => env.DB.close());

  const initial = await callApi(env, "/api/cart");
  const cookie = cookieFrom(initial.response);

  const malformed = await callApi(env, "/api/cart", {
    method: "POST",
    cookie,
    body: "{not json",
  });
  assert.equal(malformed.response.status, 400);
  assert.equal(malformed.payload.error.code, "invalid_json");

  const wrongType = await callApi(env, "/api/cart", {
    method: "POST",
    cookie,
    body: { productId: "1", qty: 1 },
  });
  assert.equal(wrongType.response.status, 400);

  const missingProduct = await callApi(env, "/api/cart", {
    method: "POST",
    cookie,
    body: { productId: 999, qty: 1 },
  });
  assert.equal(missingProduct.response.status, 404);

  const cart = await callApi(env, "/api/cart", { cookie });
  assert.deepEqual(cart.payload, { items: [], total: 0 });

  const method = await callApi(env, "/api/products", { method: "POST" });
  assert.equal(method.response.status, 405);
  assert.equal(method.response.headers.get("Allow"), "GET");

  const asset = await callApi(env, "/products/bag.jpg");
  assert.equal(asset.response.status, 200);
  assert.equal(asset.payload, "asset response");
});

test("schema is normalized around category foreign keys", async (t) => {
  const env = createEnvironment();
  t.after(() => env.DB.close());
  const columns = env.DB.database.prepare("PRAGMA table_info(products)").all();
  assert.ok(columns.some((c) => c.name === "category_id"));
  assert.equal(columns.some((c) => c.name === "category"), false);
  const fk = env.DB.database.prepare("PRAGMA foreign_key_list(products)").all();
  assert.ok(fk.some((f) => f.table === "categories" && f.from === "category_id"));
  const indexes = env.DB.database.prepare("PRAGMA index_list(products)").all();
  assert.ok(indexes.some((i) => i.name === "idx_products_category_id"));
});
