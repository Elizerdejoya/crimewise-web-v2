import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Bot } from "lucide-react";
import Chatbot from "./Chatbot";

const ChatbotButton: React.FC = () => {
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setIsChatbotOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg bg-blue-600 hover:bg-blue-700 z-40"
        title="AI Assistant"
      >
        <Bot className="h-6 w-6" />
      </Button>

      <Chatbot isOpen={isChatbotOpen} onClose={() => setIsChatbotOpen(false)} />
    </>
  );
};

export default ChatbotButton;
