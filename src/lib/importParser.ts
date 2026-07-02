import type { Difficulty, OptionKey, Question, QuestionType, Subject } from "../data/questions";

type ParsedDraft = {
  question: Question;
  sourceIndex: number;
  warnings: string[];
  raw: string;
};

export type ImportParseResult = {
  drafts: ParsedDraft[];
  rejected: Array<{ sourceIndex: number; reason: string; raw: string }>;
};

type ImportDefaults = {
  subject: Subject;
  exam: string;
  chapter: string;
  difficulty: Difficulty;
};

const optionKeys: OptionKey[] = ["A", "B", "C", "D"];
const subjectValues: Subject[] = ["数学", "英语", "计算机", "行测", "质量土建"];
const difficultyValues: Difficulty[] = ["基础", "中等", "拔高"];

const normalizeLine = (line: string) => line.replace(/\uFEFF/g, "").trim();

const normalizeAnswer = (value: string): OptionKey[] => {
  const upper = value.toUpperCase();
  if (/^(对|正确|TRUE|T)$/.test(upper)) return ["A"];
  if (/^(错|错误|FALSE|F)$/.test(upper)) return ["B"];
  return upper
    .replace(/[^ABCD]/g, "")
    .split("")
    .filter((key, index, all): key is OptionKey => optionKeys.includes(key as OptionKey) && all.indexOf(key) === index);
};

const normalizeReferenceAnswer = (value: string) =>
  value.trim() || "暂未提供参考答案，可先作为开放题自我作答，后续再补充标准答案。";

const isShortAnswerType = (value: string) => /简答|问答|主观|论述|案例|计算题|填空/.test(value);

const parseOptionsText = (value: string) => {
  const normalized = value
    .replace(/\$;\$/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/([^\n])\s*([A-D])\s*[\.\、\)]/g, "$1\n$2.");
  const options: Array<{ key: OptionKey; text: string }> = [];
  let nextOptionIndex = 0;
  normalized.split("\n").forEach((line) => {
    const cleaned = line.trim().replace(/^[;；]+|[;；]+$/g, "");
    if (!cleaned) return;
    const match = cleaned.match(/^([A-D])\s*(?:[\.\、\)]\s*)?(.+)$/i);
    if (match) {
      const key = match[1].toUpperCase() as OptionKey;
      options.push({ key, text: match[2].trim().replace(/^[;；]+|[;；]+$/g, "") });
      nextOptionIndex = Math.max(nextOptionIndex, optionKeys.indexOf(key) + 1);
      return;
    }
    if (options.length > 0 && nextOptionIndex < optionKeys.length) {
      options.push({ key: optionKeys[nextOptionIndex], text: cleaned });
      nextOptionIndex += 1;
    }
  });
  const deduped = new Map<OptionKey, string>();
  options.forEach((option) => {
    if (option.text) deduped.set(option.key, option.text);
  });
  return optionKeys
    .filter((key) => deduped.has(key))
    .map((key) => ({ key, text: deduped.get(key) ?? "" }));
};

const inferType = (raw: string, options: Array<{ key: OptionKey; text: string }>, answer: OptionKey[]): QuestionType => {
  if (isShortAnswerType(raw) || options.length < 2) return "简答";
  if (/判断|正误|对错/.test(raw)) return "判断";
  const optionTexts = options.map((option) => option.text.replace(/\s/g, ""));
  if (optionTexts.length === 2 && optionTexts.includes("正确") && optionTexts.includes("错误")) return "判断";
  if (optionTexts.length === 2 && optionTexts.includes("对") && optionTexts.includes("错")) return "判断";
  if (/多选|多项/.test(raw) || answer.length > 1) return "多选";
  return "单选";
};

const stripStemPrefix = (line: string) =>
  line
    .replace(/^\s*\d+[\.\、\)]\s*/, "")
    .replace(/^\s*[【\[]?(单选|多选|判断|简答|问答|主观题|单项选择题|多项选择题|简答题)[】\]]?[:：]?\s*/, "")
    .trim();

