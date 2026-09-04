# 수습기자 기본교육 운영 미니리더

현재 버전은 `v0.11`입니다. 실제 운영 체크리스트 117건은 `업무목록.csv`를 정본으로 사용하고, 기존 `data/tasks.json` 업무 마스터·일정·경고·예산·정산·백업·AI 기능과 분리해 관리합니다. 담당자 교체 시에는 `인수인계` 화면에서 현재 진행구간, 우선 확인 업무, 메모, 최근 처리, 구간별 현황을 확인하고 읽기용 HTML 보고서를 만들 수 있습니다. AI 정밀분석은 키를 서버에만 둔 Node.js 서버를 통해 OpenAI Responses API와 연결합니다. 현재 `data/tasks.json`에는 검증용 샘플 20건이 있으며 체크리스트 CSV와 임의로 합치지 않습니다.

## 실행 방법

`data/tasks.json`을 `fetch`로 읽으므로 `index.html`을 `file://`로 직접 열지 않습니다. 권장 실행 환경은 Node.js 24 LTS이며, 로컬 서버는 기본적으로 `127.0.0.1`에만 바인딩됩니다.

```powershell
$env:HOST = "127.0.0.1"
npm start
```

브라우저에서 `http://localhost:8080`을 엽니다. 기본 비교만 확인할 때는 기존처럼 `python -m http.server 8000`을 사용할 수 있지만, 그 경우 AI 정밀분석 서버는 실행되지 않습니다.

## 회사 PC 설치 절차

GitHub 저장소 접근 권한과 Node.js 24 LTS 설치를 확인한 뒤 저장소를 가져옵니다. `package.json`에 외부 npm 의존성이 없으므로 별도 설치 없이 테스트를 실행할 수 있습니다.

```powershell
git --version
node --version
npm --version
git clone https://github.com/s0991128/reporter-training-ops.git
Set-Location reporter-training-ops
git status
git log --oneline -5
npm test
```

매일 작업 시작 시에는 `git pull --ff-only origin main`을 사용합니다. 설치 후 기존 터미널에서 `node`를 찾지 못하면 터미널을 새로 열어 PATH를 갱신합니다.

## Docker 실행

Dockerfile은 Node.js 24 LTS를 사용하고, 외부 npm 패키지가 없어 `npm install`을 실행하지 않습니다. 컨테이너에서만 외부 접속을 허용하도록 `HOST=0.0.0.0`을 명시합니다.

```powershell
docker build -t reporter-training-ops .
docker run --rm -p 8080:8080 reporter-training-ops
```

### AI 정밀분석 설정

실제 키는 코드, 브라우저, `localStorage`, Git 저장소, 백업파일에 넣지 않습니다. 로컬에서는 현재 PowerShell 세션에만 환경변수를 설정하고, AxHub에서는 서버 비밀 환경변수로 설정합니다.

```powershell
$env:OPENAI_API_KEY = '발급받은 키를 이 세션에서만 설정'
$env:AI_MODEL = 'gpt-5'
npm start
```

`.env.example`은 변수 이름만 제공하며 실제 값은 비워 둡니다. `OPENAI_API_KEY`가 없으면 `/api/health`의 `aiConfigured`가 `false`이고 AI 정밀분석은 안전한 설정 오류를 표시합니다. 브라우저에서 직접 OpenAI를 호출하지 않으므로 API 키 입력 화면도 만들지 않습니다.

## 구조

```text
index.html                 화면 진입점
css/style.css              단일 스타일시트
업무목록.csv              실제 운영 체크리스트 정본 117건
data/tasks.json            구조화 업무 마스터 원본
data/tasks.schema.json     업무 JSON 구조
js/app.js                  화면 이벤트와 상태 연결
js/tasks.js                운영 업무 필터·카드 렌더링
js/storage.js              localStorage v6 상태·마이그레이션
js/checklist.js            체크리스트 CSV 로더·검증·상태 계산
js/checklist-ui.js         체크리스트 화면 렌더링
js/handover.js             인수인계 요약·우선순위·최근 이력 계산
js/handover-export.js      읽기용 self-contained HTML 보고서 생성
js/schedule.js             일정 계산
js/alerts.js               의존성·일정·위험 경고
js/budget*.js              예산·집행·정산
js/backup.js               운영데이터 백업·복원
js/task-admin.js           Task Master 메모리 편집·검증 화면
js/csv.js                  UTF-8 CSV 파싱·내보내기
js/data-quality.js         구조 검증·품질 경고·완성도
js/gap-analysis.js         로컬 규칙·입력 크기·민감정보 사전 점검
js/ai-adapter.js           LOCAL_RULE·REMOTE_AI 분석 어댑터와 제한시간
js/gap-ui.js               AI 누락점검 화면 렌더링
server/server.js           정적 파일·헬스·AI 분석 API 서버
server/ai-service.js       OpenAI Responses API 호출과 오류 변환
server/prompt.js            시스템 지침과 구조화 응답 스키마
server/validation.js        요청·응답·민감정보 검증
server/config.js            서버 환경변수·제한값 관리
Dockerfile                 Node.js 24 서버 배포 이미지
docs/                      기능·데이터 규격
tests/                     순수 로직 회귀 테스트
docs/HANDOVER_SPEC.md      인수인계 모드·데이터 계약
```

## v0.11 담당자 인수인계 모드

