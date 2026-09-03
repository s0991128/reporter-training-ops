# AI 기반 업무 누락점검 MVP 규격

## 목적

과거 교육계획서, 체크리스트, 인수인계 자료에서 업무성 문장을 추출하고 현재 `data/tasks.json` 업무 마스터와 비교해 누락·보강·이미 반영 후보를 제안합니다. 분석결과는 담당자의 검토를 돕는 참고자료이며 AI가 업무를 확정하지 않습니다.

## 지원 자료와 저장

v0.8은 브라우저에서 읽을 수 있는 `.txt`, `.md`, `.csv`, `.json`만 지원합니다. PDF, DOCX, HWP, HWPX는 지원하지 않습니다. 원본문서와 분석 세션은 메모리에서만 관리하고 localStorage에 영구 저장하지 않습니다.

```json
{
  "id": "SRC-001",
  "filename": "sample-handover.md",
  "type": "markdown",
  "content": "...",
  "addedAt": "ISO DATE"
}
```

개인정보, 계좌번호, 주민등록번호 등 민감정보가 포함된 문서를 분석자료로 사용하지 않습니다.

## 분석 모드

- `LOCAL_RULE`: 외부 AI 호출 없이 제목·목록·문장을 추출하고 문자열 토큰 유사도로 현재 업무와 비교합니다. v0.8의 기본이자 실제 동작 모드입니다.
- `REMOTE_AI`: 설정된 서버 endpoint에 최소 업무정의와 분석자료를 전송합니다. endpoint가 없거나 응답 구조가 틀리면 오류를 표시하고 결과를 렌더링하지 않습니다.

브라우저에는 OpenAI 등 외부 AI API Key를 저장하거나 하드코딩하지 않습니다. 향후 구조는 브라우저 → 서버 API → LLM입니다.

## 비교와 판정

현재 업무의 `title`, `description`, `completionCriteria`, `handover.caution`, `handover.knowhow`, `tags`, `aiCheck.keywords`만 검색용 문자열로 결합합니다. `normalizeText`, `tokenizeText`, `calculateTextSimilarity`, `findSimilarTasks`로 정규화·토큰 교집합·부분 일치·문구 포함 여부를 계산합니다.

- `NEW_TASK`: 충분히 유사한 기존 업무를 찾지 못한 후보
- `ENRICH_EXISTING`: 유사업무는 있으나 추가 절차·완료기준·주의사항 보강이 필요한 후보
- `DUPLICATE`: 현재 업무 정의에 이미 반영되어 있을 가능성이 높은 후보

모든 결과에는 `REVIEW`, `ACCEPTED`, `IGNORED` 검토 상태를 둡니다. `ACCEPTED`도 `tasks.json`을 직접 수정하지 않으며 업무 마스터의 메모리 편집 후보로만 전달합니다.

## 근거와 신뢰도

`NEW_TASK`와 `ENRICH_EXISTING`은 반드시 파일명과 근거 발췌문을 포함합니다. 근거가 없는 제안은 표시하지 않습니다. `HIGH`, `MEDIUM`, `LOW`는 사실 확률이 아니라 담당자가 확인할 순서를 정하는 참고값입니다.

## 결과 구조

```json
{
  "id": "GAP-001",
  "type": "NEW_TASK",
  "confidence": "HIGH",
  "candidate": "교육 전날 출발시간 재확인",
  "source": {
    "sourceId": "SRC-001",
    "filename": "sample-handover.md",
    "excerpt": "교육 전날 출발시간을 다시 확인한다."
  },
  "similarTasks": [],
  "reason": "현재 업무 마스터에서 충분히 유사한 업무를 찾지 못했습니다.",
  "status": "REVIEW"
}
```

서버 응답은 `validateGapResult`를 통과한 결과만 화면에 표시합니다. 허용 타입은 `NEW_TASK`, `ENRICH_EXISTING`, `DUPLICATE`, 신뢰도는 `HIGH`, `MEDIUM`, `LOW`입니다.

## 담당자 검토 흐름

신규 후보는 제목·설명·주의사항·태그를 업무 마스터의 신규 편집 화면에 참고값으로 전달하고, 단계·기준일·필수 여부·위험도·담당역할·완료기준·dependency는 담당자가 확인합니다. 보강 후보는 기존 업무 편집 화면을 열고 AI 제안문을 별도 참고영역에 표시합니다. 어느 흐름도 자동 저장·자동 확정하지 않습니다.