const parseMetadata = (raw: string, defaults: ImportDefaults) => {
  const pick = <T extends string>(pattern: RegExp, allowed: readonly T[], fallback: T): T => {
    const match = raw.match(pattern);
    if (!match) return fallback;
    const value = match[1]?.trim() as T;
    return allowed.includes(value) ? value : fallback;
  };

  return {
    subject: pick(/(?:科目|学科)[:：]\s*([^\n；;]+)/, subjectValues, defaults.subject),
    difficulty: pick(/(?:难度)[:：]\s*([^\n；;]+)/, difficultyValues, defaults.difficulty),
    exam: raw.match(/(?:考试|试卷)[:：]\s*([^\n；;]+)/)?.[1]?.trim() || defaults.exam,
    chapter: raw.match(/(?:章节|知识点|考点)[:：]\s*([^\n；;]+)/)?.[1]?.trim() || defaults.chapter,
  };
};

const splitBlocks = (text: string) => {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const chunks = normalized
    .split(/\n\s*\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (chunks.length > 1) return chunks;

  const lines = normalized
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean);
  const blocks: string[] = [];
  let current: string[] = [];
  lines.forEach((line) => {
    const looksLikeStart = /^\d+[\.\、\)]\s*/.test(line) || /^[【\[]?(单选|多选|判断|简答)[】\]]/.test(line);
    if (looksLikeStart && current.length > 0 && current.some((item) => /^(答案|正确答案)[:：]/.test(item))) {
      blocks.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  });
  if (current.length > 0) blocks.push(current.join("\n"));
  return blocks;
};

const parseCsvLine = (line: string) => {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
};

const parseCsv = (text: string, defaults: ImportDefaults): ImportParseResult | null => {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean);
  if (lines.length < 2 || !lines[0].includes(",")) return null;

  const headers = parseCsvLine(lines[0]);
  const stemIndex = headers.findIndex((header) => /题干|题目|问题/.test(header));
  const answerIndex = headers.findIndex((header) => /答案|正确答案/.test(header));
  if (stemIndex < 0) return null;

  const drafts: ParsedDraft[] = [];
  const rejected: ImportParseResult["rejected"] = [];

  lines.slice(1).forEach((line, rowIndex) => {
    const sourceIndex = rowIndex + 1;
    const cells = parseCsvLine(line);
    const stem = cells[stemIndex]?.trim();
    const answerRaw = answerIndex >= 0 ? (cells[answerIndex] ?? "") : "";
    const answer = normalizeAnswer(answerRaw);
    const options = optionKeys
      .map((key) => {
        const index = headers.findIndex((header) => header.trim().toUpperCase() === key || header.includes(`选项${key}`));
        return index >= 0 && cells[index] ? { key, text: cells[index].trim() } : null;
      })
      .filter((option): option is { key: OptionKey; text: string } => Boolean(option));

    if (!stem) {
      rejected.push({ sourceIndex, reason: "CSV 行缺少题干", raw: line });
      return;
    }

    const typeCell = cells[headers.findIndex((header) => /题型|类型/.test(header))] ?? "";
    const subjectCell = cells[headers.findIndex((header) => /科目|学科/.test(header))];
    const difficultyCell = cells[headers.findIndex((header) => /难度/.test(header))];
    const chapterCell = cells[headers.findIndex((header) => /章节|知识点|考点/.test(header))];
    const examCell = cells[headers.findIndex((header) => /考试|试卷/.test(header))];
    const explanationCell = cells[headers.findIndex((header) => /解析|说明/.test(header))];
    const conceptCell = cells[headers.findIndex((header) => /考点|知识点/.test(header))];
    const raw = line;
    const shouldImportAsShortAnswer = isShortAnswerType(typeCell) || options.length < 2;

    if (!shouldImportAsShortAnswer && answer.length === 0) {
      rejected.push({ sourceIndex, reason: "CSV 客观题未识别到答案", raw: line });
      return;
    }

    const type =
      shouldImportAsShortAnswer
        ? "简答"
        : typeCell && ["单选", "多选", "判断"].includes(typeCell)
        ? (typeCell as QuestionType)
        : inferType(raw, options, answer);
    const subject = subjectValues.includes(subjectCell as Subject) ? (subjectCell as Subject) : defaults.subject;
    const difficulty = difficultyValues.includes(difficultyCell as Difficulty)
      ? (difficultyCell as Difficulty)
      : defaults.difficulty;
    const warnings: string[] = [];
    if (shouldImportAsShortAnswer && answerRaw.trim().length === 0) warnings.push("未提供参考答案，已按开放简答题导入");
    if (shouldImportAsShortAnswer && options.length > 0) warnings.push("选项不足 2 个，已转为简答题");
    if (typeCell && typeCell !== type) warnings.push(`题型已按内容自动修正为${type}`);
    drafts.push({
      sourceIndex,
      raw,
      warnings,
      question: {
        id: `IMP-${Date.now()}-${sourceIndex}`,
        subject,
        exam: examCell || defaults.exam,
        chapter: chapterCell || defaults.chapter,
        type,
        difficulty,
        stem,
        options: shouldImportAsShortAnswer ? [] : options,
        answer: shouldImportAsShortAnswer ? [] : answer,
        referenceAnswer: shouldImportAsShortAnswer ? normalizeReferenceAnswer(answerRaw) : undefined,
        explanation:
          explanationCell ||
          (shouldImportAsShortAnswer ? "简答题请先独立作答，再对照参考答案补充要点。" : "导入题暂未提供解析，可后续补充。"),
        concept: conceptCell || chapterCell || defaults.chapter,
        traps: ["导入题需人工补充高频陷阱"],
        coachHints:
          type === "简答"
            ? ["先列关键词", "再补完整表述", "对照参考答案检查遗漏要点"]
            : ["先定位题干关键词", "逐项排除干扰项", "复盘答案对应依据"],
        estimatedMinutes: type === "简答" ? 5 : type === "多选" ? 4 : 2,
      },
    });
  });

  return { drafts, rejected };
};

