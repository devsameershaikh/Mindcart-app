// socket.js — real-time layer. Connects once after sign-in and stays open;
// App.js subscribes to events to keep shared lists live across devices/people.
import { io } from "socket.io-client";
import { API_BASE_URL, getToken } from "./api";

let socket = null;

export async function connectSocket() {
  if (socket) return socket;
  const token = await getToken();
  if (!token) return null;
  socket = io(API_BASE_URL, { auth: { token }, transports: ["websocket"] });
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
