"use client";

import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { WS_URL } from "@/lib/constants";
import { useMetricsStore } from "@/store/metricsStore";
import { useBotStore } from "@/store/botStore";
import type { BotState } from "@/lib/types";

export function useWebSocket(botId?: number) {
  const socketRef = useRef<Socket | null>(null);
  const setConnectionStatus = useMetricsStore((s) => s.setConnectionStatus);
  const incrementReconnect = useMetricsStore((s) => s.incrementReconnect);
  const updateSpread = useMetricsStore((s) => s.updateSpread);
  const updateBotState = useBotStore((s) => s.updateBotState);

  useEffect(() => {
    const socket = io(WS_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
      timeout: 10000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnectionStatus("connected");
      if (botId) {
        socket.emit("join_bot", { bot_id: botId });
      }
      socket.emit("join_admin", {});
    });

    socket.on("disconnect", () => {
      setConnectionStatus("disconnected");
    });

    socket.on("reconnect_attempt", () => {
      setConnectionStatus("reconnecting");
      incrementReconnect();
    });

    socket.on("spread_update", (payload: { bot_id: number; data: any }) => {
      updateSpread(payload.bot_id, payload.data);
    });

    socket.on("bot_state_change", (payload: { bot_id: number; data: { new_state: BotState } }) => {
      updateBotState(payload.bot_id, payload.data.new_state);
    });

    return () => {
      socket.off();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [botId, setConnectionStatus, incrementReconnect, updateSpread, updateBotState]);

  return socketRef;
}
