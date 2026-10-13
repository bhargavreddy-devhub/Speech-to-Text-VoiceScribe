export interface Language {
  code: string;
  name: string;
}

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi' },
  { code: 'te', name: 'Telugu' },
  { code: 'ta', name: 'Tamil' },
  { code: 'kn', name: 'Kannada' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'bn', name: 'Bengali' },
  { code: 'mr', name: 'Marathi' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'ur', name: 'Urdu' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese (Simplified)' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'ar', name: 'Arabic' },
  { code: 'tr', name: 'Turkish' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'th', name: 'Thai' },
  { code: 'id', name: 'Indonesian' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'el', name: 'Greek' },
  { code: 'he', name: 'Hebrew' },
  { code: 'sw', name: 'Swahili' },
  { code: 'ne', name: 'Nepali' },
  { code: 'si', name: 'Sinhala' },
];

export function languageName(code: string | null | undefined): string {
  if (!code) return code ?? '';
  const found = LANGUAGES.find((l) => l.code === code);
  return found ? found.name : code;
}
