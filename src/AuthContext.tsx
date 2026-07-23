/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User as FirebaseUser,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, query, collection, where, getDocs, deleteDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: 'admin' | 'agent';
  licenseNumber?: string;
  phone?: string;
  isPreAuthorized?: boolean;
  signatureImage?: string | null;
  commissionProfile?: {
    splitType: 'percentage' | 'flat';
    agentSplit: number;
    brokerSplit: number;
    capAmount: number;
    yearlyProduction: number;
    isInexperienced?: boolean;
    mentorActive?: boolean;
    mentorSplit?: number;
    overrides?: {
      [transactionType: string]: {
        agentSplit: number;
        brokerSplit: number;
      }
    };
  };
}

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  login: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  signupWithEmail: (email: string, pass: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const ADMIN_EMAILS = ['MovingTexasRealty@gmail.com'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let profileUnsubscribe: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      setError(null);
      
      if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = null;
      }
      
      try {
        if (firebaseUser) {
          // Set user immediately so auth state is tracked
          setUser(firebaseUser);
          
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            // Already registered - set up real-time listener
            profileUnsubscribe = onSnapshot(userDocRef, (snapshot) => {
              if (snapshot.exists()) {
                const data = snapshot.data() as UserProfile;
                const userEmail = firebaseUser.email?.toLowerCase() || '';
                const isAdminEmail = ADMIN_EMAILS.some(e => e.toLowerCase() === userEmail);
                
                if (isAdminEmail && data.role !== 'admin') {
                  updateDoc(userDocRef, { role: 'admin' }).catch(console.error);
                  setProfile({ ...data, uid: firebaseUser.uid, role: 'admin' });
                } else {
                  setProfile({ ...data, uid: firebaseUser.uid });
                }
              }
              setLoading(false);
            });
          } else {
            // New user - check if authorized
            const userEmail = firebaseUser.email?.toLowerCase() || '';
            const isAdminEmail = ADMIN_EMAILS.some(e => e.toLowerCase() === userEmail);
            
            // Check roster for pre-authorization
            const q = query(collection(db, 'users'), where('email', '==', userEmail));
            const rosterSnap = await getDocs(q);
            
            if (isAdminEmail) {
              // Admin always allowed
              const newProfile: UserProfile = {
                uid: firebaseUser.uid,
                email: userEmail,
                name: firebaseUser.displayName || 'Admin',
                role: 'admin'
              };
              await setDoc(userDocRef, newProfile);
              
              // Set up listener for the newly created doc
              profileUnsubscribe = onSnapshot(userDocRef, (snapshot) => {
                if (snapshot.exists()) {
                  setProfile({ ...(snapshot.data() as UserProfile), uid: firebaseUser.uid });
                }
                setLoading(false);
              });
            } else if (!rosterSnap.empty) {
              // Found a pre-authorized entry
              const preAuthDoc = rosterSnap.docs[0];
              const preAuthData = preAuthDoc.data();
              
              const newProfile: UserProfile = {
                uid: firebaseUser.uid,
                email: userEmail,
                name: firebaseUser.displayName || preAuthData.name,
                role: 'agent',
                phone: preAuthData.phone || '',
                licenseNumber: preAuthData.licenseNumber || '',
                commissionProfile: preAuthData.commissionProfile
              };
              
              await setDoc(userDocRef, newProfile);
              // Delete pre-auth entry so it doesn't stay as a "ghost"
              if (preAuthDoc.id.startsWith('preauth_')) {
                await deleteDoc(preAuthDoc.ref);
              }
              
              // Set up listener for the newly created doc
              profileUnsubscribe = onSnapshot(userDocRef, (snapshot) => {
                if (snapshot.exists()) {
                  setProfile({ ...(snapshot.data() as UserProfile), uid: firebaseUser.uid });
                }
                setLoading(false);
              });
            } else {
              // Not authorized
              console.warn('Unauthorized login attempt:', userEmail);
              await signOut(auth);
              setError('Your account has not been authorized by the broker yet. Please contact administration.');
              setUser(null);
              setProfile(null);
              setLoading(false);
            }
          }
        } else {
          setProfile(null);
          setUser(null);
          setLoading(false);
        }
      } catch (err: any) {
        console.error('Authentication initialization error:', err);
        setError('An error occurred during authentication setup. If using an Incognito window, try opening the application in a new tab to allow required browser storage.');
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (profileUnsubscribe) {
        profileUnsubscribe();
      }
    };
  }, []);

  const login = async () => {
    try {
      setError(null);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    try {
      setError(null);
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Invalid email or password.');
      } else {
        setError(err.message);
      }
    }
  };

  const signupWithEmail = async (email: string, pass: string) => {
    try {
      setError(null);
      const userEmail = email.toLowerCase();
      
      // Check if authorized first
      const isAdminEmail = ADMIN_EMAILS.some(e => e.toLowerCase() === userEmail);
      const q = query(collection(db, 'users'), where('email', '==', userEmail));
      const rosterSnap = await getDocs(q);

      if (!isAdminEmail && rosterSnap.empty) {
        throw new Error('Your email is not on the authorized roster. Please contact your broker.');
      }

      await createUserWithEmailAndPassword(auth, userEmail, pass);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters.');
      } else {
        setError(err.message);
      }
    }
  };

  const resetPassword = async (email: string) => {
    try {
      setError(null);
      await sendPasswordResetEmail(auth, email);
      alert('Password reset email sent!');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const clearError = () => setError(null);

  const isAdmin = !!user && 
    (user.emailVerified || !!user.email) && (
    profile?.role === 'admin' || 
    ADMIN_EMAILS.some(email => email.toLowerCase() === user.email?.toLowerCase())
  );

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      isAdmin, 
      loading, 
      error, 
      login, 
      loginWithEmail,
      signupWithEmail,
      resetPassword,
      logout, 
      clearError 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
