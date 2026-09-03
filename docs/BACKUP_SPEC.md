# 운영데이터 백업·복원 규격

## GitHub와 운영데이터

GitHub에는 프로그램 소스코드와 업무 원본인 `data/tasks.json`만 저장한다. 실제 교육 건에서 사용자가 입력한 완료상태, 메모, 일정, 예산, 지출, 정산상태는 브라우저 localStorage에 저장하며 v0.6 백업 JSON으로 별도 이동한다.

## 백업 대상과 구조

내보내기 대상은 현재 프로젝트의 `settings`, `tasks`, `budget` 사용자 상태다. 업무 제목·설명·단계 같은 업무 원본정보는 백업파일에 복사하지 않는다.

```json
{
  "backupVersion": 1,
  "application": "reporter-training-ops",
  "applicationVersion": "0.6",
  "exportedAt": "ISO DATE",
  "data": { "version": 4, "projectId": "reporter-training-ops", "settings": {}, "tasks": {}, "budget": {} }
}
```

파일명은 `reporter-training-backup-YYYY-MM-DD-HHmm.json` 형식이다. 마지막 백업시각은 운영상태와 분리된 브라우저 메타데이터로 기록한다.

## 내보내기와 가져오기

데이터 관리에서 내보내기를 누르면 현재 상태를 사람이 읽을 수 있는 JSON으로 다운로드한다. 가져오기는 파일 선택 후 JSON, 애플리케이션, 프로젝트 ID, 데이터 버전, settings·tasks·budget·transactions 구조를 먼저 검증하고 미리보기를 보여준다. 최종 `가져오기`를 눌러야 localStorage를 교체한다.

현재 업무 목록에 없는 업무 ID는 경고 후 복원에서 제외한다. 이전 데이터 버전은 `storage.js`의 기존 migration을 이용하고, 미래 버전은 복원하지 않는다.

## 전체 초기화

전체 초기화는 완료상태, 메모, 일정, 예산, 지출, 정산정보만 v4 빈 상태로 되돌린다. `tasks.json`과 프로그램 소스는 변경하지 않는다. 실행 전 되돌릴 수 없다는 확인을 표시하며 먼저 백업할 것을 안내한다.

## PC 간 이동

회사 PC에서 데이터 관리의 `운영데이터 내보내기`를 실행하고 JSON 파일을 안전한 방법으로 노트북으로 이동한다. 노트북에서는 최신 GitHub 소스코드를 받은 뒤 로컬 서버로 실행하고, 데이터 관리의 `운영데이터 가져오기`에서 JSON을 선택해 미리보기 후 복원한다.

## 개인정보 주의

백업파일에도 주민등록번호, 계좌번호, 전화번호, 주소, 개인 이메일, 강사 개인 지급정보를 기록하지 않는다. 설명과 메모에는 운영 처리 내용만 입력한다.
