import React from 'react';

/** Normalize common LLM markdown glitches (e.g. "* * **"). */
function cleanAssistantText(text) {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\s*\*\s+\*\s+\*\*/g, ' **')
    .replace(/\*\*\*\s+\*\*/g, '**')
    .replace(/\s+\*\s+\*\s+(?=\*\*)/g, '\n')
    .replace(/:\s*\*\s+\*\s+/g, ':\n• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseInline(text, keyPrefix = '') {
  const parts = [];
  const regex = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let lastIndex = 0;
  let match;
  let i = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1] != null) {
      parts.push(<strong key={`${keyPrefix}-b${i}`}>{match[1]}</strong>);
    } else if (match[2] != null) {
      parts.push(<em key={`${keyPrefix}-i${i}`}>{match[2]}</em>);
    }
    lastIndex = regex.lastIndex;
    i += 1;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length ? parts : [text];
}

function groupBlocks(text) {
  const lines = text.split('\n');
  const groups = [];
  let listGroup = null;

  const flushList = () => {
    if (listGroup) {
      groups.push(listGroup);
      listGroup = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }

    const numbered = line.match(/^(\d+)\.\s+(.+)/);
    const bullet = line.match(/^[-*•]\s+(.+)/);

    if (numbered) {
      flushList();
      groups.push({ type: 'ol-item', number: numbered[1], text: numbered[2] });
    } else if (bullet) {
      if (!listGroup || listGroup.type !== 'ul') {
        flushList();
        listGroup = { type: 'ul', items: [] };
      }
      listGroup.items.push(bullet[1]);
    } else {
      flushList();
      groups.push({ type: 'p', text: line });
    }
  }

  flushList();
  return groups;
}

export default function AssistantMessageContent({ content }) {
  const cleaned = cleanAssistantText(content);
  const groups = groupBlocks(cleaned);

  if (!groups.length) {
    return <p className="assistant-message-text">{content}</p>;
  }

  return (
    <div className="assistant-message-body">
      {groups.map((group, index) => {
        if (group.type === 'p') {
          return (
            <p key={`p-${index}`} className="assistant-message-text">
              {parseInline(group.text, `p-${index}`)}
            </p>
          );
        }
        if (group.type === 'ol-item') {
          return (
            <div key={`ol-${index}`} className="assistant-message-ol-item">
              <span className="assistant-message-ol-num">{group.number}.</span>
              <span className="assistant-message-ol-text">
                {parseInline(group.text, `ol-${index}`)}
              </span>
            </div>
          );
        }
        if (group.type === 'ul') {
          return (
            <ul key={`ul-${index}`} className="assistant-message-list-md">
              {group.items.map((item, itemIndex) => (
                <li key={`ul-${index}-${itemIndex}`}>
                  {parseInline(item, `ul-${index}-${itemIndex}`)}
                </li>
              ))}
            </ul>
          );
        }
        return null;
      })}
    </div>
  );
}
