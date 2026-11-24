# GitHub Pages 배포와 학교 태블릿 확인

이 문서는 직육면체 블록 공방의 승인 경로, 실제 GitHub Pages 주소, 인쇄용 QR과 학교 태블릿 확인 절차를 기록한다. 값은 지정된 생산자가 실제로 남긴 출력에서만 가져온다. 확정되지 않은 값은 미확인으로 남기고 추정하거나 미리 채우지 않는다.

## 승인 경로

| 항목     | 승인 값 또는 기록 위치                 | 현재 값                       |
| -------- | -------------------------------------- | ----------------------------- |
| 저장소   | scftsnow/cuboid-review-lab             | 승인됨                        |
| 브랜치   | main                                   | 승인됨                        |
| 담당자   | 기존 등록·배포 권한을 가진 배포 담당자 | 배포 실행 기록에서 확인       |
| 커밋     | sourceCommit                           | 워크플로 실행 후 기록         |
| 워크플로 | .github/workflows/pages.yml            | 파일 존재, 실행 기록은 미확인 |

배포 담당자는 승인된 저장소의 main 브랜치에서 .github/workflows/pages.yml을 실행한다. 이 문서는 배포를 실행하지 않는다. 배포 기록에는 저장소, 브랜치, sourceCommit, 담당자, 워크플로 경로와 실제 실행 결과를 함께 남긴다.

## 자동 검증과 실제 URL

.github/workflows/pages.yml은 npm ci와 Playwright 브라우저 설치 뒤 npm run check, npm run test, npm run build, npm run test:e2e를 순서대로 실행한다. 빌드 산출물이 비어 있지 않은지 확인한 뒤 Pages 아티팩트를 올리고 배포한다. 배포 단계는 절대 HTTPS 주소를 검사하고 query와 fragment가 없는 deploymentUrl을 출력한다.

| 출력          | 생산자                                 | 현재 값 |
| ------------- | -------------------------------------- | ------- |
| deploymentUrl | Pages 배포 단계의 URL 검사 출력        | 미확인  |
| sourceCommit  | Pages 배포 단계의 커밋 출력            | 미확인  |
| checks        | 검사·테스트·빌드·통합 테스트 단계 결과 | 미확인  |

각 값은 실제 워크플로 실행이 남긴 출력과 전체 로그, 종료 코드로 갱신한다. deploymentUrl이 없거나 HTTPS가 아니면 배포 완료로 기록하지 않는다. 한 번 발급된 주소를 문서에 고정하지 않고 매 배포의 출력을 사용한다.

## 인쇄용 QR

scripts/make-qr.mjs는 deploymentUrl을 --url, --deployment-url, --url=..., --deployment-url=... 또는 DEPLOYMENT_URL/PAGES_URL 환경 변수로 받는다. 출력 경로는 --out, --output 또는 기본값 artifacts/deployment-qr.png로 정한다. 스크립트는 deployment_url, qr_png, url_text를 출력한다. qr_png은 저장소 상대 경로인 qrImagePath로 기록한다.

QR 생성과 별개의 디코더로 인쇄용 PNG를 읽어 decodedUrl을 만든다. QR 생성 스크립트의 출력 문자열을 디코딩 결과로 재사용하지 않는다. match는 decodedUrl === deploymentUrl일 때만 true다.

| 출력        | 생산자 또는 판정             | 현재 값 |
| ----------- | ---------------------------- | ------- |
| qrImagePath | scripts/make-qr.mjs의 qr_png | 미확인  |
| decodedUrl  | 독립 디코더 결과             | 미확인  |
| match       | decodedUrl === deploymentUrl | 미확인  |

세 값이 모두 기록되고 match가 true인 QR만 인쇄와 학교 태블릿 확인에 사용한다. QR은 실제 deploymentUrl로만 만들고, 주소나 디코딩 결과를 수동으로 입력해 일치를 만들지 않는다.

