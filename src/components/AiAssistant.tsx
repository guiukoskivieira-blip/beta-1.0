import React, { useState } from 'react';
import { Sparkles, Send, Bot, User, Loader2 } from 'lucide-react';
import { PreflightAnalysis } from '../types';
import { buildGroundedContext } from '../services/aiGrounding';
import { askPreflightAssistant } from '../services/api';

interface AiAssistantProps {
  analysis: PreflightAnalysis;
}

interface Message {
  role: 'assistant' | 'user';
  text: string;
}

export const AiAssistant: React.FC<AiAssistantProps> = ({ analysis }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: `Olá! Analisei o arquivo "${analysis.fileName}". A pontuação de conformidade foi de ${analysis.ruleResults.scoreSummary.score}/100 com status "${analysis.ruleResults.scoreSummary.label}". Como posso ajudar com os ajustes gráficos das regras apontadas no relatório?`,
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: userText }]);
    setIsLoading(true);

    try {
      const groundedContext = buildGroundedContext(analysis);
      const data = await askPreflightAssistant(userText, groundedContext);

      if (data && (data.reply || data.answer)) {
        setMessages((prev) => [...prev, { role: 'assistant', text: data.reply || data.answer || '' }]);
      } else {
        const errorMsg = data?.error || 'Assistente indisponível no momento.';
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: `Não foi possível obter resposta do assistente de IA (${errorMsg}). O relatório determinístico permanece 100% válido.`,
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: 'Não foi possível conectar ao assistente no momento. As medições técnicas do painel são a fonte de verdade.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-[#101722] border border-[#243244] rounded-2xl p-6 shadow-xl mb-8">
      <div className="flex items-center space-x-2 pb-4 border-b border-[#243244]">
        <div className="w-8 h-8 rounded-lg bg-[#FFB800]/10 border border-[#FFB800]/30 flex items-center justify-center text-[#FFB800]">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white">
            Assistente Técnico de Pré-impressão (Gemini)
          </h3>
          <p className="text-xs text-[#8E98A7]">
            Tire dúvidas sobre fechamento de arquivos e correções operacionais
          </p>
        </div>
      </div>

      <div className="my-4 space-y-3 max-h-72 overflow-y-auto pr-1">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex items-start space-x-2.5 ${
              m.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {m.role === 'assistant' && (
              <div className="w-7 h-7 rounded-lg bg-[#007BFF]/20 flex items-center justify-center text-[#007BFF] shrink-0 mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
            )}
            <div
              className={`p-3 rounded-2xl text-xs max-w-lg ${
                m.role === 'user'
                  ? 'bg-[#007BFF] text-white rounded-tr-xs'
                  : 'bg-[#16202E] text-[#C3CBD6] border border-[#243244] rounded-tl-xs'
              }`}
            >
              {m.text}
            </div>
            {m.role === 'user' && (
              <div className="w-7 h-7 rounded-lg bg-[#243244] flex items-center justify-center text-[#8E98A7] shrink-0 mt-0.5">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex items-center space-x-2 text-xs text-[#8E98A7]">
            <Loader2 className="w-4 h-4 animate-spin text-[#007BFF]" />
            <span>Consultando modelo de IA...</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="flex items-center gap-2 pt-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ex: Como posso resolver o erro de TrimBox e sangria no Illustrator?"
          className="flex-1 bg-[#0B1018] border border-[#243244] rounded-xl px-4 py-2.5 text-xs text-white placeholder-[#556375] focus:outline-hidden focus:border-[#007BFF]"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-4 py-2.5 bg-[#007BFF] hover:bg-[#0066D6] disabled:opacity-50 text-white text-xs font-medium rounded-xl transition-all flex items-center justify-center cursor-pointer shadow-md"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
