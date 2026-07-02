import type { OptionKey, Question } from "../data/questions";

export type CoachFeedback = {
  verdict: "待作答" | "待自评" | "答对" | "答错";
  confidence: number;
  rootCause: string;
  summary: string;
  coachPoints: string[];
  drills: string[];
  nextAction: string;
};

export const normalizeAnswer = (answer: OptionKey[]) => [...answer].sort().join("");

export const isCorrectAnswer = (question: Question, selected: OptionKey[]) =>
  question.type !== "简答" &&
  normalizeAnswer(question.answer) === normalizeAnswer(selected);

export const formatAnswer = (answer: OptionKey[]) => normalizeAnswer(answer).split("").join("、");

export const formatQuestionAnswer = (question: Question) =>
  question.type === "简答"
    ? question.referenceAnswer || "暂未提供参考答案，可先作为开放题自我作答。"
    : formatAnswer(question.answer);

const textOf = (question: Question, key: OptionKey) =>
  question.options.find((option) => option.key === key)?.text ?? key;

export const buildCoachFeedback = (question: Question, selected: OptionKey[], writtenAnswer = "", submitted = false): CoachFeedback => {
  if (question.type === "简答") {
    const hasDraft = writtenAnswer.trim().length > 0;
    if (!submitted && !hasDraft) {
      return {
        verdict: "待作答",
        confidence: 67,
        rootCause: "先写出自己的答案",
        summary: "简答题不会自动判分。先在空白区写出要点，再点击提交或显示答案进行自评。",
        coachPoints: [
          `本题考点：${question.concept}`,
          `建议限时：${question.estimatedMinutes} 分钟内完成`,
          "先列关键词，再补完整表述。",
        ],
        drills: question.coachHints,
        nextAction: "先独立作答，再对照参考答案补漏。",
      };
    }

    return {
      verdict: "待自评",
      confidence: 82,
      rootCause: "简答题需人工对照要点",
      summary: hasDraft
        ? "已记录你的自答。请对照参考答案检查关键词、步骤、结论是否完整。"
        : "你可以直接显示参考答案，但建议补写自己的答案后再自评。",
      coachPoints: [
        `参考答案：${formatQuestionAnswer(question)}`,
        `核心考点：${question.concept}`,
        `复盘重点：${question.coachHints.join(" -> ")}`,
      ],
      drills: ["给自己的答案划出关键词", "标记遗漏要点", "24 小时后不看答案复述一次"],
      nextAction: "加入今日计划，稍后按要点复述。",
    };
  }

  if (selected.length === 0) {
    return {
      verdict: "待作答",
      confidence: 64,
      rootCause: "尚未提交答案",
      summary: "先按考试节奏完成选择，提交后我会根据选项差异定位错因。",
      coachPoints: [
        `本题考点：${question.concept}`,
        `建议限时：${question.estimatedMinutes} 分钟内完成`,
        `高频陷阱：${question.traps[0]}`,
      ],
      drills: question.coachHints,
      nextAction: "先独立作答，再看解析与错因。",
    };
  }

  const correct = isCorrectAnswer(question, selected);
  const missing = question.answer.filter((item) => !selected.includes(item));
  const extra = selected.filter((item) => !question.answer.includes(item));
  const selectedText = selected.map((key) => `${key}.${textOf(question, key)}`).join("；");

  if (correct) {
    return {
      verdict: "答对",
      confidence: 91,
      rootCause: "关键规则识别正确",
      summary: `你选择了 ${formatAnswer(selected)}，命中标准答案。下一步要确认自己不是靠猜测，而是能复述解题路径。`,
      coachPoints: [
        `标准答案：${formatAnswer(question.answer)}`,
        `核心考点：${question.concept}`,
        `复盘重点：${question.coachHints.join(" -> ")}`,
      ],
      drills: [
        "不看解析复述一次解题链路",
        "把本题改一个条件，判断答案是否变化",
        "24 小时后用同考点题做一次巩固",
      ],
      nextAction: "标记为已掌握，或继续同章节下一题。",
    };
  }

  const missingText =
    missing.length > 0 ? `漏选 ${missing.map((key) => `${key}.${textOf(question, key)}`).join("；")}` : "";
  const extraText =
    extra.length > 0 ? `误选 ${extra.map((key) => `${key}.${textOf(question, key)}`).join("；")}` : "";
  const cause =
    missing.length > 0 && extra.length > 0
      ? "规则识别不完整且存在干扰项误判"
      : missing.length > 0
        ? "关键条件漏读或多选覆盖不足"
        : "干扰项识别不足";

  return {
    verdict: "答错",
    confidence: 88,
    rootCause: cause,
    summary: `你选择了 ${selectedText}。${[missingText, extraText].filter(Boolean).join("，")}。建议先回到题干条件，不要直接背答案。`,
    coachPoints: [
      `标准答案：${formatAnswer(question.answer)}`,
      `错因定位：${cause}`,
      `本题陷阱：${question.traps.join("；")}`,
      `核心考点：${question.concept}`,
    ],
    drills: [
      ...question.coachHints,
      "把错因写成一句话，再做同考点变式题",
      "加入错题队列，间隔 1 天、3 天、7 天复盘",
    ],
    nextAction: "加入错题强化计划，并优先练 3 道同考点题。",
  };
};
