import { unzipSync } from "fflate";

const decoder = new TextDecoder("utf-8");

const colIndexFromRef = (cellRef: string) => {
  const letters = cellRef.replace(/\d/g, "").toUpperCase();
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + letter.charCodeAt(0) - 64;
  }
  return Math.max(0, index - 1);
};

const textContent = (node: Element) => Array.from(node.getElementsByTagName("t")).map((item) => item.textContent ?? "").join("");

const readXml = (files: Record<string, Uint8Array>, path: string) => {
  const file = files[path];
  if (!file) return null;
  return new DOMParser().parseFromString(decoder.decode(file), "application/xml");
};

const getFirstSheetPath = (files: Record<string, Uint8Array>) => {
  const workbook = readXml(files, "xl/workbook.xml");
  const rels = readXml(files, "xl/_rels/workbook.xml.rels");
  if (!workbook || !rels) return "xl/worksheets/sheet1.xml";

  const firstSheet = workbook.getElementsByTagName("sheet")[0];
  const relId = firstSheet?.getAttribute("r:id");
  if (!relId) return "xl/worksheets/sheet1.xml";

  const relationship = Array.from(rels.getElementsByTagName("Relationship")).find(
    (item) => item.getAttribute("Id") === relId,
  );
  const target = relationship?.getAttribute("Target") ?? "worksheets/sheet1.xml";
  const normalizedTarget = target.startsWith("/") ? target.slice(1) : target;
  return normalizedTarget.startsWith("xl/") ? normalizedTarget : `xl/${normalizedTarget}`;
};

export const readXlsxRows = async (file: File): Promise<string[][]> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const files = unzipSync(bytes);

  const sharedStringsXml = readXml(files, "xl/sharedStrings.xml");
  const sharedStrings = sharedStringsXml
    ? Array.from(sharedStringsXml.getElementsByTagName("si")).map((item) => textContent(item))
    : [];

  const sheetPath = getFirstSheetPath(files);
  const sheetXml = readXml(files, sheetPath);
  if (!sheetXml) {
    throw new Error("未找到第一个工作表");
  }

  return Array.from(sheetXml.getElementsByTagName("row")).map((row) => {
    const values: string[] = [];
    Array.from(row.getElementsByTagName("c")).forEach((cell) => {
      const ref = cell.getAttribute("r") ?? "";
      const colIndex = colIndexFromRef(ref);
      const type = cell.getAttribute("t");
      let value = "";

      if (type === "s") {
        const raw = cell.getElementsByTagName("v")[0]?.textContent ?? "";
        value = sharedStrings[Number(raw)] ?? "";
      } else if (type === "inlineStr") {
        value = textContent(cell);
      } else {
        value = cell.getElementsByTagName("v")[0]?.textContent ?? cell.textContent ?? "";
      }

      values[colIndex] = value.trim();
    });
    return values;
  });
};
