import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../../context/ChatContext';

// ── قائمة كل النماذج المتاحة ─────────────────────────────────
const MODEL_GROUPS = [
  {
    label: '🤖 تلقائي',
    models: [
      { id: 'auto', name: 'تلقائي', desc: 'يختار أفضل نموذج تلقائياً', emoji: '🤖', badge: 'smart' },
    ]
  },
  {
    label: '🆓 مجاني 100%',
    models: [
      { id: 'groq-llama',          name: 'Llama 3.3 70B',   desc: 'Groq — سريع جداً، مجاني',        emoji: '⚡', badge: 'free' },
      { id: 'gemini-flash',        name: 'Gemini 2 Flash',  desc: 'Google — سريع ومجاني',            emoji: '✨', badge: 'free' },
      { id: 'openrouter-llama',    name: 'Llama 3.3 Free',  desc: 'OpenRouter — مجاني بالكامل',      emoji: '🦙', badge: 'free' },
      { id: 'openrouter-qwen3',    name: 'Qwen3 235B',      desc: 'OpenRouter — ضخم ومجاني',         emoji: '🌸', badge: 'free' },
      { id: 'openrouter-deepseek', name: 'DeepSeek R1',     desc: 'OpenRouter — تفكير عميق مجاني',   emoji: '🧠', badge: 'free' },
      { id: 'openrouter-gemma',    name: 'Gemma 3 27B',     desc: 'Google/OpenRouter — مجاني',       emoji: '💎', badge: 'free' },
    ]
  },
  {
    label: '🎓 أكاديمي',
    models: [
      { id: 'scholar',     name: 'ScholarGPT',    desc: 'GPT-4o — امتحانات وشرح',         emoji: '🎓', badge: 'pro' },
      { id: 'gemini-pro',  name: 'Gemini Pro',    desc: 'Google — تحليل عميق',              emoji: '🔬', badge: 'pro' },
      { id: 'deepseek',    name: 'DeepSeek R1',   desc: 'رياضيات وتفكير — خطوة بخطوة',    emoji: '🧮', badge: 'smart' },
      { id: 'qwen',        name: 'Qwen 32B',      desc: 'Groq — عربي ممتاز',               emoji: '🌸', badge: 'smart' },
    ]
  },
  {
    label: '💻 برمجة',
    models: [
      { id: 'claude',       name: 'Claude Haiku',  desc: 'Anthropic — كود نظيف',           emoji: '💻', badge: 'pro' },
      { id: 'groq-llama',   name: 'Llama (سريع)',  desc: 'Groq — كود سريع',                emoji: '⚡', badge: 'free' },
      { id: 'deepseek-chat',name: 'DeepSeek Chat', desc: 'منطق وكود',                       emoji: '🔍', badge: 'smart' },
    ]
  },
  {
    label: '🖼️ تحليل صور',
    models: [
      { id: 'gemini-vision', name: 'Gemini Vision',  desc: 'Google — تحليل صور احترافي',   emoji: '🔭', badge: 'smart' },
      { id: 'groq-vision',   name: 'Llama Vision',   desc: 'Groq — سريع ومجاني',           emoji: '👁️', badge: 'free' },
    ]
  },
  {
    label: '📚 تلخيص وترجمة',
    models: [
      { id: 'cohere',   name: 'Cohere Command R+', desc: 'تلخيص احترافي مجاني', emoji: '📚', badge: 'free' },
      { id: 'mistral',  name: 'Mistral Small',     desc: 'سريع ومتوازن',        emoji: '🔬', badge: 'smart' },
    ]
  },
];

const BADGE_COLORS = {
  free:  { bg: '#dcfce7', color: '#15803d', label: 'مجاني' },
  smart: { bg: '#dbeafe', color: '#1d4ed8', label: 'ذكي'  },
  pro:   { bg: '#fef3c7', color: '#b45309', label: 'متقدم' },
};

export default function AgentSelector() {
  const { activeModelId, setActiveModel } = useChat();
  const [open, setOpen]   = useState(false);
  const ref               = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Find current model info
  const currentModel = MODEL_GROUPS
    .flatMap(g => g.models)
    .find(m => m.id === (activeModelId || 'auto'))
    || MODEL_GROUPS[0].models[0];

  const handleSelect = (id) => {
    setActiveModel(id === 'auto' ? null : id);
    setOpen(false);
  };

  return (
    <div className="agent-selector" ref={ref}>
      <button
        className={`agent-selector-btn${open ? ' open' : ''}`}
        onClick={() => setOpen(v => !v)}
        title="اختر نموذج الذكاء الاصطناعي"
        type="button"
      >
        <span className="agent-selector-emoji">{currentModel.emoji}</span>
        <span className="agent-selector-name">{currentModel.name}</span>
        <span className="agent-selector-caret">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="agent-dropdown" role="listbox">
          <div className="agent-dropdown-header">اختر نموذج الذكاء الاصطناعي</div>
          {MODEL_GROUPS.map(group => (
            <div key={group.label} className="agent-group">
              <div className="agent-group-label">{group.label}</div>
              {group.models.map(m => {
                const badge = BADGE_COLORS[m.badge];
                const isActive = (activeModelId || 'auto') === m.id;
                return (
                  <button
                    key={m.id}
                    className={`agent-option${isActive ? ' active' : ''}`}
                    onClick={() => handleSelect(m.id)}
                    role="option"
                    aria-selected={isActive}
                    type="button"
                  >
                    <span className="ao-emoji">{m.emoji}</span>
                    <span className="ao-info">
                      <span className="ao-name">{m.name}</span>
                      <span className="ao-desc">{m.desc}</span>
                    </span>
                    <span className="ao-badge" style={{ background: badge.bg, color: badge.color }}>
                      {badge.label}
                    </span>
                    {isActive && <span className="ao-check">✓</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
