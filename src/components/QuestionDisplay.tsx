import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Share2, Heart, CheckCircle2, Twitter, Facebook, Linkedin, Instagram, Music, Copy, Check } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { generateDailyQuestion, generateQuestionImage } from '../services/geminiService';
import { Category, DailyQuestion, OperationType, Difficulty } from '../types';
import { cn } from '../lib/utils';
import { handleFirestoreError } from '../lib/firestoreUtils';
import { Download, Layout as LayoutIcon, Eye } from 'lucide-react';

interface QuestionDisplayProps {
  isPremium: boolean;
  category: Category;
  difficulty: Difficulty;
}

export default function QuestionDisplay({ isPremium, category, difficulty }: QuestionDisplayProps) {
  const [dailyQuestion, setDailyQuestion] = useState<DailyQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorited, setIsFavorited] = useState(false);
  const [isDiscussed, setIsDiscussed] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);

  useEffect(() => {
    async function fetchDailyQuestion() {
      setLoading(true);
      setImageUrl(null);
      const today = new Date().toISOString().split('T')[0];
      const docRef = doc(db, 'daily_questions', `${today}_${category}_${difficulty}`);
      
      try {
        const docSnap = await getDoc(docRef);
        let qData: DailyQuestion;
        
        if (docSnap.exists()) {
          qData = docSnap.data() as DailyQuestion;
        } else {
          const newQ = await generateDailyQuestion(category, difficulty);
          qData = {
            date: today,
            questionId: crypto.randomUUID(),
            text: newQ.text || "What's one thing you're grateful for today?",
            category: category,
            imagePrompt: newQ.imagePrompt
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

        // Auto-generate image if prompt exists
        if (qData.imagePrompt) {
          setGeneratingImage(true);
          const img = await generateQuestionImage(qData.imagePrompt);
          if (img) setImageUrl(img);
          setGeneratingImage(false);
        }

      } catch (error) {
        console.error("Error fetching daily question:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchDailyQuestion();
  }, [category, difficulty]);

  const handleShare = () => {
    if (dailyQuestion) {
      navigator.share?.({
        title: 'Dinner Table Question',
        text: dailyQuestion.text,
        url: window.location.href
      }).catch(() => {});
    }
  };

  const copyToClipboard = () => {
    if (dailyQuestion) {
      navigator.clipboard.writeText(`"${dailyQuestion.text}" - Today's Dinner Table question: ${window.location.href}`);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }
  };

  const getShareUrls = () => {
    if (!dailyQuestion) return { twitter: '', facebook: '', linkedin: '' };
    const text = encodeURIComponent(`"${dailyQuestion.text}" - Today's Dinner Table question:`);
    const url = encodeURIComponent(window.location.href);
    return {
      twitter: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`
    };
  };

  const shareUrls = getShareUrls();

  const handleDownload = () => {
    if (!imageUrl) return;
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `dinner-table-${dailyQuestion?.questionId}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
              {imageUrl && (
                <button 
                  onClick={() => setShowShareCard(true)}
                  className="caps-tracking border border-accent text-accent px-6 py-3 hover:bg-accent hover:text-white transition-all flex items-center gap-2"
                >
                  <LayoutIcon size={14} /> Share Card
                </button>
              )}
            </div>
            {!auth.currentUser && (
              <p className="text-[10px] caps-tracking opacity-30">Sign in to save progress</p>
            )}

            {generatingImage && (
              <div className="mt-8 flex items-center gap-3 justify-center opacity-30">
                <motion.div
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="w-1.5 h-1.5 rounded-full bg-brand"
                />
                <span className="text-[10px] caps-tracking uppercase tracking-widest">Generating Visual Archive</span>
              </div>
            )}

            {/* Social Sharing */}
            <div className="flex items-center gap-6 mt-8">
              <div className="flex gap-6 opacity-40 hover:opacity-100 transition-opacity">
                <a 
                  href={shareUrls.twitter} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:text-accent transition-colors"
                  title="Share on Twitter"
                >
                  <Twitter size={18} />
                </a>
                <a 
                  href={shareUrls.facebook} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:text-accent transition-colors"
                  title="Share on Facebook"
                >
                  <Facebook size={18} />
                </a>
                <a 
                  href={shareUrls.linkedin} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:text-accent transition-colors"
                  title="Share on LinkedIn"
                >
                  <Linkedin size={18} />
                </a>
                <button 
                  onClick={copyToClipboard}
                  className="hover:text-accent transition-colors"
                  title="Copy for Instagram"
                >
                  <Instagram size={18} />
                </button>
                <button 
                  onClick={copyToClipboard}
                  className="hover:text-accent transition-colors"
                  title="Copy for TikTok"
                >
                  <Music size={18} />
                </button>
              </div>

              <div className="h-4 w-[1px] bg-brand/10" />

              <button 
                onClick={copyToClipboard}
                className={cn(
                  "flex items-center gap-2 text-[10px] caps-tracking transition-all",
                  copyFeedback ? "text-accent" : "opacity-40 hover:opacity-100"
                )}
              >
                {copyFeedback ? (
                  <>
                    <Check size={10} /> Copied
                  </>
                ) : (
                  <>
                    <Copy size={10} /> Copy Link
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {showShareCard && dailyQuestion && imageUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-brand/90 backdrop-blur-md flex items-center justify-center p-4"
          >
            <div className="max-w-md w-full flex flex-col gap-6">
              <div className="relative aspect-square bg-paper border-[12px] border-white shadow-2xl overflow-hidden group">
                <img 
                  src={imageUrl} 
                  alt="Share Card Background" 
                  className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-multiply"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-paper via-transparent to-transparent opacity-40" />
                
                <div className="relative h-full flex flex-col justify-between p-12 text-left">
                  <div className="flex flex-col">
                    <span className="text-[8px] tracking-[0.4em] uppercase mb-1 opacity-60">Issue {new Date().getFullYear()} / {dailyQuestion.category}</span>
                    <div className="h-[1px] w-8 bg-brand opacity-20" />
                  </div>

                  <h3 className="font-serif text-3xl italic leading-tight text-brand tracking-tight">
                    "{dailyQuestion.text}"
                  </h3>

                  <div className="flex justify-between items-end">
                    <div className="text-[8px] tracking-[0.3em] font-sans uppercase opacity-40">
                      Dinner Table <br /> Cards
                    </div>
                    <div className="w-8 h-8 border border-brand/10 rounded-full flex items-center justify-center">
                      <span className="text-[8px] font-serif italic text-brand">DT</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={handleDownload}
                  className="flex-1 bg-white text-brand caps-tracking py-4 hover:bg-paper transition-all flex items-center justify-center gap-2"
                >
                  <Download size={14} /> Download Image
                </button>
                <button 
                  onClick={() => setShowShareCard(false)}
                  className="flex-1 border border-white/20 text-white caps-tracking py-4 hover:bg-white/10 transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
