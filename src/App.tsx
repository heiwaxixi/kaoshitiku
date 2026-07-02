import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Filter,
  Flag,
  FolderOpen,
  GraduationCap,
  Layers,
  ListChecks,
  LockKeyhole,
  PenLine,
  Plus,
  RotateCcw,
  Search,
  Target,
  WandSparkles,
  XCircle,
} from "lucide-react";
import {
  difficulties,
  questionTypes,
  subjects,
  type OptionKey,
  type Question,
} from "./data/questions";
import { qualityBankMeta, qualityQuestions } from "./data/qualityQuestions";
import { buildCoachFeedback, formatAnswer, formatQuestionAnswer, isCorrectAnswer } from "./lib/coach";
import { parseQuestionImport, parseQuestionRows, type ImportParseResult } from "./lib/importParser";
import { readXlsxRows } from "./lib/xlsxReader";

type AnswerRecord = {
  questionId: string;
  selected: OptionKey[];
  writtenAnswer?: string;
  correct: boolean;
  createdAt: string;
  status: "待复盘" | "已掌握";
};

type QuestionBank = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  source: "内置" | "导入";
  questions: Question[];
};

type ViewMode = "catalog" | "practice";
type CollapsibleSection = "coach" | "wrong" | "profile" | "plan" | "bankList" | "importRejected";

const initialHistory: AnswerRecord[] = [];

const initialQuestionBanks: QuestionBank[] = [
  {
    id: qualityBankMeta.id,
    name: qualityBankMeta.name,
    description: qualityBankMeta.description,
    createdAt: qualityBankMeta.createdAt,
    source: "内置",
    questions: qualityQuestions,
  },
];

const formatNow = () =>
  new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });

const formatToday = () =>
  new Date().toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const sampleImportText = `1. [单选] 对于有抗渗要求的混凝土，砂的含泥量不应大于（  ）。
A. 1.0%
B. 2.0%
C. 3.0%
D. 5.0%
答案：C
解析：《混凝土结构通用规范》GB55008-2021 第 3.1.2 条。

2. [多选] 芯柱混凝土施工应符合哪些要求？
A. 应分段浇筑并振捣密实
B. 应对芯柱混凝土浇灌的密实程度进行检测
C. 可随意浇筑，无需振捣
D. 浇筑完成后无需检测
答案：AB
解析：芯柱混凝土应按规范要求浇筑、振捣并检测密实程度。

3. [简答] 砌体结构工程施工质量验收应包括哪些内容？
答案：水泥强度及安定性评定；块材、砂浆、混凝土强度评定；钢筋品种、规格、数量和设置部位；灰缝砂浆饱满度；转角、交接处和构造柱马牙槎砌筑质量；挡土墙泄水孔质量；后植钢筋轴向受拉承载力。
解析：简答题导入后会显示题干和答题空白区，点击显示答案后对照参考答案自评。`;

const importDefaults = {
  subject: "质量土建",
  exam: "质量考试题库",
  chapter: "土建质量",
  difficulty: "中等",
} as const;

const ACCESS_CODE = import.meta.env.VITE_ACCESS_CODE || "20260702";
const ACCESS_STORAGE_KEY = "exam-ai-bank-access-granted";

