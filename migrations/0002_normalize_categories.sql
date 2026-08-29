PRAGMA foreign_keys = ON;
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
INSERT INTO categories (id,name) VALUES (1,'잡화'),(2,'뷰티'),(3,'신발'),(4,'식품');
ALTER TABLE products ADD COLUMN category_id INTEGER;
UPDATE products SET category_id=(SELECT id FROM categories WHERE categories.name=products.category);
CREATE INDEX idx_products_category_id ON products(category_id);
