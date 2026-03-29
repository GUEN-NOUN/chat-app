import React, { useState } from 'react';
import { useChat } from '../../context/ChatContext';

export default function AgentSelector() {
  const { agents, activeAgentId, dispatch } = useChat();
  const [open, setOpen] = useState(false);

  function selectAgent(id) {
    dispatch({ type: 'SET_ACTIVE_AGENT', agentId: id === activeAgentId ? null : id });
    setOpen(false);
  }

  const activeAgent = agents.find(a => a.id === activeAgentId);

  return (
    <div className="agent-selector">
      <button
        className={`btn-agent-toggle ${activeAgentId ? 'active' : ''}`}
        onClick={() => setOpen(v => !v)}
        title="اختر مساعد AI"
      >
        {activeAgent ? `${activeAgent.avatar} ${activeAgent.name}` : '🤖 AI'}
      </button>

      {open && (
        <div className="agent-dropdown">
          <div className="agent-dropdown-header">اختر مساعداً</div>

          {/* None / off option */}
          <button
            className={`agent-option ${!activeAgentId ? 'selected' : ''}`}
            onClick={() => selectAgent(null)}
          >
            <span className="agent-opt-icon">💬</span>
            <span className="agent-opt-info">
              <b>دردشة عادية</b>
              <small>بدون مساعد AI</small>
            </span>
          </button>

          {agents.map(agent => (
            <button
              key={agent.id}
              className={`agent-option ${agent.id === activeAgentId ? 'selected' : ''}`}
              onClick={() => selectAgent(agent.id)}
            >
              <span className="agent-opt-icon">{agent.avatar}</span>
              <span className="agent-opt-info">
                <b>{agent.name}</b>
                <small>{agent.description}</small>
              </span>
              <span className="agent-provider">{agent.provider}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
