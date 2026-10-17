import React, { useState, useEffect } from 'react';
import { Mic, MicOff } from 'lucide-react';

export const VoiceInput = ({ value, onChange, onEnter, placeholder, className, disabled }: { value: string, onChange: (val: string) => void, onEnter?: () => void, placeholder?: string, className?: string, disabled?: boolean }) => {
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);

  useEffect(() => {
    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = 'zh-CN';

      rec.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          onChange(value + (value ? ' ' : '') + finalTranscript);
        }
      };

      rec.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      setRecognition(rec);
    }
  }, [value, onChange]);

  const toggleListen = () => {
    if (disabled) return;
    if (isListening) {
      recognition?.stop();
      setIsListening(false);
    } else {
      recognition?.start();
      setIsListening(true);
    }
  };

  return (
    <div className={`relative flex items-center ${className}`}>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onEnter && onEnter()}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 px-4 py-2 pr-12 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-400 disabled:bg-slate-50 disabled:text-slate-500"
      />
      {recognition && !disabled && (
        <button
          onClick={toggleListen}
          className={`absolute right-2 p-1.5 rounded-lg transition-colors ${isListening ? 'bg-red-100 text-red-500 animate-pulse' : 'text-slate-400 hover:bg-slate-100'}`}
          title={isListening ? "停止录音" : "语音输入"}
        >
          {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>
      )}
    </div>
  );
};
