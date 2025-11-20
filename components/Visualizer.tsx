import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isActive: boolean;
  color?: string;
  volumeRef: React.MutableRefObject<number>;
}

const Visualizer: React.FC<VisualizerProps> = ({ isActive, color = '#4F46E5', volumeRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initial state
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';

    let time = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      
      ctx.clearRect(0, 0, width, height);

      if (!isActive) {
        // Draw a flat line if inactive
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.strokeStyle = '#e5e7eb';
        ctx.stroke();
        return;
      }

      // Get current volume from ref
      const volume = volumeRef.current;
      // Amplify volume for better visual feedback (clamp at reasonable max)
      const amplitude = Math.min(volume * 100, height / 2 - 4); 
      
      // If volume is very low, show a minimal breathing line
      const effectiveAmp = Math.max(amplitude, 2);

      ctx.strokeStyle = color;
      ctx.beginPath();

      for (let x = 0; x < width; x++) {
        // Combined wave:
        // 1. Main sine wave moving with time
        // 2. Modulated by volume (amplitude)
        // 3. Window function (sin(x/width * PI)) to keep edges pinned to center
        const y = height / 2 + 
                  Math.sin(x * 0.05 + time) * effectiveAmp * Math.sin(x / width * Math.PI);
        
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      time += 0.2;
      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, color, volumeRef]);

  return (
    <canvas 
      ref={canvasRef} 
      width={300} 
      height={60} 
      className="w-full h-16"
    />
  );
};

export default Visualizer;