export interface Worklog {
  id: string;
  issueKey: string;
  summary: string;
  seconds: number;
  hours: number;
  comment: string;
  started: string; // ISO Date string
  author?: string;
  originalADF?: any; // Store original ADF to prevent formatting loss if not edited
}

export interface AppSettings {
  jiraUrl: string;
  jiraEmail: string;
  jiraToken: string;
  groqApiKey: string;
  groqModel: string;
  targetDailyHours: number;
  minHoursPerWorklog: number;
  aiSystemPrompt: string;
  isDarkTheme: boolean;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  timestamp: number;
}

// Extended notification with action data for undo capability
export interface NotificationHistoryItem extends Notification {
  undoAction?: UndoAction;
  dismissed?: boolean;
  // AI değişiklikleri için diff bilgisi
  diff?: {
    before: string;
    after: string;
    issueKey?: string;
  };
}

// Undo action types for reverting operations
export interface UndoAction {
  type: 'CREATE' | 'UPDATE' | 'BATCH_UPDATE' | 'BATCH_CREATE';
  data: UndoData[];
}

export interface UndoData {
  worklogId: string;
  issueKey: string;
  previousSeconds?: number;
  previousComment?: string;
  newSeconds?: number;
  newComment?: string;
}

// AI Text Change Preview for showing before/after
export interface TextChangePreview {
  worklogId: string;
  issueKey: string;
  summary: string;
  before: string;
  after: string;
  mode: 'IMPROVE' | 'SPELL';
}

// Smart suggestion based on worklog history
export interface WorklogSuggestion {
  issueKey: string;
  summary: string;
  lastComment: string;
  avgHours: number;
  frequency: number; // How many times used
  lastUsed: string; // Date
  minHours?: number; // Minimum hours logged
  maxHours?: number; // Maximum hours logged
  totalHours?: number; // Total hours logged historically
}

// Worklog template for quick entry
export interface WorklogTemplate {
  id: string;
  name: string;
  issueKey?: string; // Optional - can be generic
  comment: string;
  defaultHours: number;
  category?: string; // e.g., "Meeting", "Development", "Testing"
  usageCount: number;
  createdAt: string;
}

// Jira Issue for search results
export interface JiraIssue {
  key: string;
  summary: string;
  issueType?: string;
  status?: string;
  projectName?: string;
  description?: string; // Jira'daki issue açıklaması
}

export interface HistoryAction {
  type: 'COMMENT' | 'HOURS' | 'BATCH';
  worklogId?: string;
  previousData: any;
  newData: any;
}

// Weekly report types
export interface WeeklyReportItem {
  issueKey: string;
  summary: string;
  status: 'devam' | 'test' | 'tamamlandı' | 'yeni';
  day: 'Pazartesi' | 'Salı' | 'Çarşamba' | 'Perşembe' | 'Cuma';
  description: string;
  hours?: number;
}

export interface WeeklyReport {
  weekStart: string; // YYYY-MM-DD
  weekEnd: string;
  items: WeeklyReportItem[];
}

export enum LoadingState {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS'
}

export const DEFAULT_SYSTEM_PROMPT = `Sen, kıdemli bir SAP Business One (SAP B1) danışmanısın. Görevin, teknik ve kısa tutulmuş "worklog" notlarını alıp, bu notları müşterinin anlayabileceği, yapılan işin kapsamını ve değerini gösteren, profesyonel ve detaylı bir metne dönüştürmektir.`;