## 학교 태블릿 확인 절차

학교 와이파이에 연결된 태블릿에서 인쇄된 QR을 스캔해 실제 배포 주소를 연다. 확인자는 단계별 결과만 기록하고 학생 식별값, 정답 원문과 브라우저 저장 본문은 기록하지 않는다.

| 단계           | 확인 동작                                                                                   | 기록할 결과                |
| -------------- | ------------------------------------------------------------------------------------------- | -------------------------- |
| 1. QR 스캔     | 인쇄된 QR을 태블릿 카메라로 스캔하고 열린 주소가 deploymentUrl과 같은지 확인한다.           | 주소 일치 여부             |
| 2. 지도        | 한국어 장소 이름 다섯 개, 수업 순서, 추천 장소가 보이는지 확인한다.                         | 화면 확인 여부             |
| 3. 3D 조작     | 장소를 탭해 3D 화면을 열고 도형을 돌려 면·모서리·꼭짓점을 선택할 수 있는지 확인한다.        | 조작 확인 여부와 오류 코드 |
| 4. 퀴즈와 힌트 | 새 예제에 답하고 오답에서 힌트를 확인한 뒤 수정 제출이 가능한지 확인한다.                   | 제출·힌트·재시도 결과      |
| 5. 완료 표시   | 필수 결과를 확인한 뒤 주제 완료 블록이 지도에 표시되는지 확인한다.                          | 완료 블록 확인 여부        |
| 6. 저장 복원   | 같은 브라우저에서 주소를 다시 열어 재개 위치, 마지막 결과, 전시 작품이 복원되는지 확인한다. | 복원 항목별 결과           |

기기 종류, 학교 와이파이, 확인 시각과 화면에 남은 오류 코드는 실기 기록에 남긴다. 실기 접근이 없으면 여섯 단계를 모두 미확인으로 유지한다.

## 판정 구분

| 검증      | 범위                                                              | 현재 판정 |
| --------- | ----------------------------------------------------------------- | --------- |
| 자동 검증 | 워크플로의 검사·테스트·빌드·배포, 실제 URL, QR 생성과 독립 디코딩 | 미확인    |
| 학교 실기 | 학교 와이파이와 태블릿에서 실행하는 여섯 단계                     | 미확인    |

두 판정은 별도로 기록한다. 자동 검증이 통과해도 학교 실기가 실행되지 않으면 실기 판정은 미확인으로 유지한다. deploymentUrl이 없거나 decodedUrl 불일치가 남으면 QR 사용과 실기 통과를 승인하지 않는다.

## 배포 완료 기록 형식

모든 제품 관문이 통과한 뒤 다음 값을 같은 실행 기록에 남긴다.

```text
repository=scftsnow/cuboid-review-lab
branch=main
sourceCommit=<워크플로 출력>
owner=<배포 승인 기록>
workflow=.github/workflows/pages.yml
deploymentUrl=<배포 단계 출력>
checks=<검사·테스트·빌드·통합 테스트 결과>
qrImagePath=<QR 생성 출력 qr_png>
decodedUrl=<독립 디코더 결과>
match=<decodedUrl === deploymentUrl>
schoolTablet=<여섯 단계 결과 또는 미확인>
```

꺾쇠 안의 값은 실제 출력으로 교체하기 전까지 채우지 않는다. schoolTablet은 실기 결과가 없으면 미확인으로 남긴다.

## 남은 작업

1. 배포 담당자가 scftsnow/cuboid-review-lab의 main 브랜치에서 .github/workflows/pages.yml을 실행한다.
2. 실제 실행 기록으로 저장소, 브랜치, sourceCommit, 담당자, 검사 결과와 deploymentUrl을 기록한다.
3. 실제 deploymentUrl로 QR을 만들고 qrImagePath, decodedUrl, match를 기록한다.
4. 학교 태블릿에서 여섯 단계를 실행하고 자동 검증과 분리해 결과를 기록한다.
