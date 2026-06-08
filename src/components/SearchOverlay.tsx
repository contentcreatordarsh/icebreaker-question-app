import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Search, X, Heart, History as HistoryIcon, Globe, ArrowRight } from 'lucide-react';
import { getDb, auth } from '../lib/firebase';
import { collection, query, getDocs, limit } from 'firebase/firestore';
import { DailyQuestion } from '../types';
import { cn } from '../lib/utils';

interface SearchResult {
  id: string;
  text: string;
  category: string;
  source: 'Global' | 'Favorites' | 'History';
  raw: DailyQuestion;
}

interface SearchOverlayProps {
  onClose: () => void;
  onSelectQuestion: (q: DailyQuestion) => void;
}

export default function SearchOverlay({ onClose, onSelectQuestion }: SearchOverlayProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm.trim().length >= 2) performSearch();
      else setResults([]);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  async function performSearch() {
    setLoading(true);
    const searchLower = searchTerm.toLowerCase();
    const allResults: SearchResult[] = [];

    try {
      const db = await getDb();
      // 1. Global pool (cached daily questions)
      const dailySnap = await getDocs(query(collection(db, 'daily_questions'), limit(100)));
      dailySnap.forEach(doc => {
        const data = doc.data() as DailyQuestion;
        if (data.text?.toLowerCase().includes(searchLower)) {
          allResults.push({ id: doc.id, text: data.text, category: data.category, source: 'Global', raw: data });
        }
      });

      // 2. User-specific (if signed in)
      if (auth.currentUser) {
        const uid = auth.currentUser.uid;

        const favSnap = await getDocs(collection(db, 'users', uid, 'favorites'));
        favSnap.forEach(doc => {
          const data = doc.data() as DailyQuestion;
          if (data.text?.toLowerCase().includes(searchLower) && !allResults.find(r => r.id === doc.id)) {
            allResults.push({ id: doc.id, text: data.text, category: data.category, source: 'Favorites', raw: data });
          }
        });

        const histSnap = await getDocs(collection(db, 'users', uid, 'history'));
        histSnap.forEach(doc => {
          const data = doc.data() as DailyQuestion;
          if (data.text?.toLowerCase().includes(searchLower) && !allResults.find(r => r.id === doc.id)) {
            allResults.push({ id: doc.id, text: data.text, category: data.category, source: 'History', raw: data });
          }
        });
      }

      setResults(allResults);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleCopy = (result: SearchResult) => {
    navigator.clipboard.writeText(result.text).then(() => {
      setCopiedId(result.id);
      setTimeout(() => setCopiedId(null), 1500);
    }).catch(() => {
      // Clipboard API unavailable (HTTP, permissions denied) — silently skip feedback
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-paper/98 backdrop-blur-xl flex flex-col p-6 md:p-12"
    >
      <div className="max-w-4xl w-full mx-auto flex flex-col h-full">
        <div className="flex justify-between items-center mb-12">
          <span className="caps-tracking opacity-40">Archive Search</span>
          <button onClick={onClose} className="p-2 hover:bg-brand/5 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="relative mb-12">
          <Search className="absolute left-0 top-1/2 -translate-y-1/2 opacity-30" size={24} />
          <input
            autoFocus
            type="text"
            placeholder="Search keywords…"
            className="w-full bg-transparent border-b border-brand/10 py-6 pl-12 text-2xl md:text-4xl font-serif italic outline-none placeholder:opacity-20"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex-grow overflow-y-auto pr-4 no-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-40 opacity-40 italic font-serif">
              Scanning the archives…
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-8">
              {results.map(result => (
                <div key={result.id} className="group border-b border-brand/5 pb-8">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="caps-tracking opacity-40">{result.category}</span>
                      <span className="h-[1px] w-4 bg-brand/10" />
                      <span className="caps-tracking flex items-center gap-1.5 text-accent/60">
                        {result.source === 'Favorites' && <Heart size={10} />}
                        {result.source === 'History' && <HistoryIcon size={10} />}
                        {result.source === 'Global' && <Globe size={10} />}
                        {result.source}
                      </span>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleCopy(result)}
                        className="caps-tracking text-[9px] border border-brand/10 px-3 py-1.5 hover:bg-brand/5 transition-colors"
                      >
                        {copiedId === result.id ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        onClick={() => { onSelectQuestion(result.raw); onClose(); }}
                        className="caps-tracking text-[9px] border border-brand/20 px-3 py-1.5 bg-brand text-white hover:bg-opacity-80 transition-colors flex items-center gap-1.5"
                      >
                        Display <ArrowRight size={10} />
                      </button>
                    </div>
                  </div>

                  <button
                    className="text-left w-full"
                    onClick={() => { onSelectQuestion(result.raw); onClose(); }}
                  >
                    <p className="text-xl md:text-2xl font-serif italic leading-relaxed group-hover:text-accent transition-colors cursor-pointer">
                      "{result.text}"
                    </p>
                  </button>
                </div>
              ))}
            </div>
          ) : searchTerm.length >= 2 ? (
            <div className="text-center py-20 opacity-30 italic font-serif text-xl px-8">
              No matches found.
            </div>
          ) : (
            <div className="text-center py-20 opacity-20 caps-tracking italic text-xs">
              Enter at least two characters to search.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
