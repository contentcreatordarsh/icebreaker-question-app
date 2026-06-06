import React from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';

interface AboutOverlayProps {
  onClose: () => void;
}

export default function AboutOverlay({ onClose }: AboutOverlayProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-paper/98 backdrop-blur-xl flex flex-col p-6 md:p-12 overflow-y-auto"
    >
      <div className="max-w-2xl w-full mx-auto flex flex-col min-h-full">
        <div className="flex justify-between items-center mb-16">
          <span className="caps-tracking opacity-40 italic font-serif">The Philosophy</span>
          <button onClick={onClose} className="p-2 hover:bg-brand/5 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="space-y-12 mb-16">
          <h1 className="text-4xl md:text-6xl font-serif italic leading-tight tracking-tight">
            Dinner Table is a quiet space for meaningful connection.
          </h1>
          
          <div className="space-y-8 text-lg font-serif italic text-brand/80 leading-relaxed">
            <p>
              In a world of infinite scrolling and rapid-fire consumption, we believe in the power of slow conversation. 
              The dinner table has always been a sacred site of human connection, yet today it's often interrupted by the digital hum of our lives.
            </p>
            <p>
              This application exists to bridge that gap. We use artificial intelligence not to replace human thought, 
              but to provoke it—generating questions that peel back layers of convenience to reveal the actual person sitting across from you.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-12 border-t border-brand/10">
            <div>
              <h3 className="caps-tracking text-[10px] mb-4 opacity-40">Categories</h3>
              <ul className="space-y-2 text-sm font-serif italic opacity-60">
                <li>Icebreaker — For the start of the night.</li>
                <li>Deep Talk — For when the moon is high.</li>
                <li>Funny — For the lighter moments.</li>
                <li>Team Building — For professional synthesis.</li>
              </ul>
            </div>
            <div>
              <h3 className="caps-tracking text-[10px] mb-4 opacity-40">Difficulties</h3>
              <ul className="space-y-2 text-sm font-serif italic opacity-60">
                <li>Light — Barely scratching the surface.</li>
                <li>Deep — Diving into the core.</li>
                <li>Random — Letting chaos decide.</li>
              </ul>
            </div>
          </div>

          <div className="pt-12 border-t border-brand/10">
            <h3 className="caps-tracking text-[10px] mb-4 opacity-40">Contact</h3>
            <p className="text-sm font-serif italic opacity-60">
              Questions, feedback, or just want to say hello? Email{' '}
              <a href="mailto:contentcreatordarsh@gmail.com" className="underline hover:opacity-100 transition-opacity">
                contentcreatordarsh@gmail.com
              </a>{' '}
              or reach out on{' '}
              <a
                href="https://x.com/hegdedarsh"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:opacity-100 transition-opacity"
              >
                X (@hegdedarsh)
              </a>
              .
            </p>
          </div>
        </div>

        <div className="mt-auto pt-16 border-t border-brand/5 text-[10px] caps-tracking opacity-20 flex justify-between items-center">
          <span>version 1.0.4</span>
          <span>© 2026 Dinner Table Cards</span>
        </div>
      </div>
    </motion.div>
  );
}
