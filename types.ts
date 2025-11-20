export interface Language {
  id: string;
  name: string;
  flag: string; // Emoji flag
  code: string; // Helper for display or logic if needed
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  isFinal: boolean;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface AudioConfig {
  sampleRate: number;
}