상단의 `인수인계`에서 업무목록.csv 117건을 인수인계 관점으로 재구성합니다. 현재 진행구간은 적용 가능한 업무 중 처음 미완료 구간을 기준으로 하되, 뒤 구간에 이미 완료·진행중 업무가 있으면 가장 멀리 진행된 구간을 표시하고 이전 구간 미완료 경고를 함께 보여줍니다. `NOT_APPLICABLE`은 진행률과 미완료 계산에서 제외합니다.

`먼저 확인할 업무`는 이전 구간 미완료, 진행중, 메모가 있는 미완료, 현재 구간 미완료, 다음 업무 순으로 중복 없이 표시합니다. 업무별 `updatedAt`을 저장하며 상태·세부 체크·메모 변경은 최대 최근 200건의 `checklistHistory`로 기록합니다. 메모 원문은 이력에 복제하지 않습니다.

`다음 담당자에게 남길 메모`는 최대 2,000자로 저장하고 개인정보 형식을 차단합니다. `인수인계 보고서 만들기`는 서버 호출 없이 현재 상태를 self-contained HTML로 생성합니다. HTML은 읽기 전용 문서이며 다시 가져오지 않습니다. 데이터 이동·복원은 기존 JSON 운영데이터 백업을 사용합니다.

저장 데이터는 localStorage v5에서 v6으로 자동 migration됩니다. v0.10 백업처럼 `updatedAt`, `checklistHistory`, `handover`가 없는 JSON도 정상 복원되며 새 필드는 기본값으로 보완됩니다. 체크리스트 원본의 행 수·key 수·checksum을 보고서에 함께 표시합니다.

## v0.10 실제 운영 체크리스트

상단의 `업무 체크리스트`에서 `업무목록.csv`의 행 순서와 구간 순서를 그대로 표시합니다. CSV는 실행 시 필수 컬럼·빈 값·중복 key를 검증하며 현재 정상 파일은 117건·16구간·3회 체크 10건입니다. 검색은 구간·업무·비고·메모를 대상으로 하고, 전체·미완료·완료·진행중·해당없음 필터를 제공합니다.

체크리스트 상태는 `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, `NOT_APPLICABLE`을 사용합니다. `비고`가 정확히 `3회 체크`인 업무는 1차·2차·3차 상태를 별도로 저장하고, 세 항목이 모두 체크될 때만 완료로 계산합니다. 메모는 인수인계용으로만 사용하며 주민등록번호·전화번호·계좌번호 등 개인정보 입력을 막습니다.

체크리스트 상태는 기존 업무 상태와 분리된 localStorage `checklist` 영역에 저장됩니다. 저장 버전은 v5로 안전하게 migration하며, 기존 업무·일정·예산·지출을 삭제하지 않습니다. 운영데이터 백업·복원에도 체크리스트 상태, 3회 체크, 메모, 완료일이 함께 포함됩니다. CSV가 변경되면 같은 key의 상태는 유지하고 새 key는 미착수로 표시하며 사라진 key의 저장값은 즉시 삭제하지 않습니다.

## v0.9 서버 기반 AI 업무 누락점검

`AI 누락점검`에서 `.txt`, `.md`, `.csv`, `.json` 분석자료를 메모리에 추가하고 현재 업무 마스터와 비교할 수 있습니다. `기본 비교`는 외부 AI 호출 없이 문장·항목 추출, 문자열 토큰 유사도, 업무 정의 비교를 수행합니다. `AI 정밀분석`은 브라우저에서 `/api/ai-gap-analysis`로 최소 업무정의와 분석자료만 전송하고, 서버가 OpenAI Responses API를 호출합니다.

분석 결과는 `NEW_TASK`, `ENRICH_EXISTING`, `DUPLICATE`로 구분하고 파일명·발췌문을 근거로 표시합니다. 신뢰도는 사실 확률이 아니라 담당자의 검토 우선순위 참고값입니다. 신규·보강 후보를 업무 마스터 편집 세션으로 전달할 수 있지만 `tasks.json`과 localStorage를 자동 수정하지 않습니다. 분석자료와 분석결과도 영구 저장하지 않습니다. 서버 응답은 구조화 JSON과 서버 검증을 모두 통과한 경우에만 화면에 표시합니다.

파일은 최대 5개, 파일별 200,000자, 전체 600,000자까지 사용합니다. 주민등록번호·전화번호·이메일 형식이 감지되면 AI 정밀분석 요청을 보내지 않습니다. 서버 로그에는 요청 ID, 처리시간, 결과 건수 또는 오류 종류만 남기며 분석자료 원문과 키는 기록하지 않습니다. 상세 계약은 `docs/REMOTE_AI_SPEC.md`를 참고하세요.

PDF, DOCX, HWP, HWPX는 v0.8에서 지원하지 않습니다. 개인정보, 계좌번호, 주민등록번호 등 민감정보가 포함된 문서를 분석자료로 사용하지 마세요. 브라우저에 API Key를 저장하거나 하드코딩하지 않습니다. 상세 계약은 `docs/AI_GAP_ANALYSIS_SPEC.md`를 참고하세요.

## 업무 마스터 (v0.7 기능 유지)

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
npm test
```

테스트에는 업무목록.csv 117건·16구간·구간별 건수·quoted CSV·중복 문장/고유 key·일반 체크·3회 체크·해당없음·localStorage migration·updatedAt·checklistHistory 200건 제한·인수인계 우선순위·HTML 보고서·백업/복원 회귀 검증이 포함됩니다.