const normalizeQuestionType = (value: string, raw: string, options: Array<{ key: OptionKey; text: string }>, answer: OptionKey[]) => {
  if (isShortAnswerType(value) || options.length < 2) return "简答";
  if (/单选/.test(value)) return "单选";
  if (/多选/.test(value)) return "多选";
  if (/判断/.test(value)) return "判断";
  return inferType(raw, options, answer);
};

const normalizeDifficulty = (value: string, fallback: Difficulty): Difficulty => {
  if (/基础|易/.test(value)) return "基础";
  if (/进阶|拔高|难/.test(value)) return "拔高";
  if (/中/.test(value)) return "中等";
  return fallback;
};

export const parseQuestionRows = (rows: string[][], defaults: ImportDefaults): ImportParseResult => {
  const nonEmptyRows = rows.filter((row) => row.some((cell) => String(cell ?? "").trim()));
  const headerIndex = nonEmptyRows.findIndex((row) => {
    const normalized = row.map((cell) => String(cell ?? "").trim().replace(/\s+/g, ""));
    return (
      normalized.some((cell) => /试题正文|题干|题目/.test(cell)) &&
      normalized.some((cell) => /题型|类型/.test(cell))
    );
  });
  if (headerIndex < 0) {
    return { drafts: [], rejected: [{ sourceIndex: 1, reason: "未找到表头行", raw: "" }] };
  }

  const headers = nonEmptyRows[headerIndex].map((cell) => String(cell ?? "").trim().replace(/\s+/g, ""));
  const findHeader = (...patterns: RegExp[]) => headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
  const indexes = {
    stem: findHeader(/试题正文/, /题干/, /题目/),
    options: findHeader(/试题选项/, /^选项$/),
    answer: findHeader(/试题答案/, /正确答案/, /^答案$/),
    explanation: findHeader(/答案解析/, /解析/, /说明/),
    type: findHeader(/题型/, /类型/),
    major1: findHeader(/一级专业/, /科目/, /学科/),
    major2: findHeader(/二级专业/, /章节/, /知识点/, /考点/),
    difficulty: findHeader(/难度/),
    source: findHeader(/依据/, /出处/, /来源/),
  };

  if (indexes.stem < 0) {
    return { drafts: [], rejected: [{ sourceIndex: 1, reason: "表头缺少题干列", raw: headers.join(",") }] };
  }

  const drafts: ParsedDraft[] = [];
  const rejected: ImportParseResult["rejected"] = [];

  nonEmptyRows.slice(headerIndex + 1).forEach((row, rowIndex) => {
    const sourceIndex = rowIndex + 1;
    const get = (index: number) => (index >= 0 ? String(row[index] ?? "").trim() : "");
    const stem = get(indexes.stem);
    const rawOptions = get(indexes.options);
    const answerRaw = get(indexes.answer);
    const answer = normalizeAnswer(answerRaw);
    const options = parseOptionsText(rawOptions);
    const source = get(indexes.source);
    const rowType = get(indexes.type);
    const shouldImportAsShortAnswer = isShortAnswerType(rowType) || options.length < 2;

    if (!stem) return;
    if (!shouldImportAsShortAnswer && answer.length === 0) {
      rejected.push({ sourceIndex, reason: "客观题未识别到答案", raw: stem });
      return;
    }

    const type = shouldImportAsShortAnswer ? "简答" : normalizeQuestionType(rowType, stem, options, answer);
    const chapter = get(indexes.major2) || get(indexes.major1) || defaults.chapter;
    const explanation =
      get(indexes.explanation) ||
      source ||
      (type === "简答" ? "简答题请先独立作答，再对照参考答案补充要点。" : "导入题暂未提供解析，可后续补充。");
    const warnings: string[] = [];
    if (source && !get(indexes.explanation)) warnings.push("已使用依据出处作为解析补充");
    if (type === "简答" && answerRaw.trim().length === 0) warnings.push("未提供参考答案，已按开放简答题导入");
    if (type === "简答" && options.length > 0) warnings.push("选项不足 2 个，已转为简答题");
    if (type !== "简答" && answer.some((key) => !options.some((option) => option.key === key))) {
      warnings.push("答案未在选项中出现，请复核");
    }

    drafts.push({
      sourceIndex,
      raw: row.join(" | "),
      warnings,
      question: {
        id: `IMP-${sourceIndex}`,
        subject: "质量土建",
        exam: defaults.exam,
        chapter,
        type,
        difficulty: normalizeDifficulty(get(indexes.difficulty), defaults.difficulty),
        stem,
        options: type === "简答" ? [] : options,
        answer: type === "简答" ? [] : answer,
        referenceAnswer: type === "简答" ? normalizeReferenceAnswer(answerRaw) : undefined,
        explanation,
        concept: chapter,
        traps: ["导入题需人工补充高频陷阱"],
        coachHints:
          type === "简答"
            ? ["先列关键词", "再补完整表述", "对照参考答案检查遗漏要点"]
            : ["先定位题干关键词", "逐项排除干扰项", "复盘答案对应依据"],
        estimatedMinutes: type === "简答" ? 5 : type === "多选" ? 4 : 2,
      },
    });
  });

  return { drafts, rejected };
};

