import { useEffect, useRef } from "react";
import { useWebRTC } from "./hooks/useWebRTC";
import Lobby from "./components/Lobby";
import Room from "./components/Room";
import "./App.css";

const ROOM_ID_KEY = "nexmeet:lastRoomId";
const USER_NAME_KEY = "nexmeet:lastUserName";

export default function App() {
  const triedAutoJoinRef = useRef(false);

  const {
    selfId,
    selfName,
    localStream,
    remoteStreams,
    peerNames,
    chatMessages,
    mediaStateByPeer,
    isInCall,
    roomId,
    error,
    isVideoEnabled,
    isVideoSharingEnabled,
    isAudioEnabled,
    isScreenSharing,
    startCall,
    sendChatMessage,
    toggleVideo,
    toggleVideoSharing,
    toggleAudio,
    toggleScreenShare,
    leaveCall,
  } = useWebRTC();

  useEffect(() => {
    if (triedAutoJoinRef.current) return;
    triedAutoJoinRef.current = true;

    const savedRoomId = localStorage.getItem(ROOM_ID_KEY);
    const savedUserName = localStorage.getItem(USER_NAME_KEY);

    if (!savedRoomId || !savedUserName) return;
    startCall(savedRoomId, savedUserName);
  }, [startCall]);

  return (
    <div className="app">
      {!isInCall && (
        <Lobby
          onJoin={({ roomId: room, userName }) => {
            if (!room || !room.trim() || !userName || !userName.trim()) return;
            const nextRoomId = room.trim();
            const nextUserName = userName.trim();
            localStorage.setItem(ROOM_ID_KEY, nextRoomId);
            localStorage.setItem(USER_NAME_KEY, nextUserName);
            startCall(nextRoomId, nextUserName);
          }}
          error={error}
        />
      )}

      {isInCall && (
        <Room
          localStream={localStream}
          remoteStreams={remoteStreams}
          roomId={roomId}
          peerNames={peerNames}
          chatMessages={chatMessages}
          onSendChatMessage={sendChatMessage}
          selfId={selfId}
          selfName={selfName}
          mediaStateByPeer={mediaStateByPeer}
          isVideoEnabled={isVideoEnabled}
          isVideoSharingEnabled={isVideoSharingEnabled}
          isAudioEnabled={isAudioEnabled}
          isScreenSharing={isScreenSharing}
          onToggleVideo={toggleVideo}
          onToggleVideoSharing={toggleVideoSharing}
          onToggleAudio={toggleAudio}
          onToggleScreenShare={toggleScreenShare}
          onLeave={() => {
            localStorage.removeItem(ROOM_ID_KEY);
            localStorage.removeItem(USER_NAME_KEY);
            leaveCall();
          }}
        />
      )}

    </div>


  );
}