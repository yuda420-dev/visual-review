"use client";

import type { ChatMessage } from "@/lib/types";
import Image from "next/image";

interface MessageBubbleProps {
  message: ChatMessage;
  onPinRef?: (pinId: number) => void;
}

export function MessageBubble({ message, onPinRef }: MessageBubbleProps) {
  const isPin = message.type === "pin";

  if (isPin) {
    return (
      <div className="flex flex-col gap-1.5 py-2">
        <button
          className="flex items-start gap-2 text-left group"
          onClick={() => message.pinId != null && onPinRef?.(message.pinId)}
        >
          <span className="flex-none mt-0.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {message.pinId}
          </span>
          <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
            {message.content}
          </span>
        </button>
        {message.screenshot && (
          <div className="ml-7 rounded overflow-hidden border border-border w-48 h-28 relative flex-none">
            <Image
              src={message.screenshot}
              alt={`Pin ${message.pinId} screenshot`}
              fill
              className="object-cover object-top"
              unoptimized
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex justify-end py-1">
      <div className="max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-3 py-2 text-sm leading-relaxed">
        {message.content}
      </div>
    </div>
  );
}
