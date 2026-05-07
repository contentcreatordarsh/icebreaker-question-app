/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db, signInWithGoogle } from './lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { LogIn, LogOut, Users, Heart, Briefcase, Coffee, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import QuestionDisplay from './components/QuestionDisplay';
import Pricing from './components/Pricing';
import SearchOverlay from './components/SearchOverlay';
import AboutOverlay from './components/AboutOverlay';
import UsageDashboard from './components/UsageDashboard';
import UserCollections from './components/UserCollections';
import { Category, Difficulty, UserProfile } from './types';
import { PLANS } from './constants';
import { cn } from './lib/utils';

export default function App() {
  const [user, loadingAuth] = useAuthState(auth);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [category, setCategory] = useState<Category>('Icebreaker');
  const [difficulty, setDifficulty] = useState<Difficulty>('Random');
  const [showPricing, setShowPricing] = useState(false);
  const [showCollections, setShowCollections] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showUsageDashboard, setShowUsageDashboard] = useState(false);

  useEffect(() => {
    async function syncProfile() {
      if (!user) {
        setUserProfile(null);
        return;
      }

      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        setUserProfile(docSnap.data() as UserProfile);
      } else {
        const newProfile: UserProfile = {
          uid: user.uid,
          email: user.email || '',
          isPremium: false,
          subscriptionPlan: 'free',
          subscriptionStatus: 'none',
          lifetimePurchase: false,
          usageCount: 0,
          createdAt: serverTimestamp(),
        };
        await setDoc(docRef, newProfile);
        setUserProfile(newProfile);
      }
    }

    syncProfile();
  }, [user]);

  const categories: { label: Category; icon: any }[] = [
    { label: 'Icebreaker', icon: Coffee },
    { label: 'Funny', icon: Sparkles },
    { label: 'Deep Talk', icon: Heart },
    { label: 'Team Building', icon: Briefcase },
  ];

  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f0]">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-16 h-16 bg-[#5A5A40]/20 rounded-full mb-4" />
          <div className="h-4 w-32 bg-[#5A5A40]/20 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="editorial-container">
      {/* Decorative Sidebars */}
      <div className="hidden lg:block absolute left-4 top-1/2 -translate-y-1/2 caps-tracking opacity-30 origin-center -rotate-90 whitespace-nowrap">
        Cultivating Meaningful Dialogue
      </div>
      <div className="hidden lg:block absolute right-4 top-1/2 -translate-y-1/2 caps-tracking opacity-30 origin-center rotate-90 whitespace-nowrap">
        A Private Table Collection
      </div>

      {/* Editorial Header */}
      <header className="p-8 md:p-12 flex justify-between items-start border-b border-brand/10 max-w-7xl mx-auto w-full">
        <div className="flex flex-col">
          <span className="caps-tracking mb-2">Volume 01 / Issue {new Date().getFullYear()}</span>
          <h1 className="font-serif text-3xl font-normal italic tracking-tight flex items-center gap-3">
            Dinner Table Question Cards
          </h1>
        </div>

        <div className="text-right flex flex-col items-end">
          <span className="caps-tracking">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
          <div className="flex items-center gap-4 mt-2">
            <button 
              onClick={() => setShowAbout(true)}
              className="caps-tracking hover:opacity-60 transition-opacity flex items-center gap-2 mr-4"
            >
              About
            </button>
            <button 
              onClick={() => setShowSearch(true)}
              className="caps-tracking hover:opacity-60 transition-opacity flex items-center gap-2 mr-4"
            >
              Search
            </button>
            {user ? (
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setShowUsageDashboard(true)}
                  className="flex items-center gap-2 group text-left"
                >
                  {user.photoURL && (
                    <img 
                      src={user.photoURL} 
                      alt={user.displayName || 'User'} 
                      className="w-6 h-6 rounded-full border border-brand/20 shadow-sm"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <div className="flex flex-col items-start leading-none">
                    {user.displayName && (
                      <span className="caps-tracking text-[10px] opacity-40">
                        {user.displayName.split(' ')[0]}
                      </span>
                    )}
                    <span className="text-[8px] caps-tracking opacity-20 group-hover:opacity-60 transition-opacity">
                      {userProfile?.usageCount || 0} / {PLANS[userProfile?.subscriptionPlan || 'free'].limit === 1000000 ? '∞' : PLANS[userProfile?.subscriptionPlan || 'free'].limit}
                    </span>
                  </div>
                </button>
                <button 
                  onClick={() => auth.signOut()}
                  className="caps-tracking hover:opacity-60 transition-opacity flex items-center gap-2"
                >
                  <LogOut size={12} /> Sign Out
                </button>
              </div>
            ) : (
              <button 
                onClick={signInWithGoogle}
                className="bg-brand text-white text-[10px] uppercase font-sans tracking-widest px-4 py-2 hover:bg-opacity-80 transition-all"
              >
                Log In
              </button>
            )}
            {userProfile?.isPremium && (
              <span className="caps-tracking bg-accent/10 py-1 px-3 rounded-sm">Premium Edition</span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-grow flex flex-col py-12 max-w-7xl mx-auto w-full">
        {/* Category Selector - Minimal Editorial Style */}
        <div className="flex justify-center gap-8 mb-16 overflow-x-auto px-8 no-scrollbar">
          {categories.map((cat) => {
            const isActive = category === cat.label;
            return (
              <button
                key={cat.label}
                onClick={() => setCategory(cat.label)}
                className={cn(
                  "caps-tracking pb-2 transition-all border-b-2",
                  isActive 
                    ? "border-brand opacity-100" 
                    : "border-transparent opacity-40 hover:opacity-100"
                )}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Difficulty Selector */}
        <div className="flex justify-center gap-4 mb-12">
          {(['Light', 'Deep', 'Random'] as Difficulty[]).map((dif) => {
            const isActive = difficulty === dif;
            return (
              <button
                key={dif}
                onClick={() => setDifficulty(dif)}
                className={cn(
                  "px-4 py-1.5 text-[10px] caps-tracking border transition-all",
                  isActive 
                    ? "bg-brand text-white border-brand" 
                    : "border-brand/10 opacity-40 hover:opacity-100"
                )}
              >
                {dif}
              </button>
            );
          })}
        </div>

        {/* Question Area */}
        <div className="flex-grow flex flex-col justify-center px-8">
          <QuestionDisplay 
            category={category} 
            difficulty={difficulty}
            userProfile={userProfile}
            onUpgrade={() => setShowPricing(true)}
            isPremium={userProfile?.isPremium || false} 
          />
        </div>

        {/* Upgrade Prompt / Interaction Footer */}
        <div className="mt-12 w-full px-8 pb-12">
          {!userProfile?.isPremium && (
            <div className="border-t border-brand/10 pt-12 text-center">
              <span className="caps-tracking opacity-40 mb-4 block">Archive Access</span>
              <button
                onClick={() => setShowPricing(!showPricing)}
                className="text-2xl font-serif italic text-brand hover:opacity-60 transition-opacity block mx-auto mb-8"
              >
                {showPricing ? "Continue Dialogue" : "Unlock the complete archive of over 3,000 provocations"}
              </button>
              
              <AnimatePresence>
                {showPricing && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                  >
                    <Pricing onSuccess={() => setShowPricing(false)} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>

      <footer className="p-8 md:p-12 grid grid-cols-1 md:grid-cols-3 items-end border-t border-brand/10 max-w-7xl mx-auto w-full gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-accent"></div>
            <span className="caps-tracking">Connection Verified</span>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => user ? setShowCollections(true) : signInWithGoogle()}
              className="caps-tracking border border-brand/20 px-4 py-2 hover:bg-brand hover:text-white transition-colors"
            >
              History
            </button>
            <button className="caps-tracking border border-brand/20 px-4 py-2 hover:bg-brand hover:text-white transition-colors">Randomize</button>
          </div>
        </div>
        
        <div className="hidden md:flex justify-center">
          <div className="w-12 h-12 border border-brand/10 rounded-full flex items-center justify-center">
            <span className="text-[10px] font-serif italic">DT</span>
          </div>
        </div>

        <div className="text-right">
          <p className="caps-tracking opacity-40">&copy; 2026 Cultivating Meaningful Dialogue</p>
        </div>
      </footer>

      {/* Overlays */}
      <AnimatePresence>
        {showCollections && (
          <UserCollections onClose={() => setShowCollections(false)} />
        )}
        {showSearch && (
          <SearchOverlay onClose={() => setShowSearch(false)} />
        )}
        {showAbout && (
          <AboutOverlay onClose={() => setShowAbout(false)} />
        )}
        {showUsageDashboard && userProfile && (
          <UsageDashboard 
            userProfile={userProfile} 
            onClose={() => setShowUsageDashboard(false)} 
            onUpgrade={() => {
              setShowUsageDashboard(false);
              setShowPricing(true);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
