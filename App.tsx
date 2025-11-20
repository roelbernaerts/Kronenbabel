import React, { useState } from 'react';
import { Language } from './types';
import { DUTCH_LANGUAGE, TARGET_LANGUAGES } from './constants';
import TranslatorSession from './components/TranslatorSession';

const App: React.FC = () => {
  const [selectedTarget, setSelectedTarget] = useState<Language | null>(null);
  const [sessionActive, setSessionActive] = useState(false);

  const startSession = (lang: Language) => {
    setSelectedTarget(lang);
    setSessionActive(true);
  };

  const endSession = () => {
    setSessionActive(false);
    setSelectedTarget(null);
  };

  if (sessionActive && selectedTarget) {
    return <TranslatorSession targetLanguage={selectedTarget} onExit={endSession} />;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <main className="max-w-4xl mx-auto px-6 py-12">
        
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-slate-900 mb-4">
            Kronenbabel
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Seamless communication, at last! <br/>
            Select your opponent's language to begin a hands-free translation session.
          </p>
        </div>

        {/* Source Language (Fixed) */}
        <div className="mb-8 flex justify-center">
            <div className="bg-white rounded-full px-6 py-2 shadow-sm border border-slate-200 flex items-center space-x-3">
                <span className="text-2xl">{DUTCH_LANGUAGE.flag}</span>
                <span className="font-semibold text-slate-700">I speak {DUTCH_LANGUAGE.name}</span>
            </div>
        </div>

        {/* Target Languages Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {TARGET_LANGUAGES.map((lang) => (
            <button
              key={lang.id}
              onClick={() => startSession(lang)}
              className="group relative flex flex-col items-center justify-center p-6 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-400 hover:-translate-y-1 transition-all duration-300"
            >
              <div className="text-5xl mb-4 transform group-hover:scale-110 transition-transform duration-300">
                {lang.flag}
              </div>
              <div className="text-center">
                <h3 className="font-bold text-slate-800">{lang.name}</h3>
                <p className="text-xs text-slate-400 mt-1 group-hover:text-blue-500">Start conversation &rarr;</p>
              </div>
            </button>
          ))}
        </div>

        {/* Footer Info */}
        <div className="mt-16 text-center text-sm text-slate-400">
            <p>Put your device between you and your conversation partner.</p>
            <p className="mt-1">The app detects languages automatically after selection.</p>
        </div>

      </main>
    </div>
  );
};

export default App;