/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { Navigate, useLocation } from 'react-router-dom';
import { LogIn, X, Mail, Lock, User as UserIcon, ArrowRight, ArrowLeft } from 'lucide-react';

export default function Login() {
  const { user, login, loginWithEmail, signupWithEmail, resetPassword, loading, error, clearError } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');

  if (loading) return null;
  if (user) {
    const from = (location.state as any)?.from?.pathname || "/";
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
      }
      await signupWithEmail(email, password);
    } else if (mode === 'login') {
      await loginWithEmail(email, password);
    } else {
      await resetPassword(email);
      setMode('login');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl shadow-slate-200/50 p-8 border border-slate-100">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl mb-8 mx-auto shadow-lg shadow-blue-200">
          MTR
        </div>
        
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black text-slate-900 mb-2">
            {mode === 'login' && 'Welcome Back'}
            {mode === 'signup' && 'Create Account'}
            {mode === 'reset' && 'Reset Password'}
          </h1>
          <p className="text-slate-500 font-medium px-4">
            {mode === 'login' && 'Manage your commission disbursements with Moving Texas Realty.'}
            {mode === 'signup' && 'Register your email to access the CDA portal.'}
            {mode === 'reset' && 'Enter your email to receive a password reset link.'}
          </p>
        </div>
        
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-bold animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between gap-3">
              <span className="flex-1">{error}</span>
              <button onClick={clearError} className="p-1 hover:bg-red-100 rounded-lg shrink-0">
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mb-6">
          <div className="relative">
            <Mail className="absolute left-3.5 top-3.5 text-slate-400" size={18} />
            <input
              required
              type="email"
              placeholder="Email Address"
              className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-sm transition-all"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          {mode !== 'reset' && (
            <>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 text-slate-400" size={18} />
                <input
                  required
                  type="password"
                  placeholder="Password"
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-sm transition-all"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>

              {mode === 'signup' && (
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 text-slate-400" size={18} />
                  <input
                    required
                    type="password"
                    placeholder="Confirm Password"
                    className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-sm transition-all"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                  />
                </div>
              )}
            </>
          )}

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 hover:scale-[1.02] active:scale-95"
          >
            {mode === 'login' && 'Sign In'}
            {mode === 'signup' && 'Create Account'}
            {mode === 'reset' && 'Send Reset Link'}
            <ArrowRight size={20} />
          </button>
        </form>

        <div className="relative mb-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-100"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-4 text-slate-400 font-black tracking-widest leading-none">OR CONTINUE WITH</span>
          </div>
        </div>
        
        <button
          onClick={login}
          className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 text-slate-700 py-3.5 rounded-2xl font-bold hover:bg-slate-50 transition-all shadow-sm hover:shadow-md active:scale-95 mb-8"
        >
          <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
          Google Account
        </button>

        <div className="flex flex-col gap-3 text-center">
          {mode === 'login' ? (
            <>
              <button 
                type="button"
                onClick={() => setMode('signup')}
                className="text-sm font-bold text-blue-600 hover:text-blue-700"
              >
                New here? Create an account
              </button>
              <button 
                type="button"
                onClick={() => setMode('reset')}
                className="text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                Forgot password?
              </button>
            </>
          ) : (
            <button 
              type="button"
              onClick={() => setMode('login')}
              className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center justify-center gap-2"
            >
              <ArrowLeft size={16} />
              Return to login
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
