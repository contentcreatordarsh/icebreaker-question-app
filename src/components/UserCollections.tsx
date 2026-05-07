import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from '../lib/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { Question, DailyQuestion } from '../types';
import { X, Heart, History as HistoryIcon, Bookmark } from 'lucide-react';
import { cn } from '../lib/utils';

interface UserCollectionsProps {
  onClose: () => void;
}

export default function UserCollections({ onClose }: UserCollectionsProps) {
  const [activeTab, setActiveTab] = useState<'favorites' | 'history'>('favorites');
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!auth.currentUser) return;
      setLoading(true);
      setQuestions([]);

      const path = `users/${auth.currentUser.uid}/${activeTab}`;
      const q = query(collection(db, path), orderBy(activeTab === 'favorites' ? 'savedAt' : 'discussedAt', 'desc'), limit(50));
      
      try {
        const querySnapshot = await getDocs(q);
        const fetched = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setQuestions(fetched);
      } catch (error) {
        console.error(`Error fetching ${activeTab}:`, error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [activeTab]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-paper/95 backdrop-blur-md"
    >
      <div className="w-full max-w-4xl h-full max-h-[80vh] flex flex-col bg-white border border-brand/10 shadow-2xl overflow-hidden rounded-sm">
        {/* Header */}
        <div className="p-8 border-b border-brand/10 flex justify-between items-center">
          <div className="flex gap-8">
            <button 
              onClick={() => setActiveTab('favorites')}
              className={cn(
                "caps-tracking pb-2 border-b-2 transition-all",
                activeTab === 'favorites' ? "border-brand opacity-100" : "border-transparent opacity-40"
              )}
            >
              <div className="flex items-center gap-2">
                <Bookmark size={12} /> Favorites
              </div>
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={cn(
                "caps-tracking pb-2 border-b-2 transition-all",
                activeTab === 'history' ? "border-brand opacity-100" : "border-transparent opacity-40"
              )}
            >
              <div className="flex items-center gap-2">
                <HistoryIcon size={12} /> Chronicle
              </div>
            </button>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-paper rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-y-auto p-8 space-y-8 no-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full opacity-40 italic font-serif">
              Reading the archives...
            </div>
          ) : questions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {questions.map((q, idx) => (
                <div key={q.id} className="border-b border-brand/5 pb-8 group">
                  <span className="text-[9px] caps-tracking opacity-30 block mb-2">
                    {idx + 1 < 10 ? `0${idx + 1}` : idx + 1} / {q.category}
                  </span>
                  <p className="font-serif text-xl md:text-2xl italic leading-relaxed group-hover:text-accent transition-colors">
                    "{q.text}"
                  </p>
                  <div className="mt-4 flex justify-between items-center whitespace-nowrap">
                    <span className="text-[10px] opacity-40 italic">
                      {q.savedAt || q.discussedAt ? new Date(q.savedAt?.toDate() || q.discussedAt?.toDate()).toLocaleDateString() : 'Long ago'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto opacity-40">
              <p className="font-serif italic text-lg mb-4">No entries found in this collection.</p>
              <p className="caps-tracking text-[10px]">Start your dialogue to populate these pages.</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
