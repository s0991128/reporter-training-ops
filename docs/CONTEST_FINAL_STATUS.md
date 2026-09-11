# 공모전 최종 개발·검증 상태

## 1. 과제 한 줄 정의

> 사람이 바뀌어도 업무는 끊기지 않게.

## 2. 문제

- 수습기자 기본교육 운영업무가 문서·엑셀·메일·메신저·개인기억에 분산되어 있다.
- 담당자 변경 시 현재 상태와 다음 업무를 파악하기 어렵다.
- 업무 누락과 재학습 부담이 발생할 수 있다.

## 3. 구현 결과

- 실제 운영업무 117건 구조화
- 16개 업무구간
- 체크리스트와 진행현황
- 인수인계 모드
- JSON backup/restore
- HTML 인수인계 보고서
- 예산·정산 PoC
- AI 업무 누락점검
- 개인정보 입력 방지
- 서버 기반 AI 호출
- CORS allowlist와 IP rate limit
- `Asia/Seoul` 기준 timestamp 표시

## 4. 정량 검증

| 항목 | 결과 |
| --- | ---: |
| 실제 업무 반영 | 117/117, 100% |
| metadata coverage | 117/117, 100% |
| metadata orphan | 0건 |
| metadata missing | 0건 |
| 구조적 오류 | 0건 |
| backup/restore | 100% |
| synthetic handover ground truth | 7/7 |
| 자동 test suite | 11개 PASS |
| timezone regression | UTC, Asia/Seoul, America/New_York PASS |

### Proxy Benchmark

동일 synthetic 운영상태를 기준으로 Claude와 Grok이 비구조화 자료와 시스템 구조화 산출물에서 답한 7문항을 비교한 보조 지표다.

| 지표 | BEFORE | AFTER | 변화 |
| --- | ---: | ---: | ---: |
| 7문항 정답률 | 57.1% | 100% | +42.9%p |
| 이전구간 미완료 식별 | 0% | 100% | +100%p |
| Top-3 우선업무 | 0% | 100% | +100%p |
| 정보 탐색 난이도 | 4.0 / 5 | 2.0 / 5 | 낮을수록 좋음 |
| 인수인계 이해도 | 2.0 / 5 | 4.0 / 5 | AI agent 질적 점수 |
| 다음 업무 판단 용이성 | 2.0 / 5 | 3.5 / 5 | AI agent 질적 점수 |

## 5. 검증 방법

- 개인정보 없는 synthetic 상태 사용
- Claude와 Grok 각각 독립된 새 대화에서 수행
- BEFORE와 AFTER 자료 분리
- 기대 정답과 테스트 코드 비공개
- 동일한 7문항 적용
- 외부 AI의 보조 Proxy Benchmark로만 해석

## 6. 안전성 및 통제

- AI 자동 업무수정 금지
- Human-in-the-loop 검토
- 개인정보 패턴 차단
- API key 서버 보관
- 입력 크기 제한
- AI 응답 서버 검증
- CORS allowlist
- IP rate limit
- 운영 원본과 사용자 상태 분리

## 7. Known Limitations

- 미래 구간 업무를 미리 완료할 경우 `currentSection`이 뒤 구간으로 이동할 수 있다.
- 실제 현업 사용자 실증은 아직 수행하지 않았다.
- 현재는 localStorage 기반 단일 사용자 PoC다.
- 정식 다중 사용자 운영에는 인증과 서버 DB가 필요하다.
- advanced metadata 일부는 `PENDING_REVIEW` 상태다.
- Benchmark v1 synthetic fixture의 상태/이력 불일치 1건은 역사 보존을 위해 유지한다. 신규 시연에는 clean Demo fixture를 사용한다.

## 8. 향후 확산

수습기자 교육 → 다른 사내교육 → 행사·세미나 → 지원사업 → 계약·입찰·검수 → 반복행정업무 운영 프레임워크

## 9. 핵심 메시지

> 117개의 담당자 경험을 표준 운영지식으로 바꾸고, AI가 그 지식의 누락을 점검합니다.

본 문서는 [CONTEST_CHECKLIST_VALIDATION.md](./CONTEST_CHECKLIST_VALIDATION.md), [CONTEST_HANDOVER_EXPECTED.md](./CONTEST_HANDOVER_EXPECTED.md), [CONTEST_KPI_TEMPLATE.md](./CONTEST_KPI_TEMPLATE.md), [CONTEST_VALIDATION_RESULTS.md](./CONTEST_VALIDATION_RESULTS.md)와 동일한 검증 범위를 사용한다.
