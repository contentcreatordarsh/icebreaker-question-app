import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Share2, Heart, CheckCircle2 } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { generateDailyQuestion } from '../services/geminiService';
import { Category, DailyQuestion, OperationType } from '../types';
import { cn } from '../lib/utils';
import { handleFirestoreError } from '../lib/firestoreUtils';

interface QuestionDisplayProps {
  isPremium: boolean;
  category: Category;
}

export default function QuestionDisplay({ isPremium, category }: QuestionDisplayProps) {
  const [dailyQuestion, setDailyQuestion] = useState<DailyQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorited, setIsFavorited] = useState(false);
  const [isDiscussed, setIsDiscussed] = useState(false);

  useEffect(() => {
    async function fetchDailyQuestion() {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];
      const docRef = doc(db, 'daily_questions', `${today}_${category}`);
      
      try {
        const docSnap = await getDoc(docRef);
        let qData: DailyQuestion;
        
        if (docSnap.exists()) {
          qData = docSnap.data() as DailyQuestion;
        } else {
          const newQ = await generateDailyQuestion(category);
          qData = {
            date: today,
            questionId: crypto.randomUUID(),
            text: newQ.text || "What's one thing you're grateful for today?",
            category: category
          };
          
          try {
            await setDoc(docRef, qData);
          } catch (err) {
            console.warn("Could not save daily question to Firestore.");
          }
        }
        
        setDailyQuestion(qData);
        
        // Check if favorited and discussed for current user
        if (auth.currentUser) {
          const favRef = doc(db, 'users', auth.currentUser.uid, 'favorites', qData.questionId);
          const histRef = doc(db, 'users', auth.currentUser.uid, 'history', qData.questionId);
          
          const [favSnap, histSnap] = await Promise.all([getDoc(favRef), getDoc(histRef)]);
          setIsFavorited(favSnap.exists());
          setIsDiscussed(histSnap.exists());
        }
      } catch (error) {
        console.error("Error fetching daily question:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchDailyQuestion();
  }, [category]);

  const handleShare = () => {
    if (dailyQuestion) {
      navigator.share?.({
        title: 'Dinner Table Question',
        text: dailyQuestion.text,
        url: window.location.href
      }).catch(() => {});
    }
  };

  const toggleFavorite = async () => {
    if (!auth.currentUser || !dailyQuestion) return;
    
    const favRef = doc(db, 'users', auth.currentUser.uid, 'favorites', dailyQuestion.questionId);
    try {
      if (isFavorited) {
        await deleteDoc(favRef);
        setIsFavorited(false);
      } else {
        await setDoc(favRef, {
          ...dailyQuestion,
          savedAt: serverTimestamp()
        });
        setIsFavorited(true);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${auth.currentUser.uid}/favorites/${dailyQuestion.questionId}`);
    }
  };

  const markDiscussed = async () => {
    if (!auth.currentUser || !dailyQuestion || isDiscussed) return;
    
    const histRef = doc(db, 'users', auth.currentUser.uid, 'history', dailyQuestion.questionId);
    try {
      await setDoc(histRef, {
        ...dailyQuestion,
        discussedAt: serverTimestamp()
      });
      setIsDiscussed(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${auth.currentUser.uid}/history/${dailyQuestion.questionId}`);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[300px]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-brand/20 border-t-brand rounded-full mb-4"
        />
        <p className="caps-tracking opacity-40">Synchronizing...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto text-center px-4">
      <AnimatePresence mode="wait">
        <motion.div
          key={dailyQuestion?.text}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="relative py-12"
        >
          <span className="caps-tracking opacity-40 mb-12 block">The Daily provocation</span>
          
          <h2 className="font-serif text-5xl md:text-7xl leading-[1.1] text-brand mb-10 tracking-tighter">
            {dailyQuestion?.text}
          </h2>

          <div className="h-[1px] w-24 bg-brand mx-auto opacity-20 mb-10" />
          
          <div className="flex flex-col items-center gap-6">
            <p className="text-xl italic text-brand/60 max-w-xl mx-auto leading-relaxed">
              Sharing depth is encouraged, but introspection is mandatory.
            </p>

            <div className="flex flex-wrap justify-center gap-4 pt-4">
              <button 
                onClick={handleShare}
                className="caps-tracking border border-brand/20 px-6 py-3 hover:bg-brand hover:text-white transition-all flex items-center gap-2"
              >
                <Share2 size={14} /> Share
              </button>
              <button 
                onClick={toggleFavorite}
                disabled={!auth.currentUser}
                className={cn(
                  "caps-tracking border border-brand/20 px-6 py-3 transition-all flex items-center gap-2",
                  "disabled:opacity-20",
                  isFavorited ? "bg-brand text-white border-brand" : "hover:bg-brand hover:text-white"
                )}
              >
                <Heart size={14} className={cn(isFavorited && "fill-current")} /> 
                {isFavorited ? "Favorited" : "Favorite"}
              </button>
              <button 
                onClick={markDiscussed}
                disabled={!auth.currentUser || isDiscussed}
                className={cn(
                  "caps-tracking border border-brand/20 px-6 py-3 transition-all flex items-center gap-2",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  isDiscussed ? "bg-accent/10 border-accent/20 text-accent" : "hover:bg-brand hover:text-white"
                )}
              >
                <CheckCircle2 size={14} />
                {isDiscussed ? "Discussed" : "Discussed"}
              </button>
            </div>
            {!auth.currentUser && (
              <p className="text-[10px] caps-tracking opacity-30">Sign in to save progress</p>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
