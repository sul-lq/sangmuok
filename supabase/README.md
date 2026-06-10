# Supabase 설정

프로젝트: `gzefmhkiiahgboelmfmt`

`migrations/20260610010000_initial_schema.sql`은 기존 예약 2건과 메시지
1건을 보존한 채 적용되었습니다.

## 직원 계정

Authentication에서 직원 계정을 생성합니다.

- 이메일: `{로그인 아이디}@sangmuok.local`
- 비밀번호: 앱 로그인 비밀번호
- 사용자 메타데이터: `{ "display_name": "직원명" }`

앱에서는 이메일 전체 대신 앞부분인 로그인 아이디만 입력할 수 있습니다.

## 구성 파일

브라우저에서 사용 가능한 Publishable key만
`supabase-config.js`에 저장합니다.

`service_role` 또는 secret key는 브라우저 코드에 넣지 않습니다.
