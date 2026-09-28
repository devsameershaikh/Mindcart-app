// socket.js — real-time layer. Connects once after sign-in and stays open;
// App.js subscribes to events to keep shared lists live across devices/people.
import { io } from "socket.io-client";
import { API_BASE_URL, getToken } from "./api";

let socket = null;

export async function connectSocket() {
  if (socket) return socket;
  const token = await getToken();
  if (!token) return null;
  socket = io(API_BASE_URL, {
    auth: { token },
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000, // backoff instead of hammering the server
  });

  socket.on("connect", () => console.log("[socket] connected", socket.id));
  socket.on("connect_error", (err) => console.log("[socket] connect_error:", err.message));
  socket.on("disconnect", (reason) => {
    console.log("[socket] disconnected:", reason);
    // "io server disconnect" means the SERVER closed this connection --
    // socket.io-client deliberately does NOT auto-reconnect for this
    // reason (it assumes the server meant to kick the client, e.g. a
    // ban). This backend has no such feature; the only place it calls
    // client.disconnect() is a userId-not-yet-set race in onConnect
    // (see SocketIOEventHandler.java), which is a bug, not an intentional
    // kick -- so reconnect ourselves rather than sitting dead until the
    // app is restarted.
    if (reason === "io server disconnect") {
      setTimeout(() => socket && !socket.connected && socket.connect(), 2000);
    }
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// Call after accepting an invite so this device starts getting live
// updates for the newly-shared list immediately, without reconnecting.
export function joinListRoom(listId) {
  socket?.emit("list:join", listId);
}
export function leaveListRoom(listId) {
  socket?.emit("list:leave", listId);
}