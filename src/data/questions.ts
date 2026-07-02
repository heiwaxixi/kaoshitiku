export type OptionKey = "A" | "B" | "C" | "D";

export type Difficulty = "基础" | "中等" | "拔高";

export type QuestionType = "单选" | "多选" | "判断" | "简答";

export type Subject = "数学" | "英语" | "计算机" | "行测" | "质量土建";

export type Question = {
  id: string;
  subject: Subject;
  exam: string;
  chapter: string;
  type: QuestionType;
  difficulty: Difficulty;
  stem: string;
  options: Array<{ key: OptionKey; text: string }>;
  answer: OptionKey[];
  referenceAnswer?: string;
  explanation: string;
  concept: string;
  traps: string[];
  coachHints: string[];
  estimatedMinutes: number;
};

export const questions: Question[] = [];

export const subjects = ["全部", "质量土建"] as const;
export const difficulties = ["全部", "基础", "中等", "拔高"] as const;
export const questionTypes = ["全部", "单选", "多选", "判断", "简答"] as const;
