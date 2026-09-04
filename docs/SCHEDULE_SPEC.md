# 일정 및 마감관리 규격

## 일정 기준

사용자는 `교육일정 설정`에서 교육명, 시작일, 종료일, 마감임박 기준 일수를 입력합니다. 시작일과 종료일은 함께 입력해야 하며 종료일이 시작일보다 빠르면 저장하지 않습니다. 두 날짜를 입력하지 않은 상태에서도 기준일 라벨과 기존 체크리스트는 정상 표시됩니다.

## `timing.type` 의미

| 유형 | 실제 날짜 |
| --- | --- |
| `D_DAY` | 교육 시작일 + `value`일 |
| `TRAINING_DAY` | 교육 시작일 + (`value` - 1)일 |
| `END_DAY` | 교육 종료일 |
| `AFTER_END` | 교육 종료일 + `value`일 |
| `MANUAL` | 자동 계산하지 않음(`NO_DATE`) |

## 일정 상태와 필터

완료 업무는 항상 `COMPLETED`입니다. 미완료 업무는 날짜가 없으면 `NO_DATE`, 날짜가 지나면 `OVERDUE`, 오늘이면 `DUE_TODAY`, 마감임박 기준 이하의 미래 날짜면 `DUE_SOON`, 그 외에는 `UPCOMING`입니다. 이번 주는 현재 날짜가 포함된 월요일 00:00부터 일요일까지이며, 오늘·이번 주·마감임박·기한초과 필터는 기존 단계·필수·미완료·검색 조건과 AND로 결합됩니다.

## 날짜 처리 원칙

`YYYY-MM-DD`는 UTC 파싱을 사용하지 않고 로컬 연·월·일로 파싱합니다. 날짜 비교 전 시간값을 제거해 브라우저 timezone에 따른 하루 차이를 방지합니다. `schedule.js`의 `formatTaskDate`는 화면에 `YYYY.MM.DD` 형식으로 표시합니다.

## 저장 및 운영 기준

업무 원본은 저장하지 않고 사용자 설정과 상태만 `trainee-reporter-training-state-v3`에 저장합니다.

```json
{
  "version": 3,
  "projectId": "reporter-training-ops",
  "settings": {
    "trainingName": "",
    "trainingStartDate": "",
    "trainingEndDate": "",
    "dueSoonDays": 3
  },
  "tasks": {
    "PRE-001": {"status":"NOT_STARTED", "completedAt":null, "memo":""}
  }
}
```

기존 v2 키는 업무 상태를 유지한 채 v3로 자동 변환됩니다. 기존 `END-*`, `BUD-*` ID는 현재 `CLS-*`, `FIN-*` ID로 연결됩니다.

## 실제 117건 업무 입력

117건 운영 업무는 `업무목록.csv` key와 `data/checklist-metadata.json`의 `timing` 연결을 사용합니다. 시작일 기준 업무는 `D_DAY`, 교육 기간 중 업무는 `TRAINING_DAY`, 종료 당일은 `END_DAY`, 종료 후 업무는 `AFTER_END`를 사용하고, 수동 날짜 업무는 `MANUAL`로 둡니다. 이름·전화번호·주민등록번호·계좌번호 등 개인정보는 입력하지 않습니다.
