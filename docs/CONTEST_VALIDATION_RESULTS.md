# 공모전 시연 전 P1 검증 결과

## 범위와 표현 원칙

이번 결과는 `업무목록.csv` 원본대조, 개인정보 없는 synthetic scenario, 자동화된 회귀 테스트, 외부 AI 에이전트 blind proxy를 구분해 기록한 것이다. 실제 담당자 인터뷰, 실제 인수인계 관찰, 과거 업무시간 측정은 수행하지 않았으므로 실제 사용자 검증 결과로 표현하지 않는다.

`업무목록.csv`의 업무 문장과 순서는 수정하지 않았고, metadata의 `PENDING_REVIEW` 상태도 자동 확정하지 않았다.

## 원본 및 구조 검증

| 검증 영역 | 결과 |
| --- | --- |
| 117건 원본대조 | PASS: 117행, 16구간, 3회 체크 10건 |
| metadata 연결 | PASS: 117 keys, orphan 0, missing 0 |
| 운영 task 변환 | PASS: 117건 |
| source checksum | PASS: `1e2944ee` |
| 구조적 오류 | PASS: 0건 |
| backup/restore fidelity | PASS: 100% |
| 개인정보 | PASS: fixture에 실제 개인정보 없음 |

후보 분류는 업무 의미를 확정하는 판정이 아니라 후속 담당자 검토를 위한 문자열·반복 패턴 탐색이다. 한 업무가 여러 후보 규칙에 걸릴 수 있으므로 유형별 건수는 중복 집계된다.

| 후보 유형 | 건수 |
| --- | ---: |
| 일반 | 34건 |
| 조건부 | 13건 |
| 반복업무 | 48건 |
| 개인정보 주의 | 1건 |
| 선후관계 검토 | 30건 |
| 예산/정산 연계 | 21건 |
| 수행시점 검토 | 5건 |

## 인수인계 fixture 구분

### Benchmark v1

`tests/fixtures/contest-handover-state.json`과 `contest-before-state.txt`는 이전 Claude/Grok 비교 결과를 재현하기 위한 historical fixture다. 결과 재현성을 위해 수정하지 않았다.

Benchmark v1 synthetic fixture의 상태/이력 불일치 1건을 두 외부 AI 에이전트가 모두 식별함. 이는 시스템 계산 오류가 아니라 synthetic 시험데이터의 정합성 문제이며 제품 오류와 구분하여 기록함.

구체적으로 `task-10`의 현재 상태는 `NOT_STARTED`인데 이력에는 `NOT_STARTED -> IN_PROGRESS`가 남아 있다. 이 기록은 historical benchmark에 보존하고, 신규 시연에는 사용하지 않는다.

### Clean Demo fixture

`tests/fixtures/contest-demo-handover-state.json`은 위 문제를 수정한 별도 시연용 fixture다. `task-10`을 `NOT_STARTED`로 유지하고 해당 업무의 모순된 이력을 제거했으며, 시연 ground truth는 다음과 같다.

| 항목 | 기대값 |
| --- | --- |
| 현재 진행구간 | `2일차(글쓰기 이론)` |
| 진행률 | 34% |
| 이전 구간 미완료 | `task-10`, `task-11` |
| 진행중 | `task-37`, `task-38`, `task-39` |
| 메모 있는 미완료 | `task-10`, `task-37`, `task-38`, `task-39` |
| 엄격한 Top 3 | `task-10`, `task-11`, `task-37` |

## 외부 AI 에이전트 블라인드 Proxy Benchmark

### 목적과 방법

같은 synthetic 상태를 대상으로 구조화되지 않은 자료(BEFORE)와 구조화된 출력(AFTER)을 비교해 인수인계 정보 탐색 가능성을 보조 검증한다. 이는 원본 필드 검증이 아니라 보조 proxy이며, 실제 사용자의 성과를 대신하지 않는다.

- 모델: Claude, Grok
- 새 대화에서 각각 독립 수행
- 기대값과 테스트 코드는 사전에 공개하지 않음
- 외부 추론이나 추가 자료를 사용하지 않고 화면/첨부자료만 사용
- 동일한 7개 질문과 동일한 synthetic 상태 사용

