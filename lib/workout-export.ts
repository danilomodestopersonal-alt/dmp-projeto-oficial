export type WorkoutExportExercise = {
  block?: string;
  name: string;
  sets: string;
  reps: string;
  load: string;
  notes?: string;
};

export type WorkoutExportPayload = {
  studentName: string;
  slot: string;
  workoutName: string;
  protocolLabel: string;
  week: number;
  notes: string;
  exercises: WorkoutExportExercise[];
};

function escapeHtml(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function exportWorkoutPdf(data: WorkoutExportPayload) {
  if (!data.exercises.length) {
    alert("Adicione pelo menos um exercício.");
    return;
  }

  const popup = window.open("", "_blank", "width=950,height=1100");

  if (!popup) {
    alert("O navegador bloqueou a janela de exportação. Libere pop-ups para o DMP.");
    return;
  }

  const rows = data.exercises.map((exercise, index) => {
    return (
      "<tr>" +
      "<td>" + (index + 1) + "</td>" +
      "<td>" + escapeHtml(exercise.block || "—") + "</td>" +
      "<td><strong>" + escapeHtml(exercise.name) + "</strong></td>" +
      "<td>" + escapeHtml(exercise.sets || "—") + "</td>" +
      "<td>" + escapeHtml(exercise.reps || "—") + "</td>" +
      "<td>" + escapeHtml(exercise.load || "—") + "</td>" +
      "<td>" + escapeHtml(exercise.notes || "") + "</td>" +
      "</tr>"
    );
  }).join("");

  const notesHtml = data.notes.trim()
    ? '<div class="notes"><strong>Observações:</strong> ' + escapeHtml(data.notes) + "</div>"
    : "";

  const html =
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
    "<title>" + escapeHtml(data.studentName) + " - Treino " + escapeHtml(data.slot) + "</title>" +
    "<style>" +
    "@page{size:A4;margin:12mm}" +
    "*{box-sizing:border-box}" +
    "body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#202a26}" +
    "header{padding:0 0 14px;border-bottom:5px solid #aad43d;margin-bottom:18px}" +
    ".brand{font-size:11px;font-weight:900;letter-spacing:.13em;color:#75952d}" +
    "h1{font-size:27px;margin:6px 0 4px}" +
    ".meta{color:#65716d;font-size:13px}" +
    ".notes{background:#f4f8e9;padding:11px 13px;border-radius:9px;margin:0 0 15px;font-size:12px}" +
    "table{width:100%;border-collapse:collapse;font-size:11px}" +
    "th{background:#202b27;color:#fff;text-align:left;padding:8px 6px}" +
    "td{padding:8px 6px;border-bottom:1px solid #dfe5df;vertical-align:top}" +
    "th:nth-child(1),td:nth-child(1){width:30px;text-align:center}" +
    "th:nth-child(2),td:nth-child(2){width:72px}" +
    "th:nth-child(4),td:nth-child(4),th:nth-child(5),td:nth-child(5){width:52px;text-align:center}" +
    "th:nth-child(6),td:nth-child(6){width:75px}" +
    "footer{font-size:10px;color:#7b8581;margin-top:18px;padding-top:9px;border-top:1px solid #ddd}" +
    "</style></head><body>" +
    "<header>" +
    '<div class="brand">DANILO MODESTO PERSONAL</div>' +
    "<h1>" + escapeHtml(data.studentName) + " — Treino " + escapeHtml(data.slot) + "</h1>" +
    '<div class="meta">' +
    escapeHtml(data.workoutName) + " · " +
    escapeHtml(data.protocolLabel) + " · Semana " + data.week +
    "</div></header>" +
    notesHtml +
    "<table><thead><tr>" +
    "<th>#</th><th>Seq.</th><th>Exercício</th><th>Séries</th><th>Reps</th><th>Carga</th><th>Observação</th>" +
    "</tr></thead><tbody>" + rows + "</tbody></table>" +
    "<footer>Ficha gerada pelo DMP — Danilo Modesto Personal</footer>" +
    "<script>window.onload=function(){setTimeout(function(){window.print()},300)};<\/script>" +
    "</body></html>";

  popup.document.write(html);
  popup.document.close();
}

export function exportWorkoutJpeg(data: WorkoutExportPayload) {
  if (!data.exercises.length) {
    alert("Adicione pelo menos um exercício.");
    return;
  }

  const width = 1400;
  const top = 250;
  const notesSpace = data.notes.trim() ? 110 : 25;
  const rowHeight = 92;
  const height = top + notesSpace + (data.exercises.length * rowHeight) + 90;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    alert("Não foi possível gerar a imagem.");
    return;
  }

  function wrapped(
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
    maxLines: number
  ) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    let line = "";
    let yy = y;
    let printed = 0;

    for (const word of words) {
      const candidate = line ? line + " " + word : word;

      if (ctx!.measureText(candidate).width > maxWidth && line) {
        ctx!.fillText(line, x, yy);
        printed++;

        if (printed >= maxLines) return;

        yy += lineHeight;
        line = word;
      } else {
        line = candidate;
      }
    }

    if (line && printed < maxLines) {
      ctx!.fillText(line, x, yy);
    }
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#202b27";
  ctx.fillRect(0, 0, width, 165);

  ctx.fillStyle = "#b6dd40";
  ctx.fillRect(0, 165, width, 9);

  ctx.fillStyle = "#b6dd40";
  ctx.font = "700 21px Arial";
  ctx.fillText("DANILO MODESTO PERSONAL", 70, 55);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 42px Arial";
  ctx.fillText(data.studentName + " — Treino " + data.slot, 70, 115);

  ctx.fillStyle = "#596660";
  ctx.font = "600 21px Arial";
  ctx.fillText(
    data.workoutName + " · " + data.protocolLabel + " · Semana " + data.week,
    70,
    218
  );

  let y = top;

  if (data.notes.trim()) {
    ctx.fillStyle = "#f4f8ea";
    ctx.fillRect(55, y, 1290, 85);

    ctx.fillStyle = "#56635d";
    ctx.font = "700 18px Arial";
    ctx.fillText("OBSERVAÇÕES", 75, y + 30);

    ctx.font = "18px Arial";
    wrapped(data.notes, 230, y + 30, 1080, 24, 2);

    y += 110;
  } else {
    y += 25;
  }

  data.exercises.forEach((exercise, index) => {
    if (index % 2 === 0) {
      ctx.fillStyle = "#f8faf7";
      ctx.fillRect(55, y - 8, 1290, rowHeight - 4);
    }

    ctx.fillStyle = "#759425";
    ctx.font = "700 21px Arial";
    ctx.fillText(String(index + 1).padStart(2, "0"), 75, y + 30);

    ctx.fillStyle = "#36423c";
    ctx.font = "700 17px Arial";
    ctx.fillText(exercise.block || "—", 125, y + 30);

    ctx.fillStyle = "#202a26";
    ctx.font = "700 21px Arial";
    wrapped(exercise.name, 250, y + 29, 495, 25, 2);

    ctx.fillStyle = "#596660";
    ctx.font = "18px Arial";
    ctx.fillText(exercise.sets || "—", 800, y + 29);
    ctx.fillText(exercise.reps || "—", 875, y + 29);
    ctx.fillText(exercise.load || "—", 970, y + 29);

    ctx.font = "16px Arial";
    wrapped(exercise.notes || "", 1090, y + 28, 230, 21, 2);

    y += rowHeight;
  });

  ctx.strokeStyle = "#dbe1dc";
  ctx.beginPath();
  ctx.moveTo(55, y + 8);
  ctx.lineTo(1345, y + 8);
  ctx.stroke();

  ctx.fillStyle = "#78837e";
  ctx.font = "16px Arial";
  ctx.fillText("Ficha gerada pelo DMP — Danilo Modesto Personal", 70, y + 48);

  canvas.toBlob(blob => {
    if (!blob) {
      alert("Não foi possível gerar o JPEG.");
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download =
      safeFilename(data.studentName + "_Treino_" + data.slot + "_" + data.workoutName) + ".jpg";

    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/jpeg", 0.94);
}
