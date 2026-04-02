import { useEffect, useRef, useState } from "react";
import VideoTile from "./VideoTile";
import ChatBox from "./ChatBox";
import Controls from "./Controls";
import "../index.css";

export default function Room({
  localStream,
  remoteStreams,
  roomId,
  peerNames,
  onLeave,
  chatMessages,
  onSendChatMessage,
  selfId,
  mediaStateByPeer,
  isVideoEnabled,
  isAudioEnabled,
  isScreenSharing,
  onToggleVideo,
  onToggleAudio,
  onToggleScreenShare,
}) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [videosPerPage, setVideosPerPage] = useState(9);
  const processedMessageCountRef = useRef(0);
  const peerCount = remoteStreams.length;

  useEffect(() => {
    const updateVideosPerPage = () => {
      const width = window.innerWidth;

      if (width < 640) {
        setVideosPerPage(4);
        return;
      }

      if (width < 1024) {
        setVideosPerPage(6);
        return;
      }

      setVideosPerPage(9);
    };

    updateVideosPerPage();
    window.addEventListener("resize", updateVideosPerPage);

    return () => {
      window.removeEventListener("resize", updateVideosPerPage);
    };
  }, []);

  const totalPages = Math.max(1, Math.ceil(peerCount / videosPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * videosPerPage;
  const pageEndIndex = pageStartIndex + videosPerPage;
  const paginatedRemoteStreams = remoteStreams.slice(pageStartIndex, pageEndIndex);
  const visiblePeerCount = paginatedRemoteStreams.length;

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!Array.isArray(chatMessages)) return;

    const processedCount = processedMessageCountRef.current;
    const nextMessages = chatMessages.slice(processedCount);

    if (!isChatOpen && nextMessages.length > 0) {
      const incomingCount = nextMessages.filter(
        (message) => message?.senderId && message.senderId !== selfId
      ).length;

      if (incomingCount > 0) {
        setUnreadChatCount((prev) => prev + incomingCount);
      }
    }

    processedMessageCountRef.current = chatMessages.length;
  }, [chatMessages, isChatOpen, selfId]);

  const handleToggleChat = () => {
    setIsChatOpen((prev) => {
      const next = !prev;
      if (next) {
        setUnreadChatCount(0);
      }
      return next;
    });
  };

  const gridClass =
    visiblePeerCount <= 1
      ? "grid-cols-1"
      : visiblePeerCount <= 4
      ? "grid-cols-2"
      : visiblePeerCount <= 9
      ? "grid-cols-3"
      : "grid-cols-3";

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-950 text-white">

      {/* HEADER */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800/90 bg-gray-900/95 backdrop-blur">

        {/* BRAND */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-300/30 bg-emerald-400/10 text-emerald-300 shadow-[0_0_22px_rgba(16,185,129,0.2)]">
            <svg width="22" height="22" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="23" stroke="currentColor" strokeWidth="2.5" />
              <path d="M14 20C14 18.343 15.343 17 17 17H25C26.657 17 28 18.343 28 20V28C28 29.657 26.657 31 25 31H17C15.343 31 14 29.657 14 28V20Z" stroke="currentColor" strokeWidth="2.5" />
              <path d="M28 22L34 19V29L28 26V22Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
            </svg>
          </div>

          <div className="flex flex-col leading-tight">
            <span className="text-lg font-semibold tracking-tight text-white">NexMeet</span>
            <span className="text-[11px] uppercase tracking-[0.18em] text-emerald-300/80">Live Session</span>
          </div>
        </div>

        {/* ROOM INFO */}
        <div className="flex items-center gap-3 text-sm">

          <span className="flex items-center gap-2 rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-red-300 shadow-[0_0_18px_rgba(239,68,68,0.15)]">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            LIVE
          </span>

          <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 font-medium text-emerald-200">
            Room: {roomId}
          </span>

          <span className="rounded-full border border-gray-700 bg-gray-800/80 px-3 py-1 text-gray-300">
            {peerCount + 1} participant{peerCount !== 0 ? "s" : ""}
          </span>

        </div>
      </header>

      {/* MAIN AREA */}
      <main className="relative flex flex-1 min-h-0 overflow-hidden">

        {/* VIDEO AREA */}
        <section className="flex-1 min-w-0 min-h-0 p-6 overflow-hidden">

          {peerCount === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">

              <div className="w-14 h-14 rounded-full border-4 border-gray-700 border-t-indigo-500 animate-spin mb-6"></div>

              <p className="text-lg font-medium">
                Waiting for others to join...
              </p>

              <p className="text-sm mt-2">
                Share Room ID <span className="text-white font-semibold">{roomId}</span>
              </p>

            </div>
          ) : (
            <div className="flex h-full flex-col gap-3">
              <div className={`grid min-h-0 flex-1 w-full auto-rows-fr ${gridClass} gap-4`}>
                {paginatedRemoteStreams.map(({ peerId, stream }) => (
                  <VideoTile
                    key={peerId}
                    stream={stream}
                    label={peerNames?.[peerId] || "Guest"}
                    peerId={peerId}
                    isVideoEnabled={mediaStateByPeer[peerId]?.videoEnabled ?? true}
                    isAudioEnabled={mediaStateByPeer[peerId]?.audioEnabled ?? true}
                    isScreenSharing={mediaStateByPeer[peerId]?.isScreenSharing ?? false}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/70 px-3 py-2 text-xs text-gray-300 sm:text-sm">
                  <button
                    type="button"
                    className="rounded-md border border-gray-700 px-3 py-1 disabled:opacity-40"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={safeCurrentPage === 1}
                  >
                    Prev
                  </button>

                  <span>
                    Page {safeCurrentPage} of {totalPages}
                  </span>

                  <button
                    type="button"
                    className="rounded-md border border-gray-700 px-3 py-1 disabled:opacity-40"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={safeCurrentPage === totalPages}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}

        </section>

        {/* CHAT */}
        {isChatOpen && (
          <div className="fixed inset-x-0 top-20 bottom-24 z-40 border-y border-gray-800 bg-gray-900 md:static md:inset-auto md:top-auto md:bottom-auto md:z-30 md:w-80 md:shrink-0 md:border-y-0 md:border-l">
            <ChatBox
              isOpen={isChatOpen}
              messages={chatMessages}
              selfId={selfId}
              onSend={onSendChatMessage}
            />
          </div>
        )}
      </main>

      {/* LOCAL VIDEO */}
      <div
        className={`fixed bottom-24 right-3 z-20 w-28 rounded-xl overflow-hidden border border-gray-700 shadow-xl transition-all duration-200 sm:w-60 ${
          isChatOpen ? "md:right-[21.5rem]" : "md:right-6"
        }`}
      >
        <VideoTile
          stream={localStream}
          label="You"
          isLocal
          isVideoEnabled={isVideoEnabled}
          isAudioEnabled={isAudioEnabled}
          isScreenSharing={isScreenSharing}
        />
      </div>

      {/* CONTROLS */}
      <Controls
        isVideoEnabled={isVideoEnabled}
        isAudioEnabled={isAudioEnabled}
        isScreenSharing={isScreenSharing}
        isChatOpen={isChatOpen}
        unreadCount={unreadChatCount}
        onToggleVideo={onToggleVideo}
        onToggleAudio={onToggleAudio}
        onToggleScreenShare={onToggleScreenShare}
        onToggleChat={handleToggleChat}
        onLeave={onLeave}
      />

    </div>
  );
}