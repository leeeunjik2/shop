PRAGMA foreign_keys = ON;
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
INSERT INTO categories (id,name) VALUES (1,'잡화'),(2,'뷰티'),(3,'신발'),(4,'식품');
ALTER TABLE products ADD COLUMN category_id INTEGER;
UPDATE products SET category_id=(SELECT id FROM categories WHERE categories.name=products.category);
CREATE TABLE products_new (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  price INTEGER NOT NULL CHECK(price>=0),
  description TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  image_url TEXT NOT NULL
);
INSERT INTO products_new(id,name,price,description,category_id,image_url)
  SELECT id,name,price,description,category_id,image_url FROM products;
DROP TABLE products;
ALTER TABLE products_new RENAME TO products;
CREATE INDEX idx_products_category_id ON products(category_id);
