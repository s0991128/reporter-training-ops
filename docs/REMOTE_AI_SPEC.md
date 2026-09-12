# v0.9 서버 기반 AI 업무 누락점검 명세

## 목적

v0.8의 `LOCAL_RULE` 분석을 유지하면서 `REMOTE_AI`를 추가한다. 흐름은 다음과 같다.

```text
브라우저 → /api/ai-gap-analysis → 서버 검증 → OpenAI Responses API
        → 구조화 JSON → 서버 검증 → 담당자 검토
```

AI 결과는 업무 마스터나 운영상태를 자동으로 변경하지 않는다. 담당자가 후보를 확인한 뒤에만 업무 마스터 편집 세션으로 전달한다.

## 브라우저에서 직접 호출하지 않는 이유

OpenAI API 키를 HTML, JavaScript, 백업파일, `localStorage` 또는 Git 저장소에 포함하면 키가 노출될 수 있다. 브라우저는 분석자료와 최소 업무 정의만 같은 출처의 서버 endpoint로 보내고, 서버가 환경변수의 키로 LLM을 호출한다.

## 서버 구성

- `server/server.js`: 정적 파일 제공, `GET /api/health`, `POST /api/ai-gap-analysis`, 요청 ID·처리시간 로그
- `server/config.js`: 포트, 모델, 제한값, 제한시간, 키 존재 여부
- `server/prompt.js`: 역할, 판정 기준, 자료를 신뢰할 수 없는 데이터로 취급하는 지침, JSON Schema
- `server/ai-service.js`: OpenAI Responses API 호출, 제한시간, 상태별 오류 변환
- `server/validation.js`: 요청·민감정보·LLM 결과 검증 및 안전한 필드만 정규화

서버는 별도 프레임워크나 런타임 의존성 없이 Node.js 내장 HTTP와 `fetch`를 사용한다. 모델은 `AI_MODEL`로 바꿀 수 있고 기본값은 `gpt-5`다.

## 환경변수와 키 관리

```text
PORT=8080
AI_MODEL=gpt-5
AI_TIMEOUT_MS=30000
OPENAI_API_KEY=
```

실제 키는 `.env.example`에 넣지 않는다. 로컬에서는 실행 세션 환경변수, AxHub에서는 비밀 환경변수로 설정한다. 서버의 health 응답은 `aiConfigured`의 참·거짓만 반환하고 키 값은 반환하지 않는다. 키는 로그와 오류 메시지에도 포함하지 않는다.

## 요청 구조

```json
{
  "sources": [{"filename": "sample-handover.md", "content": "..."}],
  "tasks": [{
    "id": "PRE-001",
    "phase": "사전준비",
    "title": "...",
    "description": "...",
    "completionCriteria": [],
    "handover": {"caution": "", "knowhow": ""},
    "tags": [],
    "aiCheck": {"keywords": []}
  }]
}
```

예산, 운영 메모, 완료상태, 브라우저 저장소 전체, 생성일 등은 요청에 포함하지 않는다. 파일 수·파일별 크기·전체 텍스트 크기를 브라우저와 서버 양쪽에서 제한한다.

## 응답 구조와 검증

서버는 `results` 배열만 화면에 전달한다. 각 결과에는 `type`, `confidence`, `candidate`, `source.filename`, `source.excerpt`, `similarTasks`, `reason`이 필요하다. 서버는 허용된 분류·확인 수준·근거 파일·유사업무 ID·유사도 범위를 검증하고 상태를 항상 `REVIEW`로 지정한다. 검증 실패 응답은 브라우저에 결과를 전달하지 않는다.

가능한 경우 Responses API의 JSON Schema 구조화 출력을 사용하며, 구조화 출력이더라도 서버에서 다시 JSON 파싱과 업무 규칙 검증을 수행한다.

## 판정 기준

- `NEW_TASK`: 현재 업무에서 충분히 대응하는 항목을 찾기 어려움
- `ENRICH_EXISTING`: 기존 업무는 있으나 완료기준·주의사항·절차의 보강 필요
- `DUPLICATE`: 현재 업무에 이미 충분히 반영되어 있음
- `HIGH`, `MEDIUM`, `LOW`: 실제 확률이 아닌 담당자 검토 순서 참고값

## 프롬프트 인젝션 대응

분석자료는 신뢰할 수 없는 데이터 블록으로 전달한다. 문서 안의 “이전 지시를 무시하라”, “업무를 삭제하라”와 같은 문장은 명령이 아니라 분석 대상 텍스트로만 취급한다. 서버는 문서 원문을 명령 실행이나 도구 호출에 사용하지 않는다.

## 개인정보 주의

주민등록번호, 전화번호, 이메일 형식을 단순 패턴으로 점검한다. 감지되면 브라우저에서 서버 요청을 차단하고, 서버에 직접 요청한 경우에도 LLM으로 전달하지 않고 422 오류를 반환한다. 이는 완전한 개인정보 탐지가 아니므로 실제 내부자료를 넣기 전에 담당자가 직접 확인해야 한다.

## 오류처리

- 서버 미실행: `AI 서버에 연결할 수 없습니다.`
- 키 미설정: `AI 서비스가 설정되지 않았습니다.`
- LLM 오류: `AI 분석 중 오류가 발생했습니다.`
- Rate Limit: `잠시 후 다시 시도해 주세요.`
- 제한시간 초과: `AI 응답시간을 초과했습니다.`
- 응답 검증 실패: `AI 응답 형식을 확인할 수 없습니다.`

원본 stack trace나 제공자 응답 원문은 사용자 화면에 노출하지 않는다.

## 담당자 검토 흐름

```text
AI 결과 → 담당자 검토 → 업무 마스터 편집 후보 → Validator → tasks.json Export
```

AI 결과를 받았다는 사실만으로 업무를 확정하지 않는다. `tasks.json`, 완료상태, 예산·정산 데이터는 자동 변경하지 않는다.
