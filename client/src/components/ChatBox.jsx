import { useEffect, useState } from "react";

export default function ChatBox({
  isOpen,
  messages,
  selfId,
  onSend,
}) {
  const [messageList, setMessageList] = useState(messages || []);
  const [input, setInput] = useState("");

  useEffect(() => {
    if (Array.isArray(messages)) {
      setMessageList(messages);
    }
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    if (onSend) {
      onSend(text);
    } else {
      setMessageList((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          text,
          senderId: selfId || "local-user",
          senderName: "You",
          createdAt: Date.now(),
        },
      ]);
    }

    setInput("");
  };

  return (
    <aside className={`chat-panel ${isOpen ? "open" : ""}`}>
      <div className="chat-header">Room Chat</div>

      <div className="chat-messages">
        {messageList.length === 0 && (
          <p className="chat-empty">No messages yet. Say hello.</p>
        )}

        {messageList.map((message, index) => {
          const isMine = message.senderId === selfId;
          const sender = isMine ? "You" : message.senderName || "Guest";

          return (
            <div
              key={message.id || `${message.createdAt || "msg"}-${index}`}
              className={`chat-message ${isMine ? "mine" : ""}`}
            >
              <p className="chat-sender">{sender}</p>
              <p className="chat-text">{message.text}</p>
            </div>
          );
        })}
      </div>

      <form className="chat-input-row" onSubmit={handleSend}>
        <input
          className="chat-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message"
          maxLength={500}
        />
        <button className="chat-send" type="submit" disabled={!input.trim()}>
          Send
        </button>
      </form>
    </aside>
  );
}
