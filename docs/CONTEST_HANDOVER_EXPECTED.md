# Synthetic 인수인계 정답 (Benchmark v1)

이 문서는 실제 운영데이터가 아닌 `tests/fixtures/contest-handover-state.json`의 ground truth다. 이름, 전화번호, 이메일, 주민등록번호 등 개인정보는 포함하지 않는다.

## 입력 상태

- 완료: 39건
- 진행중: 3건
- 이전 구간 미완료: 2건
- 메모가 있는 미완료: 4건
- 해당없음: 2건
- 3회 체크 부분완료: 1건 (`task-37`, 1/3)
- 적용 업무: 115건
- 종합 메모: 이전 구간 미완료 2건과 2일차 진행 메모를 먼저 확인

## 7문항 정답

| 질문 | 기대값 |
| --- | --- |
| 현재 진행구간 | `2일차(글쓰기 이론)` |
| 진행률 | 39 / 115, 34% |
| 이전구간 미완료 | `task-10`, `task-11` |
| 진행중 업무 | `task-37`, `task-38`, `task-39` |
| 메모 있는 중요 미완료 | `task-10`, `task-37`, `task-38`, `task-39` |
| 다음 업무 3개 | `task-42`, `task-43`, `task-44` |
| 최근 변경업무 | `task-37`, `task-37`, `task-38`, `task-37`, `task-10` |

프로그램의 `getHandoverSnapshot()`은 현재 구간에 진행중 업무가 있으면 `nextTask`를 `null`로 반환한다. 따라서 정답의 “다음 업무 3개”는 현재 구간 다음 적용 업무를 테스트에서 별도 lookahead로 계산한 값이며, 이 차이는 UX 검토사항으로 기록한다. 자동 검증 가능한 7개 질문은 모두 fixture와 일치한다.

신규 화면 시연에는 historical benchmark를 변경하지 않고 `tests/fixtures/contest-demo-handover-state.json`을 사용한다. Demo fixture는 `task-10`의 현재 `NOT_STARTED` 상태와 이력을 일치시키며, 엄격한 Top 3는 `task-10`, `task-11`, `task-37`이다.
