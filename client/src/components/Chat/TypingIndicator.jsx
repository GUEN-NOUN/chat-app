import React from 'react';

export default function TypingIndicator({ names }) {
  if (!names?.length) return null;
  const label = names.length === 1
    ? `${names[0]} يكتب...`
    : `${names.slice(0, -1).join('، ')} و${names.at(-1)} يكتبون...`;

  return (
    <div className="typing-indicator" aria-live="polite">
      <span className="typing-dots">
        <span /><span /><span />
      </span>
      <span className="typing-label">{label}</span>
    </div>
  );
}