| 에이전트 | BEFORE | AFTER | 변화 |
| --- | ---: | ---: | ---: |
| Claude | 4/7 (57.1%) | 7/7 (100%) | +42.9%p |
| Grok | 4/7 (57.1%) | 7/7 (100%) | +42.9%p |
| 평균 | 57.1% | 100% | +42.9%p |

### 세부 KPI

| KPI | BEFORE Claude/Grok | AFTER Claude/Grok | 변화 |
| --- | ---: | ---: | ---: |
| 이전 구간 미완료 식별 | 0/2, 0/2 | 2/2, 2/2 | 0% -> 100% |
| 진행중 업무 식별 | 3/3, 3/3 | 3/3, 3/3 | 100% -> 100% |
| 메모 미완료 식별 | 4/4, 4/4 | 4/4, 4/4 | 100% -> 100% |
| 엄격한 Top 3 순서 | 0/3, 0/3 | 3/3, 3/3 | 0% -> 100% |

Top 3 정답은 `task-10`, `task-11`, `task-37`의 엄격한 순서로 판정했다.

### 사용성 보조 점수

아래 점수는 사람이 아닌 AI agent의 qualitative self-report이며 human satisfaction이 아니다. 난이도는 낮을수록 좋다.

| 항목 | BEFORE 평균 | AFTER 평균 |
| --- | ---: | ---: |
| 정보 파악 난이도 | 4.0 / 5 | 2.0 / 5 |
| 인수인계 이해도 | 2.0 / 5 | 4.0 / 5 |
| 다음 업무 확인 용이성 | 2.0 / 5 | 3.5 / 5 |

## P1 안정화

- 빈 값(`null`, `undefined`, 빈 문자열)을 날짜 1970년으로 표시하지 않고 fallback으로 처리했다.
- 다음 신규 미착수 업무가 없을 때 진행 중 업무를 우선 확인하라는 안내를 표시한다.
- “이전 구간 미완료 업무”의 의미를 `현재 진행구간보다 앞선 구간에서 완료되지 않은 업무`로 명시했다.
- 기존 current-section, priority, dependency 계산 로직은 변경하지 않았다.

## 미래구간 case와 알려진 한계

앞 구간 `task-113`을 미완료로 둔 채 미래 구간 `task-42`를 완료하면 현행 `getCurrentChecklistSection()`은 가장 뒤에서 touched 된 `3일차`를 현재구간으로 반환한다. 이는 테스트로 재현된 현행 설계 결과이며 이번 단계에서 알고리즘을 임의 변경하지 않았다.

교육 진행일과 선행 처리된 미래 업무구간을 향후 별도 표시하는 방안 검토

## 실행 결과

- `npm test`: 11개 suite 전체 PASS
- timezone matrix(`UTC`, `Asia/Seoul`, `America/New_York`): 각 11개 suite 전체 PASS
- Demo fixture 정합성: task-10 현재 상태와 이력 일치, 엄격한 Top 3 PASS
- metadata와 업무 문장에는 자동 확정 변경 없음

실제 사람이 측정해야 할 KPI는 [CONTEST_KPI_TEMPLATE.md](./CONTEST_KPI_TEMPLATE.md)의 빈 칸에 기록한다.

## 보고서용 문장

1. 실제 운영 업무목록 117건과 16개 구간을 대조한 결과, 117/117 metadata 연결과 구조적 오류 0건을 확인했다.
2. 두 외부 AI 에이전트의 blind proxy 결과는 구조화 전 57.1%에서 구조화 후 100%로 변해 42.9%p 개선됐다.
3. 두 에이전트 모두 구조화되지 않은 자료에서는 이전 구간 미완료 2건을 놓쳤지만, 구조화된 화면에서는 두 건과 엄격한 Top 3 순서를 모두 식별했다.
4. 위 결과는 synthetic AI 보조 검증이며 human validation이 아니므로, 실제 사용자 검증은 후속 단계에서 별도로 수행한다.

## 표현 통제

실제 사용자 측정 전에는 현업 검증 완료, 담당자 시간 단축, 실제 업무 효율 향상, 인간 사용자 정답률, 만족도 지표, AI 성능, 실제 운영 오류율을 확정적인 운영 성과처럼 표현하지 않는다. 이 문서의 수치는 원본대조, 자동 회귀 테스트, synthetic ground truth, 외부 AI 보조 proxy의 범위로만 해석한다.
