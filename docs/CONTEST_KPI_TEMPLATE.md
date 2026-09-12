# 공모전 KPI 측정표

결과값이 비어 있는 항목은 실제 담당자 또는 관찰자가 같은 과제를 수행한 뒤 기록한다. 임의의 사용자 시간이나 과거 업무시간을 입력하지 않는다.

## 사람 측정이 필요한 항목

| KPI | Before | After | 결과 | 측정 방법 |
| --- | ---: | ---: | ---: | --- |
| 상황 파악시간 |  |  |  | 동일 synthetic 정보로 처음부터 7문항 답변까지 초 측정 |
| 7문항 정답수 |  |  |  | `correct / 7 * 100` |
| 중요 미완료 발견수 |  |  |  | 주어진 중요 미완료 목록과 발견 목록 비교 |
| 중요 미완료 전체수 |  |  |  | 실험 시작 전에 고정 |
| 다음 업무 정확도 |  |  |  | 기대 next 3개와 답변 비교 |
| 인수인계 자료 생성시간 |  |  |  | 동일 상태에서 자료 생성 완료까지 초 측정 |
| JSON 상태 복원 정확도 |  |  |  | 백업 전후 상태 필드 비교 |
| HTML/프로그램 상태 일치율 |  |  |  | HTML과 화면의 동일 항목 비교 |

## 현재 자동 계산값

| 지표 | 계산값 |
| --- | ---: |
| 원본 업무 시스템 반영률 | 117 / 117 = 100% |
| metadata key coverage | 117 / 117 = 100% |
| metadata orphan / missing | 0 / 0 |
| synthetic backup restore fidelity | 100% |
| synthetic handover ground truth | 7 / 7 = 100% |
| NOT_APPLICABLE 진행률 분모 제외 | 115건 적용 업무 |

## 계산식

```text
정답률 = correct / total * 100
중요업무 탐지율 = detectedCritical / injectedCritical * 100
시간 단축률 = (beforeSeconds - afterSeconds) / beforeSeconds * 100
```

자동 계산값은 코드와 fixture의 일치도이며, 실제 현업 시간 단축이나 실제 담당자 성과를 의미하지 않는다.
