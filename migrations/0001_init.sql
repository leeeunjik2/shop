PRAGMA foreign_keys = ON;
CREATE TABLE products (id INTEGER PRIMARY KEY,name TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>=0),description TEXT NOT NULL,category TEXT NOT NULL CHECK(category IN ('잡화','뷰티','신발','식품')),image_url TEXT NOT NULL);
CREATE TABLE cart_items (id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT NOT NULL,product_id INTEGER NOT NULL,qty INTEGER NOT NULL CHECK(qty BETWEEN 1 AND 99),FOREIGN KEY(product_id) REFERENCES products(id),UNIQUE(session_id,product_id));
CREATE TABLE orders (id TEXT PRIMARY KEY,session_id TEXT NOT NULL,total INTEGER NOT NULL CHECK(total>=0),status TEXT NOT NULL CHECK(status IN ('pending','paid')),created_at TEXT NOT NULL);
CREATE TABLE order_items (id INTEGER PRIMARY KEY AUTOINCREMENT,order_id TEXT NOT NULL,product_id INTEGER NOT NULL,qty INTEGER NOT NULL CHECK(qty BETWEEN 1 AND 99),price INTEGER NOT NULL CHECK(price>=0),FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,FOREIGN KEY(product_id) REFERENCES products(id),UNIQUE(order_id,product_id));
CREATE INDEX idx_cart_items_session_id ON cart_items(session_id);
CREATE INDEX idx_orders_session_id ON orders(session_id);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
INSERT INTO products VALUES
(1,'미니멀 토트백',89000,'각을 잡은 검정 가죽 토트백','잡화','/products/bag.jpg'),
(2,'클래식 손목시계',145000,'큰 문자판에 검정 가죽 밴드','잡화','/products/watch.jpg'),
(3,'시트러스 오드뚜왈렛',78000,'상쾌한 시트러스 계열 향수','뷰티','/products/perfume.jpg'),
(4,'매트 레드 립스틱',32000,'발색이 선명한 매트 타입','뷰티','/products/lipstick.jpg'),
(5,'러닝화 블루',112000,'쿠션감이 좋은 남성 러닝화','신발','/products/shoe.jpg'),
(6,'러닝화 핑크',112000,'같은 모델의 여성 러닝화','신발','/products/shoe2.jpg'),
(7,'레드와인 피노타지',42000,'남아프리카산 드라이 레드 와인','식품','/products/wine.jpg'),
(8,'이탈리아 파스타 면',6500,'듀럼밀 100% 파스타 면 450g','식품','/products/pasta.jpg');
