import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveSession } from '../services/sessionService';

const AIAssistantPanel = ({ currentSessionId }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImages, setSelectedImages] = useState([]);
  const navigate = useNavigate();

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    try {
      const result = await window.electron.invoke('ai-chat', {
        sessionId: currentSessionId,
        messages: updatedMessages,
        images: selectedImages, // if you have image support
      });

      if (result.success) {
        const assistantMessage = { 
          role: 'assistant', 
          content: result.response,
          intent: result.intent,
          context: result.context,
        };
        const finalMessages = [...updatedMessages, assistantMessage];
        setMessages(finalMessages);
        
        await saveSession(finalMessages);
      } else {
        // ...existing error handling...
      }
    } catch (error) {
      // ...existing error handling...
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageSelect = (image) => {
    setSelectedImages(prev => [...prev, image]);
  };

  const handleImageRemove = (image) => {
    setSelectedImages(prev => prev.filter(img => img !== image));
  };

  return (
    <div>
      <h2>AI Assistant</h2>
      <div>
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} />
        <button onClick={handleSendMessage}>Send</button>
      </div>
      <div>
        <input type="file" multiple onChange={(e) => setSelectedImages(Array.from(e.target.files))} />
        <button onClick={handleImageRemove}>Remove</button>
      </div>
      <div>
        {messages.map((msg, index) => (
          <div key={index}>
            {msg.role === 'user' ? (
              <div>user: {msg.content}</div>
            ) : (
              <div>assistant: {msg.content}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AIAssistantPanel;