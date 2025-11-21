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
  corsProxy: string;
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

export interface HistoryAction {
  type: 'COMMENT' | 'HOURS' | 'BATCH';
  worklogId?: string;
  previousData: any;
  newData: any;
}

export enum LoadingState {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS'
}

export const DEFAULT_SYSTEM_PROMPT = `Sen, kıdemli bir SAP Business One (SAP B1) danışmanısın. Görevin, teknik ve kısa tutulmuş "worklog" notlarını alıp, bu notları müşterinin anlayabileceği, yapılan işin kapsamını ve değerini gösteren, profesyonel ve detaylı bir metne dönüştürmektir.`;