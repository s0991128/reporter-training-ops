# 수습기자 기본교육 운영 미니리더

현재 버전은 `v0.7`입니다. 사전준비부터 결과보고까지의 교육운영 업무를 체크리스트, 일정, 선행업무 경고, 예산·정산, 백업·복원으로 관리하는 서버 없는 정적 웹 앱입니다. 현재 `data/tasks.json`에는 검증용 샘플 20건만 있으며 실제 110건을 임의로 생성하지 않습니다.

## 실행 방법

`data/tasks.json`을 `fetch`로 읽으므로 `index.html`을 `file://`로 직접 열지 않습니다. Windows PowerShell에서 프로젝트 폴더로 이동한 뒤 실행합니다.

```powershell
python -m http.server 8000
```

브라우저에서 [http://localhost:8000](http://localhost:8000)을 엽니다. Python이 없다면 VS Code Live Server와 같은 정적 파일 서버를 사용합니다. 외부 프레임워크와 서버 프레임워크는 사용하지 않습니다.

## 구조

```text
index.html                 화면 진입점
css/style.css              단일 스타일시트
data/tasks.json            업무 정의 원본
data/tasks.schema.json     업무 JSON 구조
js/app.js                  화면 이벤트와 상태 연결
js/tasks.js                운영 업무 필터·카드 렌더링
js/storage.js              localStorage v4 상태·마이그레이션
js/schedule.js             일정 계산
js/alerts.js               의존성·일정·위험 경고
js/budget*.js              예산·집행·정산
js/backup.js               운영데이터 백업·복원
js/task-admin.js           Task Master 메모리 편집·검증 화면
js/csv.js                  UTF-8 CSV 파싱·내보내기
js/data-quality.js         구조 검증·품질 경고·완성도
docs/                      기능·데이터 규격
tests/                     순수 로직 회귀 테스트
```

## v0.7 업무 마스터

상단의 `업무 마스터`에서 검색, 단계·활성 필터, 상세 확인, 신규·수정·삭제 후보 편집을 수행합니다. 수정 내용은 편집 세션에만 남고 `data/tasks.json`과 localStorage는 직접 변경하지 않습니다. ID prefix와 단계, 필수 필드, 위험도, 일정 형식, 의존성·순환을 검증하며 품질 경고와 입력 완성도 참고값을 분리해서 보여줍니다. 참조 중인 업무는 삭제할 수 없고 비활성화를 우선합니다.

CSV는 고정 23개 열과 UTF-8 BOM을 사용합니다. `completionCriteria`, `dependencies`, `documents`, `tags`는 `|`로 구분하고 문서는 `문서명::required` 또는 `문서명::optional` 형식입니다. 가져오기는 미리보기 후 정상 행만 편집 세션에 적용합니다. 반복 설정과 AI 점검까지 완전하게 보존하려면 후보 JSON 내보내기를 사용합니다.

## 실데이터 110건 전환 절차

1. CSV 템플릿에 업무를 입력하고 개인정보를 제외합니다.
2. ID와 단계, 필수 필드, 허용값, 의존성·순환 오류를 수정합니다.
3. Task Master에서 미리보기와 품질 경고를 확인합니다.
4. 검증 통과 후보 JSON을 내보내고 기존 운영데이터를 백업합니다.
5. ID 변경 목록과 완료상태·메모 연결을 검토한 뒤 `data/tasks.json`을 교체합니다.

## 테스트

Node.js가 설치되어 있다면 다음과 같이 실행합니다.

```powershell
node --experimental-default-type=module tests/task-master.test.js
node --experimental-default-type=module tests/alerts.test.js
node --experimental-default-type=module tests/budget.test.js
node --experimental-default-type=module tests/backup.test.js
```
