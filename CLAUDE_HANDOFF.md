# 상무옥 예약관리 인수인계

## 실행 환경

- GitHub: `sul-lq/sangmuok`
- Pages: `https://sul-lq.github.io/sangmuok/`
- Supabase project ref: `gzefmhkiiahgboelmfmt`
- 프런트엔드: 정적 `index.html`
- 데이터 계층: `supabase-store.js`

## 배포

1. 정적 파일 문법을 확인합니다.
2. GitHub `main` 브랜치에 푸시하면 Pages가 자동 배포됩니다.
3. DB 변경은 `npx supabase db push`를 사용합니다.
4. Edge Function은 아래 명령으로 배포합니다.

```bash
npx supabase functions deploy push-notification --project-ref gzefmhkiiahgboelmfmt
```

## 백그라운드 알림

- 구독 테이블: `public.push_subscriptions`
- 마이그레이션: `supabase/migrations/20260611010000_push_subscriptions.sql`
- 함수: `supabase/functions/push-notification/index.ts`
- Supabase Secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
- 개인키를 Git 또는 브라우저 코드에 추가하지 않습니다.
- 브라우저가 열려 있을 때 선택 알림음이 재생됩니다.
- 앱 종료 상태에서는 Web Push가 동작하며 소리는 운영체제 알림 설정을 따릅니다.

## 주요 동작

- 예약톡 알림 켜기/끄기와 알림음 선택은 사용자 브라우저에 저장됩니다.
- 배치도는 오전/오후를 분리합니다.
- 같은 예약 시간은 같은 색, `1차/2차`는 서로 다른 색입니다.
- 배치도 슬라이드에서 날짜를 선택할 수 있습니다.
- 테이블을 누르면 선택 시간대 예약 목록이 열리고 바로 배정할 수 있습니다.
- 테이블 지정률이 70% 이상인 날짜·시간대에 새 예약이 생기면 위험 알림을 표시합니다.
- `오전 12시`는 정오 `12:00`으로 처리합니다.
- 예약톡 메시지 삭제 시 연결 예약 취소 여부를 확인하고 취소하면 시스템 메시지를 남깁니다.

## 작업 원칙

- 기존 예약·메시지 데이터와 RLS 정책을 유지합니다.
- Publishable key만 브라우저에 둡니다.
- 수정 후 GitHub Pages까지 즉시 배포합니다.
