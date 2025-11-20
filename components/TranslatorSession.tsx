import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage } from '@google/genai';
import { Language, Message, ConnectionStatus } from '../types';
import { SYSTEM_INSTRUCTION_TEMPLATE } from '../constants';
import { 
  createPcmBlob, 
  base64ToBytes, 
  decodeAudioData, 
  PCM_SAMPLE_RATE,
  downsampleBuffer 
} from '../utils/audioUtils';
import Visualizer from './Visualizer';

interface TranslatorSessionProps {
  targetLanguage: Language;
  onExit: () => void;
}

const TranslatorSession: React.FC<TranslatorSessionProps> = ({ targetLanguage, onExit }) => {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("Requesting microphone access...");

  // Audio Contexts and Nodes
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  
  // Session Refs
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const volumeRef = useRef<number>(0);
  
  // Accumulate transcription text before it's final
  const currentInputTransRef = useRef<string>('');
  const currentOutputTransRef = useRef<string>('');
  
  // Timeout ref
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isCleanup = false;

    const cleanup = () => {
      isCleanup = true;
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // Stop all audio sources
      sourcesRef.current.forEach(s => {
          try { s.stop(); } catch(e) {}
      });
      sourcesRef.current.clear();
      
      // Close input processing
      if (processorRef.current && inputSourceRef.current) {
          try {
            inputSourceRef.current.disconnect();
            processorRef.current.disconnect();
          } catch(e) {}
      }
      
      // Close stream
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
      }

      // Close AudioContexts
      inputContextRef.current?.close().catch(() => {});
      outputContextRef.current?.close().catch(() => {});
    };

    const startSession = async () => {
      try {
        if (!process.env.API_KEY) {
          throw new Error("API Key not found in environment.");
        }

        // 1. Get Microphone Stream FIRST
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        if (isCleanup) {
            stream.getTracks().forEach(t => t.stop());
            return;
        }
        streamRef.current = stream;

        // Update status and start connection timer (Increased to 20s)
        setStatusMessage("Initializing Audio...");
        
        timeoutRef.current = setTimeout(() => {
           if (!isCleanup && status === 'connecting') {
              setStatus('error');
              setErrorMsg("Connection timed out. Please check your network.");
              cleanup();
           }
        }, 20000); 

        // 2. Initialize Audio Contexts
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        
        // Input Context (Mic)
        const inputCtx = new AudioContextClass(); 
        inputContextRef.current = inputCtx;

        // Output Context (Speaker)
        const outputCtx = new AudioContextClass();
        outputContextRef.current = outputCtx;

        // 3. Resume Contexts (Required by browsers)
        // We race this against a small timeout to ensure we don't hang here indefinitely
        const resumePromise = Promise.all([
            inputCtx.state === 'suspended' ? inputCtx.resume() : Promise.resolve(),
            outputCtx.state === 'suspended' ? outputCtx.resume() : Promise.resolve()
        ]);
        
        // Wait for resume, but don't block connection logic forever
        await Promise.race([
            resumePromise,
            new Promise(resolve => setTimeout(resolve, 2000)) 
        ]);
        
        if (isCleanup) return;

        // 4. Setup output node
        const outNode = outputCtx.createGain();
        outNode.connect(outputCtx.destination);
        outputNodeRef.current = outNode;

        setStatusMessage("Connecting to Server...");

        // 5. Connect to Gemini Live
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        sessionPromiseRef.current = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          callbacks: {
            onopen: () => {
              if (isCleanup) return;
              if (timeoutRef.current) {
                  clearTimeout(timeoutRef.current);
                  timeoutRef.current = null;
              }
              
              console.log("Gemini Live Connected");
              setStatus('connected');
              
              // Setup Audio Input Pipeline
              const source = inputCtx.createMediaStreamSource(stream);
              inputSourceRef.current = source;
              
              const processor = inputCtx.createScriptProcessor(4096, 1, 1);
              processorRef.current = processor;
              
              processor.onaudioprocess = (e) => {
                 if (isCleanup) return;
                 const inputData = e.inputBuffer.getChannelData(0);
                 
                 // Calculate Volume (RMS) for Visualizer
                 let sum = 0;
                 for (let i = 0; i < inputData.length; i++) {
                   sum += inputData[i] * inputData[i];
                 }
                 const rms = Math.sqrt(sum / inputData.length);
                 volumeRef.current = rms;

                 if (isPaused) return;

                 // Downsample if necessary
                 const currentRate = inputCtx.sampleRate;
                 let pcmData = inputData;
                 if (currentRate !== PCM_SAMPLE_RATE) {
                     pcmData = downsampleBuffer(inputData, currentRate, PCM_SAMPLE_RATE);
                 }

                 const pcmBlob = createPcmBlob(pcmData);
                 
                 sessionPromiseRef.current?.then(session => {
                     if (isCleanup) return;
                     session.sendRealtimeInput({ media: pcmBlob });
                 }).catch(err => console.error("Send Input Error", err));
              };

              source.connect(processor);
              processor.connect(inputCtx.destination);
            },
            onmessage: async (message: LiveServerMessage) => {
              if (isCleanup) return;

              // 1. Handle Text Transcription
              const outTrans = message.serverContent?.outputTranscription;
              const inTrans = message.serverContent?.inputTranscription;
              const turnComplete = message.serverContent?.turnComplete;

              if (outTrans?.text) {
                currentOutputTransRef.current += outTrans.text;
                updateMessage('model', currentOutputTransRef.current, false);
              }
              
              if (inTrans?.text) {
                currentInputTransRef.current += inTrans.text;
                updateMessage('user', currentInputTransRef.current, false);
              }

              if (turnComplete) {
                  if (currentOutputTransRef.current) {
                      updateMessage('model', currentOutputTransRef.current, true);
                      currentOutputTransRef.current = '';
                  }
                  if (currentInputTransRef.current) {
                      updateMessage('user', currentInputTransRef.current, true);
                      currentInputTransRef.current = '';
                  }
              }

              // 2. Handle Audio Output
              const audioStr = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
              if (audioStr && outputContextRef.current && outputNodeRef.current) {
                const ctx = outputContextRef.current;
                
                // Sync timing
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                
                const audioBuffer = await decodeAudioData(
                    base64ToBytes(audioStr),
                    ctx,
                    24000
                );

                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputNodeRef.current);
                
                source.addEventListener('ended', () => {
                    sourcesRef.current.delete(source);
                });

                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                sourcesRef.current.add(source);
              }
              
              // 3. Handle Interruption
              if (message.serverContent?.interrupted) {
                  console.log("Model interrupted");
                  sourcesRef.current.forEach(s => s.stop());
                  sourcesRef.current.clear();
                  nextStartTimeRef.current = 0;
                  currentOutputTransRef.current = ''; // Clear pending text
              }
            },
            onclose: () => {
              if (!isCleanup) setStatus('disconnected');
            },
            onerror: (err) => {
              console.error("Gemini Error", err);
              if (!isCleanup) {
                  setStatus('error');
                  setErrorMsg("Connection error. Please try again.");
              }
            }
          },
          config: {
            responseModalities: ['AUDIO'], 
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' }}
            },
            systemInstruction: SYSTEM_INSTRUCTION_TEMPLATE(targetLanguage.code),
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          }
        });
        
        // Catch immediate connection errors
        sessionPromiseRef.current.catch(err => {
             if (!isCleanup) {
                 console.error("Session connection rejected:", err);
                 setStatus('error');
                 setErrorMsg("Failed to connect. Check API Key & Network.");
             }
        });

      } catch (e: any) {
        console.error("Setup failed", e);
        if (!isCleanup) {
            setStatus('error');
            if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
                setErrorMsg("Microphone access denied. Please allow microphone access to use this app.");
            } else {
                setErrorMsg(e.message || "Failed to initialize audio or connection");
            }
        }
      }
    };

    startSession();

    return cleanup;
  }, [targetLanguage]);

  // Helper to update messages state safely
  const updateMessage = (role: 'user' | 'model', text: string, isFinal: boolean) => {
      setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          
          if (lastMsg && lastMsg.role === role && !lastMsg.isFinal) {
              const updated = [...prev];
              updated[updated.length - 1] = {
                  ...lastMsg,
                  text: text,
                  isFinal: isFinal
              };
              return updated;
          }

          if (text.trim().length === 0) return prev;

          return [...prev, {
              id: Date.now().toString(),
              role,
              text,
              timestamp: new Date(),
              isFinal
          }];
      });
  };

  const togglePause = () => {
      if (isPaused) {
          if (outputContextRef.current?.state === 'suspended') {
              outputContextRef.current.resume();
          }
          setIsPaused(false);
      } else {
          outputContextRef.current?.suspend();
          setIsPaused(true);
      }
  };

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm px-6 py-4 flex justify-between items-center sticky top-0 z-10 flex-none">
        <div className="flex items-center space-x-3">
            <div className="text-2xl">{targetLanguage.flag}</div>
            <div>
                <h2 className="text-lg font-bold text-gray-800">Translating</h2>
                <p className="text-xs text-gray-500">Dutch ↔ {targetLanguage.name}</p>
            </div>
        </div>
        <button 
            onClick={onExit}
            className="text-gray-500 hover:text-red-500 font-medium text-sm px-3 py-1 rounded-lg border border-gray-200 hover:border-red-200 transition-colors"
        >
            End Session
        </button>
      </header>

      {/* Connection Status Overlay */}
      {status === 'connecting' && (
          <div className="flex-1 flex flex-col items-center justify-center space-y-4 animate-pulse">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-600">{statusMessage}</p>
              <button 
                onClick={onExit} 
                className="mt-8 text-gray-400 hover:text-gray-600 text-sm underline"
              >
                Cancel
              </button>
          </div>
      )}

      {status === 'error' && (
           <div className="flex-1 flex flex-col items-center justify-center space-y-4 p-6 text-center">
             <div className="text-red-500 text-5xl">⚠️</div>
             <p className="text-gray-800 font-semibold">{errorMsg}</p>
             <button onClick={onExit} className="bg-blue-600 text-white px-6 py-2 rounded-full shadow-lg hover:bg-blue-700 transition-colors">Go Back</button>
           </div>
      )}

      {/* Chat Area */}
      {status === 'connected' && (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">
                {messages.length === 0 && (
                    <div className="text-center mt-20 opacity-50">
                        <p className="text-gray-400 text-sm uppercase tracking-widest mb-2">Ready</p>
                        <p className="text-gray-500">Start speaking in Dutch or {targetLanguage.name}</p>
                    </div>
                )}
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-5 py-3 shadow-sm ${
                            msg.role === 'user' 
                            ? 'bg-blue-600 text-white rounded-br-none' 
                            : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none'
                        }`}>
                            <p className="text-md leading-relaxed">{msg.text}</p>
                            {!msg.isFinal && <span className="inline-block w-1 h-4 ml-1 bg-current animate-pulse align-middle"></span>}
                            <span className={`text-[10px] block mt-2 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>
                                {msg.role === 'user' ? 'Original' : 'Translation'}
                            </span>
                        </div>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>

            {/* Controls & Visualizer */}
            <div className="bg-white border-t border-gray-200 p-6 w-full flex-none">
                <div className="max-w-3xl mx-auto flex flex-col space-y-4">
                    <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3 border border-gray-100">
                        <div className="flex-1 flex items-center justify-center overflow-hidden h-16">
                             <Visualizer 
                                isActive={!isPaused && status === 'connected'} 
                                color={isPaused ? '#9CA3AF' : '#2563EB'}
                                volumeRef={volumeRef}
                             />
                        </div>
                    </div>

                    <div className="flex justify-center">
                        <button 
                            onClick={togglePause}
                            className={`flex items-center space-x-2 px-8 py-3 rounded-full font-bold text-lg transition-all transform hover:scale-105 shadow-lg ${
                                isPaused 
                                ? 'bg-green-500 hover:bg-green-600 text-white ring-4 ring-green-100' 
                                : 'bg-yellow-500 hover:bg-yellow-600 text-white ring-4 ring-yellow-100'
                            }`}
                        >
                           {isPaused ? (
                               <>
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <span>Resume Conversation</span>
                               </>
                           ) : (
                               <>
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <span>Pause</span>
                               </>
                           )}
                        </button>
                    </div>
                    <p className="text-center text-xs text-gray-400">
                        {isPaused ? "Microphone muted. Click Resume to continue." : "Listening... Speak freely."}
                    </p>
                </div>
            </div>
          </>
      )}
    </div>
  );
};

export default TranslatorSession;