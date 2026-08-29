# 1단계 쇼핑몰 구현·배포 계획

## 요약

- 빈 저장소에 무거운 프레임워크 없이 Cloudflare Worker(JavaScript), 정적 HTML/CSS/JS, D1으로 구현한다.
- 범위는 상품 목록·상세·장바구니·주문 완료뿐이다. 회원, 로그인, 결제, 검색, 리뷰 등은 제외한다.
- Cloudflare 작업은 Wrangler CLI만 사용하고 GitHub는 Git CLI만 사용한다.

## 기준 문서 보완

- `SHOP.md`에 승인된 익명 세션 규칙을 추가한다.
  - HttpOnly·SameSite=Lax 임의 세션 쿠키로 방문자를 구분한다.
  - `cart_items`와 `orders`는 1단계에서 `session_id`로 소유권을 확인한다.
  - 같은 상품을 다시 담으면 수량을 합산하고, 99 초과 요청은 기존 수량을 유지한 채 거절한다.
  - 주문 생성·상품 가격 복사·장바구니 비우기는 하나의 D1 batch로 원자 처리한다.
- `DESIGN.md`의 승인된 빈칸을 채운다.
  - Google Fonts `Noto Sans KR`, 크기 12·14·16·18·20·24·32px, 굵기 400·700, 행간·자간 `normal`
  - 목록 이미지 180×180px, 상세 이미지 420×420px
  - 900×33px 가로 분류 띠: `전체`와 네 분류를 180px씩 배치
  - 목록·상세 헤더 99px, 장바구니·주문 완료 헤더 75px, `상품`·`장바구니` 텍스트 링크만 표시
  - 활성 담기 버튼은 548×33px, 활성 주문 버튼은 323×55px의 파란 외곽선 스타일
  - 키보드 초점은 3px `#4269F6` 외곽선
- `AGENTS.md`와 `references/`는 수정하지 않는다. `*_수정본.md`는 기준으로 사용하지 않고 기존 내용 그대로 보존한다.

## 구현

- 고정 데스크톱 레이아웃으로 참고 치수를 맞추며, 좁은 화면에서는 재배치하지 않고 가로 스크롤만 허용한다.
- 화면 경로는 `/`, `/products/:id`, `/cart`, `/orders/:id`로 구성한다.
- API는 다음으로 고정한다.
  - `GET /api/products?category=` 및 `GET /api/products/:id`
  - `GET /api/cart`
  - `POST /api/cart` — `{ productId, qty }`
  - `PATCH /api/cart/:productId` — `{ qty }`
  - `DELETE /api/cart/:productId`
  - `POST /api/orders`
  - `GET /api/orders/:id` — 동일 익명 세션의 주문만 반환
- D1에는 `products`, `cart_items`, `orders`, `order_items`와 세션·주문 조회 인덱스를 만들고, 8개 상품을 migration에서 시드한다. 가격과 합계는 서버에서만 계산하며 `order_items.price`에 주문 시점 가격을 저장한다.
- 상품 이미지는 `public/products/`로 원본 그대로 복사하고 모든 위치에서 정사각형 래퍼와 `object-fit: contain`을 사용한다.
- 참고 화면과의 의도된 차이는 다음으로 제한한다.
  - 목록: 로고·검색·사이드바·배너를 제거하고 필수 분류 기능을 가로 띠로 옮긴다.
  - 상세: 리뷰·별점·옵션 상품군·배송 배지·찜·공유·고정 장바구니를 제거한다.
  - 장바구니: 재고 경고·선택 체크박스·배송비·쿠폰·할인·결제 단계를 제거한다.
  - 주문 완료: 별도 참고 화면이 없으므로 장바구니의 카드·제목·상품 행 스타일만 재사용한다.

## 검증

- Node 테스트와 로컬 D1로 상품 8개, 분류별 2개, 수량 1/99 경계, 재담기 합산, 99 초과 거절, 삭제와 합계를 확인한다.
- 서로 다른 두 익명 쿠키의 장바구니·주문이 섞이지 않는지 확인한다.
- 주문 성공 시 저장 합계와 화면 합계가 같고, 가격 스냅샷이 남으며, 장바구니가 비워지는지 확인한다.
- 설치된 headless Chrome으로 세 참고 해상도에서 캡처해 나란히 비교하고 콘솔 오류를 검사한다.
- CSS의 모든 색이 `DESIGN.md` 팔레트 안에 있는지, 외부 이미지 URL과 제외 기능이 없는지 검사한다.
- 배포 후 공개 URL에서 목록→상세→담기→수량 변경→주문 완료 흐름을 다시 실행한다.

## GitHub와 Cloudflare

1. `npx.cmd -y wrangler login`을 실행하고 사용자가 열린 브라우저에서 로그인·허용한다.
2. `npx.cmd -y wrangler d1 create shop-db`로 D1을 만들고 반환된 ID를 `wrangler.jsonc`의 `DB` binding에 기록한다.
3. 로컬 migration과 전체 테스트를 완료한다.
4. Git을 `main`으로 초기화하고 작성자를 `leeeunjik2 <leeeunjik2@users.noreply.github.com>`으로 저장소 로컬 설정한다.
5. `origin`을 `https://github.com/leeeunjik2/shop.git`으로 연결하고 `Build stage 1 Cloudflare shop` 커밋을 push한다. 저장소는 현재 비어 있음을 확인했다.
6. `npx.cmd -y wrangler d1 migrations apply shop-db --remote`로 원격 스키마와 상품을 적용한다.
7. `npx.cmd -y wrangler deploy`로 `shop` Worker를 배포한다.
8. 공개 주소를 검증하고 URL, D1 적용 결과, Git 커밋을 보고한다.

Cloudflare 이름 충돌, 계정 권한 부족, GitHub 인증 실패가 발생하면 임의의 다른 계정·이름·저장소를 사용하지 않고 중단해 보고한다. 상품 이미지는 `references/README.md`에 따라 교육용 데모로만 배포한다.
