"use strict";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-geometry-to-ui",
      severity: "error",
      comment:
        "순수 기하 모델은 학습 화면, 3D 장면, 지도, 진행 저장, 앱 조정 계층을 import할 수 없다.",
      from: { path: "^src/geometry/" },
      to: { path: "^src/(lesson|scene|map|progress|app)/" },
    },
    {
      name: "no-lower-to-app",
      severity: "error",
      comment:
        "하위 영역은 화면 전환과 주제 선택을 조정하는 최상위 app 계층을 거꾸로 import할 수 없다.",
      from: { path: "^src/(geometry|lesson|scene|map|progress)/" },
      to: { path: "^src/app/" },
    },
    {
      name: "no-circular",
      severity: "error",
      comment: "포함된 소스 모듈 사이의 순환 의존은 빌드 전에 실패한다.",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    tsConfig: { fileName: "tsconfig.json" },
    doNotFollow: { path: "node_modules" },
    exclude: {
      path: "(^|/)(node_modules|dist|test-results|playwright-report)(/|$)",
    },
    includeOnly: { path: "^(src|tests|scripts)/" },
    enhancedResolveOptions: {
      conditionNames: ["browser", "import", "require", "default"],
      extensions: [".mjs", ".js", ".cjs", ".jsx", ".ts", ".tsx"],
    },
  },
};
