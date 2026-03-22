import { useState } from "react";

export default function Lobby({ onJoin, error }) {
  const [input, setInput] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    onJoin(input);
  };

  const randomRoom = () => {
    setInput(Math.random().toString(36).slice(2, 8).toUpperCase());
  };

  return (
    <div className="lobby">
      <div className="lobby-card">
        <div className="lobby-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="23" stroke="currentColor" strokeWidth="2" />
            <path d="M14 20C14 18.343 15.343 17 17 17H25C26.657 17 28 18.343 28 20V28C28 29.657 26.657 31 25 31H17C15.343 31 14 29.657 14 28V20Z" stroke="currentColor" strokeWidth="2" />
            <path d="M28 22L34 19V29L28 26V22Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="lobby-title">NexMeet</h1>
        <p className="lobby-sub">Create or join a room to start your call</p>

        <form onSubmit={handleSubmit} className="lobby-form">
          <div className="input-row">
            <input
              type="text"
              placeholder="Enter room ID…"
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              className="room-input"
              maxLength={20}
              autoFocus
            />
            <button type="button" className="btn-ghost" onClick={randomRoom} title="Generate random room ID">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 3 21 3 21 8" />
                <line x1="4" y1="20" x2="21" y2="3" />
                <polyline points="21 16 21 21 16 21" />
                <line x1="15" y1="15" x2="21" y2="21" />
              </svg>
            </button>
          </div>

          {error && <p className="error-msg">{error}</p>}

          <button type="submit" className="btn-primary" disabled={!input.trim()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
            Start Call
          </button>
        </form>

        <p className="lobby-hint">
          Share the room ID with others so they can join.
        </p>
      </div>
    </div>
  );
}
