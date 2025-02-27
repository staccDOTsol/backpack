import type { FromServer, ToServer } from "@coral-xyz/common";
import { CHAT_MESSAGES, REALTIME_API_URL, WS_READY } from "@coral-xyz/common";
import EventEmitter from "eventemitter3";

import { SERVER_URL } from "../config";

export const SIGNALING_CONNECTED = "SIGNALING_CONNECTED";
export const RECONNECTING = "RECONNECTING";

export class Signaling extends EventEmitter {
  ws: WebSocket;
  destroyed = false;
  jwt: string;
  uuid: string;
  private bufferedMessages: ToServer[] = [];
  private state: "connected" | "disconnected" = "disconnected";

  constructor(uuid: string) {
    super();
    this.uuid = uuid;
    this.initWs();
  }

  async initWs() {
    const res = await fetch(`${REALTIME_API_URL}/cookie`);
    this.jwt = (await res.json()).jwt;
    const ws = new WebSocket(`${SERVER_URL}?jwt=${this.jwt}`);
    ws.addEventListener("open", () => {
      this.state = "connected";
      this.bufferedMessages.forEach((x) => this.send(x));
      this.bufferedMessages = [];
    });

    ws.addEventListener("message", (event) => {
      this.handleMessage(event.data);
    });

    ws.addEventListener("close", () => {
      this.state = "disconnected";
      if (!this.destroyed) {
        this.emit(RECONNECTING);
        setTimeout(() => {
          // TODO: exponentially backoff here
          if (!this.destroyed) {
            this.initWs();
          }
        }, 3000);
      }
    });

    this.ws = ws;
  }

  handleMessage(data: string) {
    try {
      const message: FromServer = JSON.parse(data);
      switch (message.type) {
        case CHAT_MESSAGES:
          this.emit(CHAT_MESSAGES, message.payload);
          break;
        case WS_READY:
          this.emit(SIGNALING_CONNECTED);
          break;
        default:
          console.error(`Invalid type of message found ${data}`);
      }
    } catch (e) {
      console.log(`Could not handle data from server ${data}, error: ${e}`);
    }
  }

  destroy() {
    this.destroyed = true;
    this.ws?.close();
  }

  send(message: ToServer) {
    if (this.state === "disconnected") {
      this.bufferedMessages.push(message);
      return;
    }
    this.ws.send(
      JSON.stringify({
        ...message,
      })
    );
  }
}