const getStoredAccessGranted = () => {
  try {
    return window.localStorage.getItem(ACCESS_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

const getQuestionSubjectText = (bank: QuestionBank) => {
  const subjectList = Array.from(new Set(bank.questions.map((question) => question.subject)));
  return subjectList.length > 0 ? subjectList.join(" / ") : "暂无科目";
};

const getQuestionTypeText = (bank: QuestionBank) => {
  const typeList = Array.from(new Set(bank.questions.map((question) => question.type)));
  return typeList.length > 0 ? typeList.join(" / ") : "暂无题型";
};

const getImportBankName = (sourceName: string) => {
  if (!sourceName || sourceName === "粘贴导入") {
    return `粘贴导入题库 ${formatToday()}`;
  }
  const withoutExtension = sourceName.replace(/\.[^.]+$/, "");
  if (/质量|土建|辽宁|新疆/.test(withoutExtension)) {
    return "质量土建导入题库";
  }
  return `${withoutExtension}题库`;
};

const formatRecordAnswer = (record: AnswerRecord) => {
  if (record.writtenAnswer?.trim()) {
    return `自答：${record.writtenAnswer.trim().slice(0, 28)}${record.writtenAnswer.trim().length > 28 ? "..." : ""}`;
  }
  if (record.selected.length > 0) {
    return `选 ${formatAnswer(record.selected)}`;
  }
  return "简答自评";
};

function App() {
  const [accessGranted, setAccessGranted] = useState(getStoredAccessGranted);
  const [accessInput, setAccessInput] = useState("");
  const [accessError, setAccessError] = useState("");
  const [questionBanks, setQuestionBanks] = useState<QuestionBank[]>(initialQuestionBanks);
  const [viewMode, setViewMode] = useState<ViewMode>("catalog");
  const [activeBankId, setActiveBankId] = useState(initialQuestionBanks[0]?.id ?? "");
  const [subjectFilter, setSubjectFilter] = useState<(typeof subjects)[number]>("全部");
  const [difficultyFilter, setDifficultyFilter] = useState<(typeof difficulties)[number]>("全部");
  const [typeFilter, setTypeFilter] = useState<(typeof questionTypes)[number]>("全部");
  const [query, setQuery] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [activeQuestionId, setActiveQuestionId] = useState(initialQuestionBanks[0]?.questions[0]?.id ?? "");
  const [selected, setSelected] = useState<OptionKey[]>([]);
  const [writtenAnswer, setWrittenAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [history, setHistory] = useState<AnswerRecord[]>(initialHistory);
  const [planItems, setPlanItems] = useState<string[]>(() => qualityQuestions.slice(0, 8).map((question) => question.id));
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState(sampleImportText);
  const [importResult, setImportResult] = useState<ImportParseResult | null>(null);
  const [importSourceName, setImportSourceName] = useState("粘贴导入");
  const [collapsedSections, setCollapsedSections] = useState<Record<CollapsibleSection, boolean>>({
    coach: true,
    wrong: true,
    profile: true,
    plan: true,
    bankList: true,
    importRejected: true,
  });

  const activeBank = useMemo(
    () => questionBanks.find((bank) => bank.id === activeBankId) ?? questionBanks[0],
    [activeBankId, questionBanks],
  );
  const questionBank = activeBank?.questions ?? [];
  const allQuestions = useMemo(() => questionBanks.flatMap((bank) => bank.questions), [questionBanks]);
  const questionMap = useMemo(
    () => new Map(allQuestions.map((question) => [question.id, question])),
    [allQuestions],
  );
  const activeQuestionIds = useMemo(() => new Set(questionBank.map((question) => question.id)), [questionBank]);
  const bankHistory = useMemo(
    () => history.filter((record) => activeQuestionIds.has(record.questionId)),
    [activeQuestionIds, history],
  );
  const getQuestionById = (id: string) => questionMap.get(id);

  const filteredQuestions = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return questionBank.filter((question) => {
      const matchesSubject = subjectFilter === "全部" || question.subject === subjectFilter;
      const matchesDifficulty = difficultyFilter === "全部" || question.difficulty === difficultyFilter;
      const matchesType = typeFilter === "全部" || question.type === typeFilter;
      const matchesQuery =
        lowerQuery.length === 0 ||
        [question.stem, question.chapter, question.exam, question.concept]
          .join(" ")
          .toLowerCase()
          .includes(lowerQuery);
      return matchesSubject && matchesDifficulty && matchesType && matchesQuery;
    });
  }, [difficultyFilter, query, questionBank, subjectFilter, typeFilter]);

  useEffect(() => {
    if (filteredQuestions.length === 0) {
      if (activeQuestionId !== "") {
        setActiveQuestionId("");
      }
      return;
    }
    if (!filteredQuestions.some((question) => question.id === activeQuestionId)) {
      setActiveQuestionId(filteredQuestions[0].id);
      setSelected([]);
      setWrittenAnswer("");
      setSubmitted(false);
    }
  }, [activeQuestionId, filteredQuestions]);

  const activeQuestion = filteredQuestions.find((question) => question.id === activeQuestionId) ?? filteredQuestions[0];
  const isShortAnswerQuestion = activeQuestion?.type === "简答";
  const feedback = activeQuestion ? buildCoachFeedback(activeQuestion, submitted ? selected : [], writtenAnswer, submitted) : null;
  const answerVisible = Boolean(activeQuestion && (submitted || showAnswer));

  const latestWrongRecords = useMemo(() => {
    const latest = new Map<string, AnswerRecord>();
    bankHistory.forEach((record) => {
      if (!record.correct && record.status === "待复盘" && !latest.has(record.questionId)) {
        latest.set(record.questionId, record);
      }
    });
    return Array.from(latest.entries())
      .map(([questionId, record]) => ({ question: getQuestionById(questionId), record }))
      .filter((item): item is { question: Question; record: AnswerRecord } => Boolean(item.question));
  }, [bankHistory, questionMap]);

  const stats = useMemo(() => {
    const total = bankHistory.length;
    const correct = bankHistory.filter((record) => record.correct).length;
    const wrong = bankHistory.filter((record) => !record.correct && record.status === "待复盘").length;
    const mastered = bankHistory.filter((record) => record.status === "已掌握").length;
    return {
      total,
      correct,
      wrong,
      mastered,
      accuracy: total === 0 ? 0 : Math.round((correct / total) * 100),
    };
  }, [bankHistory]);

  const subjectStats = useMemo(
    () =>
      subjects
        .filter((subject) => subject !== "全部" && questionBank.some((question) => question.subject === subject))
        .map((subject) => {
          const subjectQuestions = questionBank.filter((question) => question.subject === subject);
          const attempts = bankHistory.filter((record) => getQuestionById(record.questionId)?.subject === subject);
          const correct = attempts.filter((record) => record.correct || record.status === "已掌握").length;
          const progress =
            attempts.length === 0 || subjectQuestions.length === 0
              ? 0
              : Math.min(100, Math.round((correct / subjectQuestions.length) * 100));
          return { subject, progress, attempts: attempts.length };
        }),
    [bankHistory, questionBank, questionMap],
  );

  const activePlanItems = useMemo(
    () => planItems.filter((id) => activeQuestionIds.has(id)),
    [activeQuestionIds, planItems],
  );

  const bankCatalogStats = useMemo(() => {
    const lowerQuery = catalogQuery.trim().toLowerCase();
    return questionBanks
      .map((bank) => {
        const bankQuestionIds = new Set(bank.questions.map((question) => question.id));
        const attempts = history.filter((record) => bankQuestionIds.has(record.questionId));
        const correct = attempts.filter((record) => record.correct).length;
        const wrong = attempts.filter((record) => !record.correct && record.status === "待复盘").length;
        return {
          bank,
          attempts: attempts.length,
          accuracy: attempts.length === 0 ? 0 : Math.round((correct / attempts.length) * 100),
          wrong,
          subjectText: getQuestionSubjectText(bank),
          typeText: getQuestionTypeText(bank),
        };
      })
      .filter(({ bank, subjectText, typeText }) => {
        if (!lowerQuery) return true;
        return [bank.name, bank.description, subjectText, typeText].join(" ").toLowerCase().includes(lowerQuery);
      });
  }, [catalogQuery, history, questionBanks]);

  const toggleSection = (section: CollapsibleSection) => {
    setCollapsedSections((current) => ({ ...current, [section]: !current[section] }));
  };

  const resetPracticeFilters = () => {
    setSubjectFilter("全部");
    setDifficultyFilter("全部");
    setTypeFilter("全部");
    setQuery("");
  };

  const enterBank = (bankId: string) => {
    const nextBank = questionBanks.find((bank) => bank.id === bankId);
    if (!nextBank) return;
    setActiveBankId(nextBank.id);
    setActiveQuestionId(nextBank.questions[0]?.id ?? "");
    setViewMode("practice");
    setSelected([]);
    setWrittenAnswer("");
    setSubmitted(false);
    setShowAnswer(false);
    setImportOpen(false);
    resetPracticeFilters();
  };

  const openCatalog = () => {
    setViewMode("catalog");
    setImportOpen(false);
    setSelected([]);
    setWrittenAnswer("");
    setSubmitted(false);
    setShowAnswer(false);
  };

  const selectOption = (key: OptionKey) => {
    if (!activeQuestion) return;
    if (activeQuestion.type === "简答") return;
    setSubmitted(false);
    setSelected((current) => {
      if (activeQuestion.type === "多选") {
        return current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
      }
      return [key];
    });
  };

  const submitAnswer = () => {
    if (!activeQuestion) return;
    if (activeQuestion.type !== "简答" && selected.length === 0) return;
    if (activeQuestion.type === "简答" && writtenAnswer.trim().length === 0) return;
    const correct = activeQuestion.type === "简答" ? false : isCorrectAnswer(activeQuestion, selected);
    setSubmitted(true);
    setHistory((current) => [
      {
        questionId: activeQuestion.id,
        selected,
        writtenAnswer: activeQuestion.type === "简答" ? writtenAnswer.trim() : undefined,
        correct,
        createdAt: `今日 ${formatNow()}`,
        status: activeQuestion.type === "简答" ? "待复盘" : correct ? "已掌握" : "待复盘",
      },
      ...current,
    ]);
    if (!correct) {
      setPlanItems((current) => [activeQuestion.id, ...current.filter((id) => id !== activeQuestion.id)].slice(0, 8));
    }
  };

  const moveToQuestion = (questionId: string) => {
    setViewMode("practice");
    setActiveQuestionId(questionId);
    setSelected([]);
    setWrittenAnswer("");
    setSubmitted(false);
  };

  const moveNext = () => {
    if (!activeQuestion || filteredQuestions.length === 0) return;
    const currentIndex = filteredQuestions.findIndex((question) => question.id === activeQuestion.id);
    const next = filteredQuestions[(currentIndex + 1) % filteredQuestions.length];
    moveToQuestion(next.id);
  };

  const movePrevious = () => {
    if (!activeQuestion || filteredQuestions.length === 0) return;
    const currentIndex = filteredQuestions.findIndex((question) => question.id === activeQuestion.id);
    const previous = filteredQuestions[(currentIndex - 1 + filteredQuestions.length) % filteredQuestions.length];
    moveToQuestion(previous.id);
  };

  const addActiveToPlan = () => {
    if (!activeQuestion) return;
    setPlanItems((current) => [activeQuestion.id, ...current.filter((id) => id !== activeQuestion.id)].slice(0, 8));
  };

  const markMastered = (questionId: string) => {
    setHistory((current) =>
      current.map((record) =>
        record.questionId === questionId && !record.correct ? { ...record, status: "已掌握" } : record,
      ),
    );
  };

  const runImportParse = () => {
    setImportSourceName("粘贴导入");
    setImportResult(parseQuestionImport(importText, importDefaults));
    setCollapsedSections((current) => ({ ...current, importRejected: true }));
  };

  const importParsedQuestions = () => {
    if (!importResult || importResult.drafts.length === 0) return;
    const bankId = `bank-import-${Date.now()}`;
    const idPrefix = Date.now().toString(36).toUpperCase();
    const imported = importResult.drafts.map((draft, index) => ({
      ...draft.question,
      id: `IMP-${idPrefix}-${String(index + 1).padStart(4, "0")}`,
    }));
    const newBank: QuestionBank = {
      id: bankId,
      name: getImportBankName(importSourceName),
      description: `${importSourceName} 自动识别生成，已导入 ${imported.length} 道试题。`,
      createdAt: `导入 ${formatToday()}`,
      source: "导入",
      questions: imported,
    };
    setQuestionBanks((current) => [newBank, ...current]);
    setActiveBankId(bankId);
    setActiveQuestionId(imported[0].id);
    setViewMode("practice");
    resetPracticeFilters();
    setSelected([]);
    setWrittenAnswer("");
    setSubmitted(false);
    setShowAnswer(false);
    setPlanItems((current) => [...imported.slice(0, 8).map((question) => question.id), ...current].slice(0, 8));
    setImportOpen(false);
  };

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    setImportSourceName(file.name);
    try {
      if (/\.xlsx$/i.test(file.name)) {
        const rows = await readXlsxRows(file);
        const result = parseQuestionRows(rows, {
          ...importDefaults,
          subject: "质量土建",
          exam: "质量考试题库",
          chapter: "土建质量",
        });
        setImportText(
          `已读取 Excel：${file.name}\n共 ${rows.length} 行，识别 ${result.drafts.length} 道可练习试题，${result.rejected.length} 道暂未导入。\n确认后会建立独立题库目录。`,
        );
        setImportResult(result);
        setCollapsedSections((current) => ({ ...current, importRejected: true }));
      } else {
        const content = await file.text();
        setImportText(content);
        setImportResult(parseQuestionImport(content, importDefaults));
        setCollapsedSections((current) => ({ ...current, importRejected: true }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "文件读取失败";
      setImportText(`读取失败：${file.name}\n${message}`);
      setImportResult({ drafts: [], rejected: [{ sourceIndex: 1, reason: message, raw: file.name }] });
      setCollapsedSections((current) => ({ ...current, importRejected: false }));
    }
    setImportOpen(true);
  };

  const submitAccessCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (accessInput.trim() !== ACCESS_CODE) {
      setAccessError("访问码不正确，请重新输入。");
      return;
    }
    try {
      window.localStorage.setItem(ACCESS_STORAGE_KEY, "true");
    } catch {
      // localStorage 被禁用时仍允许本次会话进入。
    }
    setAccessError("");
    setAccessGranted(true);
  };

  if (!accessGranted) {
    return (
      <AccessGate
        accessInput={accessInput}
        accessError={accessError}
        onAccessInputChange={setAccessInput}
        onSubmit={submitAccessCode}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <div className="brand">
          <div className="brand-mark">
            <BrainCircuit size={22} />
          </div>
          <div>
            <strong>考试 AI 题库</strong>
            <span>错题教练工作台</span>
          </div>
        </div>

        <nav className="nav-list">
          <button className={`nav-item ${viewMode === "catalog" ? "active" : ""}`} onClick={openCatalog}>
            <FolderOpen size={18} />
            题库目录
          </button>
          <button className={`nav-item ${viewMode === "practice" ? "active" : ""}`} onClick={() => setViewMode("practice")}>
            <BookOpen size={18} />
            当前练习
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setViewMode("practice");
              setCollapsedSections((current) => ({ ...current, wrong: false }));
            }}
          >
            <ClipboardList size={18} />
            错题本
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setViewMode("practice");
              setCollapsedSections((current) => ({ ...current, coach: false }));
            }}
          >
            <WandSparkles size={18} />
            AI 教练
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setViewMode("practice");
              setCollapsedSections((current) => ({ ...current, profile: false }));
            }}
          >
            <BarChart3 size={18} />
            掌握度
          </button>
        </nav>

        <div className="sidebar-block">
          <div className="sidebar-title">当前目标</div>
          <div className="goal-row">
            <Target size={16} />
            <span>完成 20 题</span>
            <strong>{Math.min(stats.total, 20)}/20</strong>
          </div>
          <div className="goal-row">
            <Clock size={16} />
            <span>错题复盘</span>
            <strong>{stats.wrong}</strong>
          </div>
        </div>

        <div className="sidebar-block compact">
          <div className="sidebar-title">题库目录</div>
          <p>
            当前共 {questionBanks.length} 个目录。导入 TXT/CSV/XLSX 后会自动建立新的独立题库。
          </p>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="section-label">{viewMode === "catalog" ? "题库目录" : "独立练习"}</p>
            <h1>{viewMode === "catalog" ? "选择题库目录" : activeBank?.name ?? "AI 题库与错题教练"}</h1>
          </div>
          <div className="top-actions">
            <div className="search-box">
              <Search size={18} />
              <input
                value={viewMode === "catalog" ? catalogQuery : query}
                onChange={(event) => {
                  if (viewMode === "catalog") {
                    setCatalogQuery(event.target.value);
                  } else {
                    setQuery(event.target.value);
                  }
                }}
                placeholder={viewMode === "catalog" ? "搜索题库名称、科目" : "搜索题干、考点、章节"}
                aria-label={viewMode === "catalog" ? "搜索题库目录" : "搜索题库"}
              />
            </div>
            <button className="primary-button" onClick={() => setImportOpen((current) => !current)}>
              <Plus size={18} />
              导入题库
            </button>
          </div>
        </header>

        {importOpen ? (
          <section className="panel import-panel" aria-label="导入题库">
            <div className="panel-heading">
              <div>
                <p className="section-label">导入题库</p>
                <h2>自动识别题型、题干和选项</h2>
              </div>
              <label className="file-button">
                上传 TXT/CSV/XLSX
                <input
                  type="file"
                  accept=".txt,.csv,.xlsx,text/plain,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => handleImportFile(event.target.files?.[0])}
                />
              </label>
            </div>

            <div className="import-grid">
              <div className="import-editor">
                <textarea
                  value={importText}
                  onChange={(event) => {
                    setImportText(event.target.value);
                    setImportSourceName("粘贴导入");
                    setImportResult(null);
                  }}
                  aria-label="导入题库文本"
                />
                <div className="action-row">
                  <button className="primary-button" onClick={runImportParse}>
                    <ClipboardList size={18} />
                    解析预览
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setImportText(sampleImportText);
                      setImportSourceName("粘贴导入");
                      setImportResult(null);
                    }}
                  >
                    使用示例
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setImportText("");
                      setImportSourceName("粘贴导入");
                      setImportResult(null);
                    }}
                  >
                    清空
                  </button>
                </div>
              </div>

              <div className="import-preview">
                <div className="import-status">
                  <strong>{importResult ? `${importResult.drafts.length} 题可导入` : "等待解析"}</strong>
                  <span>
                    {importResult ? `${importResult.rejected.length} 段未通过` : "确认导入后建立新的题库目录"}
                  </span>
                </div>

                {importResult ? (
                  <>
                    <div className="preview-list">
                      {importResult.drafts.slice(0, 80).map((draft) => (
                        <div className="preview-row" key={`${draft.sourceIndex}-${draft.question.stem}`}>
                          <div>
                            <strong>
                              {draft.sourceIndex}. {draft.question.type} · {draft.question.chapter}
                            </strong>
                            <span>{draft.question.stem}</span>
                          </div>
                          <em>{draft.question.type === "简答" ? "答题空白" : draft.question.options.map((option) => option.key).join("")}</em>
                          <small>
                            {draft.question.type === "简答" ? "参考答案" : `答案：${formatAnswer(draft.question.answer)}`}
                          </small>
                          {draft.warnings.length > 0 ? <small className="warning">{draft.warnings.join("；")}</small> : null}
                        </div>
                      ))}
                      {importResult.drafts.length > 80 ? (
                        <div className="preview-more">仅预览前 80 题，确认导入会写入全部 {importResult.drafts.length} 题。</div>
                      ) : null}
                    </div>
                    {importResult.rejected.length > 0 ? (
                      <div className="rejected-panel">
                        <div className="rejected-head">
                          <div>
                            <strong>未导入模块</strong>
                            <span>{importResult.rejected.length} 段需要整理，展开后查看原因</span>
                          </div>
                          <CollapseToggle
                            collapsed={collapsedSections.importRejected}
                            onClick={() => toggleSection("importRejected")}
                            label="未导入模块"
                          />
                        </div>
                        {collapsedSections.importRejected ? (
                          <CollapsedSummary text={`有 ${importResult.rejected.length} 段未导入，通常是缺题干、客观题缺答案或表头不匹配。`} />
                        ) : (
                          <div className="rejected-list">
                            {importResult.rejected.map((item) => (
                              <div className="rejected-row" key={`${item.sourceIndex}-${item.reason}-${item.raw.slice(0, 16)}`}>
                                <strong>第 {item.sourceIndex} 段：{item.reason}</strong>
                                <span>{item.raw || "无原始内容"}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                    <button className="coach-action" disabled={importResult.drafts.length === 0} onClick={importParsedQuestions}>
                      <Plus size={17} />
                      确认导入并建立题库目录
                    </button>
                  </>
                ) : (
                  <div className="import-help">
                    <p>客观题格式：题干独立成段，选项用 A. B. C. D.，答案用“答案：B”或“答案：ABD”。</p>
                    <p>简答题格式：只写题干也能导入；如有参考答案，使用“答案：参考内容”。</p>
                    <p>CSV 至少包含“题干”列；客观题建议包含 A、B、C、D、答案列，可选“题型、科目、章节、难度、解析”。</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {viewMode === "catalog" ? (
          <section className="catalog-panel" aria-label="题库目录">
            <div className="catalog-hero">
              <div>
                <p className="section-label">题库目录</p>
                <h2>每个目录都是独立练习空间</h2>
                <p>选择目录进入后，只练该题库内的试题；导入文件会自动生成一个新的题库目录。</p>
              </div>
              <div className="catalog-total">
                <strong>{questionBanks.length}</strong>
                <span>个题库目录</span>
              </div>
            </div>

            <div className="catalog-grid">
              {bankCatalogStats.map(({ bank, attempts, accuracy, wrong, subjectText, typeText }) => (
                <button
                  className={`bank-card ${activeBank?.id === bank.id ? "active" : ""}`}
                  key={bank.id}
                  onClick={() => enterBank(bank.id)}
                >
                  <div className="bank-card-head">
                    <span className={`source-badge ${bank.source === "导入" ? "imported" : ""}`}>{bank.source}</span>
                    <span>{bank.createdAt}</span>
                  </div>
                  <h2>{bank.name}</h2>
                  <p>{bank.description}</p>
                  <div className="bank-metrics">
                    <Metric label="题目数" value={bank.questions.length} tone="blue" />
                    <Metric label="已练" value={attempts} tone="green" />
                    <Metric label="错题" value={wrong} tone="red" />
                    <Metric label="正确率" value={accuracy} tone="amber" />
                  </div>
                  <div className="bank-tags">
                    <span>{subjectText}</span>
                    <span>{typeText}</span>
                  </div>
                  <div className="bank-enter">
                    进入独立题库练习
                    <ChevronRight size={17} />
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <>
            <section className="practice-toolbar">
              <button className="secondary-button" onClick={openCatalog}>
                <ArrowLeft size={17} />
                返回题库目录
              </button>
              <div className="practice-meta">
                <strong>{activeBank?.name}</strong>
                <span>
                  {questionBank.length} 题 · {getQuestionSubjectText(activeBank)} · {getQuestionTypeText(activeBank)}
                </span>
              </div>
            </section>

            <section className="filter-strip" aria-label="题库筛选">
              <div className="filter-title">
                <Filter size={16} />
                筛选
              </div>
              <SegmentedControl value={subjectFilter} values={subjects} onChange={setSubjectFilter} />
              <SegmentedControl value={difficultyFilter} values={difficulties} onChange={setDifficultyFilter} />
              <SegmentedControl value={typeFilter} values={questionTypes} onChange={setTypeFilter} />
              <button className="icon-button" title="重置筛选" onClick={resetPracticeFilters}>
                <RotateCcw size={17} />
              </button>
            </section>

            {activeQuestion ? (
              <>
                <div className="content-grid">
                  <section className="panel question-panel">
                    <div className="panel-heading">
                      <div>
                        <p className="section-label">当前题目</p>
                        <h2>{activeQuestion.chapter}</h2>
                      </div>
                      <div className="question-index">
                        {filteredQuestions.findIndex((question) => question.id === activeQuestion.id) + 1}/
                        {filteredQuestions.length}
                      </div>
                    </div>

                    <div className="meta-row">
                      <span>{activeQuestion.exam}</span>
                      <span>{activeQuestion.subject}</span>
                      <span>{activeQuestion.type}</span>
                      <span>{activeQuestion.difficulty}</span>
                      <span>{activeQuestion.estimatedMinutes} 分钟</span>
                    </div>

                    <p className="stem">{activeQuestion.stem}</p>

                    {isShortAnswerQuestion ? (
                      <div className="short-answer-area">
                        <label htmlFor="short-answer-input">答题空白区</label>
                        <textarea
                          id="short-answer-input"
                          value={writtenAnswer}
                          onChange={(event) => {
                            setWrittenAnswer(event.target.value);
                            setSubmitted(false);
                          }}
                          placeholder="先写下自己的答案要点，再点击提交自答或显示答案。"
                        />
                      </div>
                    ) : (
                      <div className="options" role="group" aria-label="答案选项">
                        {activeQuestion.options.map((option) => {
                          const isSelected = selected.includes(option.key);
                          const isRight = answerVisible && activeQuestion.answer.includes(option.key);
                          const isWrong = submitted && isSelected && !activeQuestion.answer.includes(option.key);
                          return (
                            <button
                              key={option.key}
                              className={[
                                "option-row",
                                isSelected ? "selected" : "",
                                isRight ? "right" : "",
                                isWrong ? "wrong" : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              onClick={() => selectOption(option.key)}
                            >
                              <span className="option-key">{option.key}</span>
                              <span>{option.text}</span>
                              {isRight ? <CheckCircle2 size={18} /> : null}
                              {isWrong ? <XCircle size={18} /> : null}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="action-row">
                      <button
                        className="primary-button"
                        disabled={isShortAnswerQuestion ? writtenAnswer.trim().length === 0 : selected.length === 0}
                        onClick={submitAnswer}
                      >
                        <CheckCircle2 size={18} />
                        {isShortAnswerQuestion ? "提交自答" : "提交答案"}
                      </button>
                      <button className="secondary-button" onClick={addActiveToPlan}>
                        <Plus size={18} />
                        加入计划
                      </button>
                      <button
                        className={`secondary-button answer-toggle ${answerVisible ? "active" : ""}`}
                        disabled={submitted}
                        onClick={() => setShowAnswer((current) => !current)}
                      >
                        {showAnswer ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
                        {submitted ? "答案已显示" : showAnswer ? "隐藏答案" : "显示答案"}
                      </button>
                      <button className="secondary-button" onClick={movePrevious}>
                        <ChevronLeft size={18} />
                        上一题
                      </button>
                      <button className="secondary-button" onClick={moveNext}>
                        下一题
                        <ChevronRight size={18} />
                      </button>
                    </div>

                    {answerVisible ? (
                      <div
                        className={`result-box ${
                          submitted && !isShortAnswerQuestion
                            ? isCorrectAnswer(activeQuestion, selected)
                              ? "correct"
                              : "incorrect"
                            : "answer-reveal"
                        }`}
                      >
                        <div className="result-title">
                          {submitted && !isShortAnswerQuestion ? (
                            isCorrectAnswer(activeQuestion, selected) ? (
                              <CheckCircle2 size={18} />
                            ) : (
                              <AlertCircle size={18} />
                            )
                          ) : (
                            <CheckCircle2 size={18} />
                          )}
                          {isShortAnswerQuestion
                            ? submitted
                              ? "已记录自答"
                              : "参考答案"
                            : submitted
                              ? isCorrectAnswer(activeQuestion, selected)
                                ? "回答正确"
                                : "回答错误"
                              : "标准答案"}
                          <span className="answer-pill">
                            {isShortAnswerQuestion ? "参考答案" : `答案：${formatAnswer(activeQuestion.answer)}`}
                          </span>
                        </div>
                        {isShortAnswerQuestion ? (
                          <p className="reference-answer">
                            <strong>参考答案：</strong>
                            {formatQuestionAnswer(activeQuestion)}
                          </p>
                        ) : null}
                        {activeQuestion.explanation ? (
                          <p>
                            <strong>答案解析：</strong>
                            {activeQuestion.explanation}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </section>

                </div>

                <section className="support-grid">
                  <aside className="panel coach-panel">
                    <div className="panel-heading">
                      <div>
                        <p className="section-label">本地 AI 教练</p>
                        <h2>错因诊断</h2>
                      </div>
                      <div className="panel-heading-actions">
                        <div className={`verdict ${feedback?.verdict === "答错" ? "bad" : ""}`}>{feedback?.verdict}</div>
                        <CollapseToggle
                          collapsed={collapsedSections.coach}
                          onClick={() => toggleSection("coach")}
                          label="本地 AI 教练"
                        />
                      </div>
                    </div>

                    {collapsedSections.coach ? (
                      <CollapsedSummary text={`${feedback?.verdict ?? "待作答"} · ${feedback?.rootCause ?? "提交后生成诊断"}`} />
                    ) : (
                      <div className="panel-body">
                        <div className="confidence">
                          <div>
                            <span>诊断可信度</span>
                            <strong>{feedback?.confidence}%</strong>
                          </div>
                          <div className="progress-track">
                            <span style={{ width: `${feedback?.confidence ?? 0}%` }} />
                          </div>
                        </div>

                        <div className="coach-summary">
                          <strong>{feedback?.rootCause}</strong>
                          <p>{feedback?.summary}</p>
                        </div>

                        <div className="coach-list">
                          <h3>教练提示</h3>
                          {feedback?.coachPoints.map((point) => (
                            <div className="coach-row" key={point}>
                              <Flag size={15} />
                              <span>{point}</span>
                            </div>
                          ))}
                        </div>

                        <div className="coach-list">
                          <h3>强化动作</h3>
                          {feedback?.drills.map((drill) => (
                            <div className="coach-row" key={drill}>
                              <ListChecks size={15} />
                              <span>{drill}</span>
                            </div>
                          ))}
                        </div>

                        <button className="coach-action" onClick={addActiveToPlan}>
                          <PenLine size={17} />
                          {feedback?.nextAction}
                        </button>
                      </div>
                    )}
                  </aside>

                  <aside className="panel wrong-panel priority-wrong">
                    <div className="panel-heading">
                      <div>
                        <p className="section-label">错题队列</p>
                        <h2>优先复盘</h2>
                      </div>
                      <div className="panel-heading-actions">
                        <span className="count-pill">{latestWrongRecords.length}</span>
                        <CollapseToggle
                          collapsed={collapsedSections.wrong}
                          onClick={() => toggleSection("wrong")}
                          label="错题队列"
                        />
                      </div>
                    </div>
                    {collapsedSections.wrong ? (
                      <CollapsedSummary text={`当前题库 ${latestWrongRecords.length} 道待复盘错题`} />
                    ) : (
                      <div className="wrong-list">
                        {latestWrongRecords.length > 0 ? (
                          latestWrongRecords.map(({ question, record }) => (
                            <div className="wrong-row" key={`${question.id}-${record.createdAt}`}>
                              <button onClick={() => moveToQuestion(question.id)}>
                                <strong>{question.chapter}</strong>
                                <span>
                                  {record.createdAt} · {formatRecordAnswer(record)} · {record.status}
                                </span>
                              </button>
                              <button className="text-button" onClick={() => markMastered(question.id)}>
                                已掌握
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="empty-inline">当前题库暂无待复盘错题。</div>
                        )}
                      </div>
                    )}
                  </aside>

                  <div className="panel stats-panel">
                    <div className="panel-heading">
                      <div>
                        <p className="section-label">学习画像</p>
                        <h2>掌握度统计</h2>
                      </div>
                      <div className="panel-heading-actions">
                        <strong className="accuracy">{stats.accuracy}%</strong>
                        <CollapseToggle
                          collapsed={collapsedSections.profile}
                          onClick={() => toggleSection("profile")}
                          label="学习画像"
                        />
                      </div>
                    </div>
                    {collapsedSections.profile ? (
                      <CollapsedSummary text={`已练 ${stats.total} 次，待复盘 ${stats.wrong} 题，正确率 ${stats.accuracy}%`} />
                    ) : (
                      <div className="panel-body">
                        <div className="metric-list">
                          <Metric label="已练题数" value={stats.total} tone="blue" />
                          <Metric label="答对次数" value={stats.correct} tone="green" />
                          <Metric label="待复盘错题" value={stats.wrong} tone="red" />
                          <Metric label="已掌握记录" value={stats.mastered} tone="amber" />
                        </div>
                        <div className="subject-bars">
                          {subjectStats.map((item) => (
                            <div className="subject-bar" key={item.subject}>
                              <span>{item.subject}</span>
                              <div className="progress-track">
                                <span style={{ width: `${item.progress}%` }} />
                              </div>
                              <strong>{item.progress}%</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="panel plan-panel">
                    <div className="panel-heading">
                      <div>
                        <p className="section-label">今日计划</p>
                        <h2>强化路径</h2>
                      </div>
                      <div className="panel-heading-actions">
                        <GraduationCap size={20} />
                        <CollapseToggle
                          collapsed={collapsedSections.plan}
                          onClick={() => toggleSection("plan")}
                          label="今日计划"
                        />
                      </div>
                    </div>
                    {collapsedSections.plan ? (
                      <CollapsedSummary text={`当前题库计划 ${activePlanItems.length} 题，可展开后跳转练习`} />
                    ) : (
                      <div className="plan-list">
                        {activePlanItems.length > 0 ? (
                          activePlanItems.map((id, index) => {
                            const question = getQuestionById(id);
                            if (!question) return null;
                            return (
                              <button className="plan-row" key={id} onClick={() => moveToQuestion(id)}>
                                <span>{index + 1}</span>
                                <div>
                                  <strong>{question.chapter}</strong>
                                  <small>
                                    {question.subject} · {question.difficulty} · {question.concept}
                                  </small>
                                </div>
                              </button>
                            );
                          })
                        ) : (
                          <div className="empty-inline">当前题库暂无计划题目，可在题目页点击“加入计划”。</div>
                        )}
                      </div>
                    )}
                  </div>
                </section>

                <section className="panel bank-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="section-label">当前题库清单</p>
                      <h2>{activeBank?.name}</h2>
                    </div>
                    <div className="panel-heading-actions">
                      <span className="count-pill">{filteredQuestions.length}</span>
                      <Layers size={20} />
                      <CollapseToggle
                        collapsed={collapsedSections.bankList}
                        onClick={() => toggleSection("bankList")}
                        label="当前题库清单"
                      />
                    </div>
                  </div>
                  {collapsedSections.bankList ? (
                    <CollapsedSummary text={`当前筛选结果 ${filteredQuestions.length} 题，展开后可点击任一题继续练习`} />
                  ) : (
                    <div className="question-table">
                      {filteredQuestions.map((question) => (
                        <button
                          className={question.id === activeQuestion.id ? "active" : ""}
                          key={question.id}
                          onClick={() => moveToQuestion(question.id)}
                        >
                          <span>{question.id}</span>
                          <strong>{question.id.startsWith("IMP-") ? question.stem.slice(0, 30) : question.chapter}</strong>
                          <em>{question.subject}</em>
                          <em>{question.difficulty}</em>
                          <small>{question.concept}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              </>
            ) : (
              <section className="panel empty-panel">
                <BookOpen size={34} />
                <h2>没有匹配题目</h2>
                <p>调整搜索词或筛选条件后继续练习，或返回目录选择其他题库。</p>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

type SegmentedControlProps<T extends string> = {
  value: T;
  values: readonly T[];
  onChange: (value: T) => void;
};

function SegmentedControl<T extends string>({ value, values, onChange }: SegmentedControlProps<T>) {
  return (
    <div className="segmented">
      {values.map((item) => (
        <button key={item} className={item === value ? "active" : ""} onClick={() => onChange(item)}>
          {item}
        </button>
      ))}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "blue" | "green" | "red" | "amber" }) {
  return (
    <div className={`metric-row ${tone}`}>
      <span>{label}</span>
      <strong>{label === "正确率" ? `${value}%` : value}</strong>
    </div>
  );
}

function CollapseToggle({ collapsed, onClick, label }: { collapsed: boolean; onClick: () => void; label: string }) {
  return (
    <button className="collapse-button" onClick={onClick} aria-expanded={!collapsed} aria-label={`${label}${collapsed ? "展开" : "收起"}`}>
      <ChevronRight size={15} />
      {collapsed ? "展开" : "收起"}
    </button>
  );
}

function CollapsedSummary({ text }: { text: string }) {
  return <div className="collapsed-summary">{text}</div>;
}

function AccessGate({
  accessInput,
  accessError,
  onAccessInputChange,
  onSubmit,
}: {
  accessInput: string;
  accessError: string;
  onAccessInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="access-shell">
      <section className="access-card" aria-label="内测访问码">
        <div className="access-mark">
          <LockKeyhole size={24} />
        </div>
        <p className="section-label">小规模内测</p>
        <h1>考试 AI 题库</h1>
        <p className="access-copy">请输入内测访问码后进入。当前版本为本地规则教练，不调用付费 AI 服务。</p>
        <form className="access-form" onSubmit={onSubmit}>
          <label htmlFor="access-code">访问码</label>
          <input
            id="access-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={accessInput}
            onChange={(event) => {
              onAccessInputChange(event.target.value);
            }}
            placeholder="请输入访问码"
          />
          {accessError ? <p className="access-error">{accessError}</p> : null}
          <button className="primary-button" type="submit">
            进入题库
          </button>
        </form>
      </section>
    </main>
  );
}

export default App;
