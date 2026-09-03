# 수습기자 교육운영 미니리더

현재 버전: `v0.3`

수습기자 기본교육의 사전준비부터 결과보고까지 업무를 체크리스트로 표준화하고, 교육 일정에 따라 실제 마감일을 계산하는 서버 없는 정적 웹입니다. 검증용 샘플 업무 20건이 포함되어 있습니다.

## 실행 방법

`data/tasks.json`을 브라우저에서 불러오므로 `file://`로 직접 열지 말고 Windows 로컬 웹 서버로 실행합니다.

```powershell
python -m http.server 8000
```

브라우저에서 [http://localhost:8000](http://localhost:8000)을 엽니다. Python이 없다면 VS Code Live Server 등 정적 파일 서버를 사용할 수 있습니다.

## 프로젝트 구조

```text
index.html              화면 구조
css/style.css           전체 스타일
data/tasks.json         업무 원본 데이터(Single Source of Truth)
data/tasks.schema.json  업무 데이터 JSON Schema
docs/TASK_DATA_SPEC.md  업무 데이터 작성 규격
docs/SCHEDULE_SPEC.md   일정 계산 및 저장 규격
js/app.js               앱 초기화, 설정/검색/필터/정렬 이벤트
js/dashboard.js         업무·일정 요약과 단계별 진행률
js/schedule.js          날짜 계산, 일정 상태, 일정 조회
js/tasks.js             업무 로딩, 카드 렌더링, 필터, 업무 이벤트
js/search.js            업무명/설명/주의사항 검색
js/storage.js           localStorage v3 저장/마이그레이션
js/validator.js         업무 데이터 검증
```

## 주요 기능

- 교육명·시작일·종료일·마감임박 기준 설정
- D-day, 교육일차, 종료일, 종료 후 기준의 실제 마감일 계산
- 오늘·이번 주·마감임박·기한초과 일정 필터와 실제 마감일/위험도 정렬
- 완료 체크, 완료일, 메모, 검색, 단계·필수·미완료 필터, 전체·단계별 진행률
- 브라우저 `localStorage`에 설정과 업무 상태만 저장하며 교육생 개인정보는 저장하지 않음

## 저장 구조와 마이그레이션

v3 저장 키는 `trainee-reporter-training-state-v3`이며 `version`, `projectId`, `settings`, `tasks`를 저장합니다. 업무 원본정보는 저장하지 않습니다. 기존 v2 상태는 완료상태와 메모를 유지한 채 최초 조회 시 v3로 자동 변환됩니다.

## 검증

별도 빌드 도구 없이 로컬 서버에서 실행합니다. 설정 저장/취소와 날짜 계산, 오늘·이번 주·마감임박·기한초과 필터, 기존 검색·진행률·체크·메모·새로고침 복원을 확인합니다. 날짜 계산 상세 규칙은 `docs/SCHEDULE_SPEC.md`를 참고합니다.
