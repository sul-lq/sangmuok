# 상무옥 예약관리

GitHub 원본 `index.html`을 기반으로 한 예약·메신저 PWA입니다.

## 구성

- `index.html`: 예약표, 배치도, 예약톡 화면
- `manifest.json`, `service-worker.js`: PWA 설정
- `supabase-store.js`: 인증, 예약, 채팅, 실시간 동기화
- `supabase-config.js`: 공개 Supabase 클라이언트 설정
- `supabase/migrations`: 예약·채팅·직원 DB 스키마와 RLS

## Supabase

프로젝트 URL:

```text
https://gzefmhkiiahgboelmfmt.supabase.co
```

설정 순서는 [supabase/README.md](supabase/README.md)를 참고합니다.
