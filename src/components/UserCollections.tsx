import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { db, auth } from '../lib/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { DailyQuestion, Category } from '../types';
import { X, Bookmark, History as HistoryIcon, Copy, Check, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';

/** Shape of documents stored in /users/{uid}/favorites and /users/{uid}/history */
interface StoredQuestion {
  id: string;
  text: string;
  category: Category;
  date?: string;
  savedAt?: { toDate(): Date };
  discussedAt?: { toDate(): Date };
}

interface UserCollectionsProps {
  onClose: () => void;
  onSelectQuestion: (q: DailyQuestion) => void;
}

export default function UserCollections({ onClose, onSelectQuestion }: UserCollectionsProps) {
  const [activeTab, setActiveTab] = useState<'favorites' | 'history'>('favorites');
  const [questions, setQuestions] = useState<StoredQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!auth.currentUser) return;
      setLoading(true);
      setQuestions([]);

      const path = `users/${auth.currentUser.uid}/${activeTab}`;
      const orderField = activeTab === 'favorites' ? 'savedAt' : 'discussedAt';
      const q = query(collection(db, path), orderBy(orderField, 'desc'), limit(50));

      try {
        const snap = await getDocs(q);
        setQuestions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error(`Error fetching ${activeTab}:`, error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [activeTab]);

  const handleCopy = (q: StoredQuestion) => {
    navigator.clipboard.writeText(q.text);
    setCopiedId(q.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleDisplay = (q: StoredQuestion) => {
    const question: DailyQuestion = {
      questionId: q.id,
      text: q.text,
      category: q.category,
      date: q.date || new Date().toISOString().split('T')[0],
    };
    onSelectQuestion(question);
    onClose();
  };

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
                'caps-tracking pb-2 border-b-2 transition-all',
                activeTab === 'favorites' ? 'border-brand opacity-100' : 'border-transparent opacity-40',
              )}
            >
              <div className="flex items-center gap-2">
                <Bookmark size={12} /> Favorites
              </div>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={cn(
                'caps-tracking pb-2 border-b-2 transition-all',
                activeTab === 'history' ? 'border-brand opacity-100' : 'border-transparent opacity-40',
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
              Reading the archives…
            </div>
          ) : questions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {questions.map((q, idx) => (
                <div key={q.id} className="group border-b border-brand/5 pb-8">
                  <span className="text-[9px] caps-tracking opacity-30 block mb-2">
                    {String(idx + 1).padStart(2, '0')} / {q.category}
                  </span>

                  <p className="font-serif text-xl md:text-2xl italic leading-relaxed group-hover:text-accent transition-colors mb-4">
                    "{q.text}"
                  </p>

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] opacity-40 italic">
                      {(q.savedAt || q.discussedAt)
                        ? new Date((q.savedAt ?? q.discussedAt).toDate()).toLocaleDateString()
                        : '—'}
                    </span>

                    {/* Action buttons — visible on hover */}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleCopy(q)}
                        className="caps-tracking text-[9px] border border-brand/10 px-3 py-1.5 hover:bg-brand/5 transition-colors flex items-center gap-1"
                      >
                        {copiedId === q.id ? <><Check size={9} /> Copied</> : <><Copy size={9} /> Copy</>}
                      </button>
                      <button
                        onClick={() => handleDisplay(q)}
                        className="caps-tracking text-[9px] border border-brand/20 px-3 py-1.5 bg-brand text-white hover:bg-opacity-80 transition-colors flex items-center gap-1"
                      >
                        Display <ArrowRight size={9} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto opacity-40">
              <p className="font-serif italic text-lg mb-4">No entries in this collection yet.</p>
              <p className="caps-tracking text-[10px]">Start your dialogue to populate these pages.</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
