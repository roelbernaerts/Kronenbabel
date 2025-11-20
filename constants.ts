import { Language } from './types';

export const DUTCH_LANGUAGE: Language = {
  id: 'nl',
  name: 'Dutch (You)',
  flag: '🇧🇪',
  code: 'Dutch',
};

export const TARGET_LANGUAGES: Language[] = [
  { id: 'uk', name: 'Ukrainian', flag: '🇺🇦', code: 'Ukrainian' },
  { id: 'pl', name: 'Polish', flag: '🇵🇱', code: 'Polish' },
  { id: 'ru', name: 'Russian', flag: '🇷🇺', code: 'Russian' }, // Common lingua franca
  { id: 'fr', name: 'French', flag: '🇫🇷', code: 'French' },
  { id: 'es', name: 'Spanish', flag: '🇪🇸', code: 'Spanish' },
  { id: 'it', name: 'Italian', flag: '🇮🇹', code: 'Italian' },
  { id: 'pt', name: 'Portuguese', flag: '🇵🇹', code: 'Portuguese' },
  { id: 'de', name: 'German', flag: '🇩🇪', code: 'German' },
  { id: 'lv', name: 'Latvian', flag: '🇱🇻', code: 'Latvian' },
  { id: 'th', name: 'Thai', flag: '🇹🇭', code: 'Thai' },
  { id: 'tn', name: 'Tunisian Arabic', flag: '🇹🇳', code: 'Tunisian Arabic' },
  { id: 'ae', name: 'Emirati Arabic', flag: '🇦🇪', code: 'Emirati Arabic' },
  { id: 'ir', name: 'Iranian (Persian)', flag: '🇮🇷', code: 'Persian' },
  { id: 'ro', name: 'Romanian', flag: '🇷🇴', code: 'Romanian' },
  { id: 'bg', name: 'Bulgarian', flag: '🇧🇬', code: 'Bulgarian' },
  { id: 'el', name: 'Greek', flag: '🇬🇷', code: 'Greek' },
];

export const SYSTEM_INSTRUCTION_TEMPLATE = (targetLang: string) => `
You are Kronenbabel, an expert simultaneous interpreter facilitating a conversation between a landlord (speaking Dutch) and a tenant (speaking ${targetLang}).

Your Goal:
- When you hear Dutch, translate it immediately and verbally into ${targetLang}.
- When you hear ${targetLang}, translate it immediately and verbally into Dutch.
- If you hear a language that is neither, ask (in both Dutch and ${targetLang}) for clarification.

Guidelines:
- Be concise and accurate.
- Maintain a professional, helpful tone.
- Do not add filler phrases like "I will translate now". Just translate the content.
- You are acting as a direct voice bridge.
- Only translate, do not ask for clarification
`;
