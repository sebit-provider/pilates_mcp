export function scheduleWorkspaceHtml(): string {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pilates Schedule Workspace</title>
  <style>
    body { margin: 0; font-family: "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif; color: #202124; background: #f6f7f8; }
    header { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 18px; background: #fff; border-bottom: 1px solid #ddd; }
    h1 { margin: 0; font-size: 18px; }
    .actions { display: flex; gap: 8px; align-items: center; }
    button, select { height: 34px; border: 1px solid #c9ccd1; background: #fff; border-radius: 6px; padding: 0 10px; font: inherit; }
    .state { font-size: 13px; color: #5f6368; }
    main { padding: 18px; }
    .grid-wrap { overflow: auto; border: 1px solid #d7d9dd; background: #fff; max-height: calc(100vh - 92px); }
    table { border-collapse: separate; border-spacing: 0; min-width: 920px; width: 100%; table-layout: fixed; }
    th, td { border-right: 1px solid #e2e4e8; border-bottom: 1px solid #e2e4e8; min-width: 132px; height: 42px; padding: 0; }
    th { position: sticky; top: 0; background: #f1f3f4; z-index: 1; font-size: 13px; }
    th:first-child, td:first-child { position: sticky; left: 0; z-index: 1; background: #f8f9fa; width: 86px; min-width: 86px; text-align: center; font-weight: 700; color: #5f6368; }
    th:first-child { z-index: 3; }
    td[contenteditable] { padding: 8px; outline: none; background: #fff; }
    td[contenteditable]:focus { box-shadow: inset 0 0 0 2px #1a73e8; }
    td.closed { background: #fce8e6; color: #b3261e; font-weight: 700; text-align: center; }
  </style>
</head>
<body>
  <header>
    <h1>Schedule Workspace</h1>
    <div class="actions">
      <select id="type"><option value="group">그룹</option><option value="private">개인</option></select>
      <button id="new">새 시간표</button>
      <button id="save">저장</button>
      <button id="export">내보내기</button>
      <span class="state" id="state">저장됨</span>
    </div>
  </header>
  <main>
    <div class="grid-wrap">
      <table id="grid"></table>
    </div>
  </main>
  <script>
    const days = ["월", "화", "수", "목", "금", "토"];
    const times = Array.from({ length: 12 }, (_, i) => String(i + 9).padStart(2, "0") + ":00");
    const grid = document.getElementById("grid");
    const state = document.getElementById("state");
    function draw() {
      grid.innerHTML = "<thead><tr><th>시간</th>" + days.map(d => "<th>" + d + "</th>").join("") + "</tr></thead>";
      const body = document.createElement("tbody");
      for (const time of times) {
        const tr = document.createElement("tr");
        tr.innerHTML = "<td>" + time + "</td>" + days.map(() => "<td contenteditable='true'></td>").join("");
        body.appendChild(tr);
      }
      grid.appendChild(body);
    }
    grid.addEventListener("input", () => { state.textContent = "수정됨"; });
    grid.addEventListener("keydown", (event) => {
      const cell = event.target.closest("td[contenteditable]");
      if (!cell) return;
      if (event.key === "Delete" || event.key === "Backspace" && !cell.textContent) {
        cell.textContent = "";
        state.textContent = "수정됨";
      }
    });
    document.getElementById("new").onclick = () => { draw(); state.textContent = "수정됨"; };
    document.getElementById("save").onclick = () => { state.textContent = "저장됨"; };
    document.getElementById("export").onclick = () => { alert("MCP export_schedule tool 또는 Railway API 확장에서 XLSX로 내보내세요."); };
    draw();
  </script>
</body>
</html>`;
}
