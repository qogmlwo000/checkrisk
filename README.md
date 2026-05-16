# Check Risk Tool

물류 현장(PACK / PICK)에서 마감시간(Exsd) 기준으로 리스크와 충원 권고를 실시간으로 확인하는 단일 페이지 도구입니다.

## 실행 방법
- 로컬에서 그냥 열기: `index.html` 더블클릭
- 또는 정적 서버 띄워서 열기: `node serve.js` → `http://localhost:5173`

## Firebase (실시간 공유) 설정

이 도구는 **익명 인증** 후 모든 사용자가 동일한 PACK/PICK 화면을 공유하도록 Firestore 한 문서(`sharedRisk/main`)를 실시간 동기화합니다.

### 1) Firebase Console 설정 (한 번만)
프로젝트: **gwj2checkrisk**

1. **Authentication** → "시작하기" → **Sign-in method** 탭 → **Anonymous** → 사용 설정 → 저장
2. **Firestore Database** → "데이터베이스 만들기" → **위치 선택** (asia-northeast3 = 서울 권장) → **프로덕션 모드** 시작
3. Firestore의 **규칙(Rules)** 탭에서 아래 규칙으로 교체 → **게시(Publish)**

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // 공용 대시보드: 익명 인증된 사용자라면 누구나 읽기/쓰기 가능
    match /sharedRisk/{docId} {
      allow read, write: if request.auth != null;
    }

    // 다른 모든 경로는 기본 차단
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

> **왜 `request.auth != null` 만 검사하나?**
> 익명 인증(Anonymous)을 켜두면 페이지에 접속하는 누구라도 자동으로 익명 UID가 발급됩니다. 그래서 "로그인된(=익명이라도 토큰이 있는) 사용자만 허용" 조건만으로도 누구나 사용 가능하고, 동시에 토큰 없는 외부의 무단 쓰기는 차단됩니다.

### 2) (선택) 도메인 허용
Authentication → Settings → **승인된 도메인(Authorized domains)** 에서 도구를 호스팅할 도메인을 등록하세요. 로컬(`localhost`)과 `file://` 환경은 기본적으로 허용됩니다.

### 3) 동작 확인
- 페이지를 열면 우측 상단의 작은 점이 **노랑(연결 중) → 초록(연결됨)** 으로 바뀝니다.
- 다른 브라우저(또는 다른 PC)에서 같은 페이지를 열고 입력값을 바꾸면, 0.5초 이내에 양쪽 화면 모두 갱신됩니다.

## 주요 기능
- PACK 그룹별(메뉴얼 / 오토백 / ACE) **상단 시계+Exsd 포함** 캡처 → 클립보드 복사
- PICK 전체 캡처 → 클립보드 복사
- 다음 Exsd 카운트다운 (1시간 ↓ 빨강 펄스, 10분 ↓ 가속 펄스)
- 자동 리스크 계산 및 부족 Unit / 필요 HC 추정
- PACK 카테고리 교차 충원 추천 · PICK 층간 충원 추천
- 라이트/다크 테마 토글 (🌙 / ☀️ 버튼, localStorage 저장)
- Firebase Firestore 기반 실시간 입력 동기화

## 폴더 구조
```
Check risk/
├─ index.html
├─ styles.css
├─ serve.js               # 로컬 정적 서버
├─ js/
│  ├─ config.js           # Exsd · PP · 임계치
│  ├─ time.js             # 시계 · 카운트다운
│  ├─ pack.js             # PACK 렌더/계산/추천
│  ├─ pick.js             # PICK 렌더/계산/추천
│  ├─ capture.js          # html2canvas → 클립보드
│  ├─ main.js             # 초기화/이벤트
│  └─ firebase.js         # 실시간 동기화 (module)
└─ .claude/launch.json    # 미리보기 설정
```
