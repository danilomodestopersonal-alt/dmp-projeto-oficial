/** Phone validation is scoped to the birthday action; never edits the cadastro. */
export function birthdayPhone(phone?: string): string | null {
  const raw = (phone || "").trim();
  if (!raw || !/^\+?[\d\s().-]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  let number: string;
  if (raw.startsWith("+")) number = digits;
  else if (digits.length === 10 || digits.length === 11) number = "55" + digits;
  else if (digits.startsWith("55") && [12, 13].includes(digits.length)) number = digits;
  else return null;
  if (!/^[1-9]\d{7,14}$/.test(number) || /^(\d)\1+$/.test(number)) return null;
  if (number.startsWith("55")) {
    const local = number.slice(2), ddd = local.slice(0, 2), subscriber = local.slice(2);
    const validDdd = /^(1[1-9]|2[12478]|3[1-578]|4[1-9]|5[1345]|6[1-9]|7[134579]|8[1-9]|9[1-9])$/;
    if (!validDdd.test(ddd) || !(/^[2-5]\d{7}$/.test(subscriber) || /^9\d{8}$/.test(subscriber)) || /^(\d)\1+$/.test(subscriber)) return null;
  }
  return number;
}

export function birthdayMessage(name: string): string {
  const firstName = name.trim().split(/\s+/)[0] || "";
  return `Parabéns${firstName ? ", " + firstName : ""}! 🎉🎂\n\nTe desejo muita saúde, felicidade e um ano incrível!\n\nGrande abraço! 💪\n\nDanilo Modesto Personal`;
}

export function birthdayRecipient(student: {name: string; phone?: string}) {
  const phone = birthdayPhone(student.phone);
  const message = birthdayMessage(student.name);
  return {name: student.name, phone, message, url: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : null};
}

export type BirthdayImage = {blob: Blob; png: Blob | null; filename: string};

/** Keep the configured image bytes for downloading; PNG is only a clipboard copy. */
export async function loadBirthdayImage(source: string, signal: AbortSignal): Promise<BirthdayImage> {
  if (!/^(data:image\/(jpeg|png|webp|gif);base64,|https:\/\/|\/(?!\/))/i.test(source)) throw Error("Imagem de aniversário indisponível.");
  const response = await fetch(source, {signal});
  if (!response.ok) throw Error("Não foi possível carregar a imagem de aniversário.");
  const blob = await response.blob();
  const extension = ({"image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "image/gif":"gif"} as Record<string,string>)[blob.type];
  if (!extension || !blob.size || blob.size > 10_000_000) throw Error("Imagem de aniversário inválida.");
  let png: Blob | null = blob.type === "image/png" ? blob : null;
  if (!png && blob.type !== "image/gif" && typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (context) {context.drawImage(bitmap, 0, 0); png = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));}
      } finally {bitmap.close();}
    } catch { /* Download remains available when clipboard conversion is unsupported. */ }
  }
  return {blob, png, filename: `parabens.${extension}`};
}

export async function copyBirthdayImage(image: BirthdayImage): Promise<boolean> {
  if (!image.png || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") return false;
  try {await navigator.clipboard.write([new ClipboardItem({"image/png": image.png})]); return true;}
  catch {return false;}
}

export function downloadBirthdayImage(image: BirthdayImage): void {
  const url = URL.createObjectURL(image.blob), anchor = document.createElement("a");
  anchor.href = url; anchor.download = image.filename; document.body.appendChild(anchor);
  anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