const parseBlock = (raw: string, sourceIndex: number, defaults: ImportDefaults): ParsedDraft | { reason: string } => {
  const lines = raw
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean);

  const optionLines: Array<{ key: OptionKey; text: string; lineIndex: number }> = [];
  const stemLines: string[] = [];
  let answer: OptionKey[] = [];
  let answerRaw = "";
  let explanation = "";

  lines.forEach((line, lineIndex) => {
    const optionMatch = line.match(/^([A-D])[\.\、\)]\s*(.+)$/i);
    const answerMatch = line.match(/^(?:答案|正确答案)[:：]\s*(.+)$/);
    const explanationMatch = line.match(/^(?:解析|说明)[:：]\s*(.+)$/);
    if (optionMatch) {
      optionLines.push({ key: optionMatch[1].toUpperCase() as OptionKey, text: optionMatch[2].trim(), lineIndex });
    } else if (answerMatch) {
      answerRaw = answerMatch[1].trim();
      answer = normalizeAnswer(answerRaw);
    } else if (explanationMatch) {
      explanation = explanationMatch[1].trim();
    } else if (!/^(?:科目|学科|考试|试卷|章节|知识点|考点|难度)[:：]/.test(line)) {
      stemLines.push(stripStemPrefix(line));
    }
  });

  const options = optionLines.map(({ key, text }) => ({ key, text }));
  if (options.length === 0 && /判断|正误|对错/.test(raw)) {
    options.push({ key: "A", text: "正确" }, { key: "B", text: "错误" });
  }

  const firstOptionLine = optionLines[0]?.lineIndex ?? lines.length;
  const stem = stemLines
    .filter((_, index) => index < firstOptionLine || optionLines.length === 0)
    .join(" ")
    .trim();

  if (!stem) return { reason: "未识别到题干" };

  const metadata = parseMetadata(raw, defaults);
  const type = inferType(raw, options, answer);
  if (type !== "简答" && options.length < 2) return { reason: "未识别到至少 2 个选项" };
  if (type !== "简答" && answer.length === 0) return { reason: "未识别到答案" };
  const warnings: string[] = [];
  if (type === "简答" && answerRaw.length === 0) warnings.push("未提供参考答案，已按开放简答题导入");
  if (type !== "简答" && !/^(?:答案|正确答案)[:：]/m.test(raw)) warnings.push("答案格式不标准，已尝试自动识别");
  if (!/^(?:解析|说明)[:：]/m.test(raw)) warnings.push("未提供解析，已填入默认解析");
  if (type === "判断" && options.length > 2) warnings.push("判断题通常只保留两个选项，请复核");
  if (type === "简答" && optionLines.length > 0) warnings.push("选项不足 2 个，已转为简答题");

  return {
    sourceIndex,
    raw,
    warnings,
    question: {
      id: `IMP-${Date.now()}-${sourceIndex}`,
      subject: metadata.subject,
      exam: metadata.exam,
      chapter: metadata.chapter,
      type,
      difficulty: metadata.difficulty,
      stem,
      options: type === "简答" ? [] : options,
      answer: type === "简答" ? [] : answer,
      referenceAnswer: type === "简答" ? normalizeReferenceAnswer(answerRaw) : undefined,
      explanation: explanation || (type === "简答" ? "简答题请先独立作答，再对照参考答案补充要点。" : "导入题暂未提供解析，可后续补充。"),
      concept: metadata.chapter,
      traps: ["导入题需人工补充高频陷阱"],
      coachHints:
        type === "简答"
          ? ["先列关键词", "再补完整表述", "对照参考答案检查遗漏要点"]
          : ["先定位题干关键词", "逐项排除干扰项", "复盘答案对应依据"],
      estimatedMinutes: type === "简答" ? 5 : type === "多选" ? 4 : 2,
    },
  };
};

export const parseQuestionImport = (text: string, defaults: ImportDefaults): ImportParseResult => {
  const csvResult = parseCsv(text, defaults);
  if (csvResult) return csvResult;

  const drafts: ParsedDraft[] = [];
  const rejected: ImportParseResult["rejected"] = [];
  splitBlocks(text).forEach((block, index) => {
    const sourceIndex = index + 1;
    const parsed = parseBlock(block, sourceIndex, defaults);
    if ("reason" in parsed) {
      rejected.push({ sourceIndex, reason: parsed.reason, raw: block });
    } else {
      drafts.push(parsed);
    }
  });
  return { drafts, rejected };
};
