import { supabase } from './supabaseClient.js';

const loginScreen = document.getElementById('login-screen');
const appEl = document.getElementById('app');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const loginMsg = document.getElementById('login-msg');
const signOutBtn = document.getElementById('sign-out-btn');
const userEmailEl = document.getElementById('user-email');
const toggleAuthModeLink = document.getElementById('toggle-auth-mode');

let onSignedIn = null;
let onSignedOut = null;
let currentSession = null;
let appInitialized = false;

function showApp(session) {
  currentSession = session;
  loginScreen.classList.add('hidden');
  appEl.classList.remove('hidden');
  userEmailEl.textContent = session.user.email || '';
  loginMsg.textContent = '';
  loginMsg.className = '';
}

function showLogin() {
  currentSession = null;
  appEl.classList.add('hidden');
  loginScreen.classList.remove('hidden');
  setAuthMode('signin');
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  loginMsg.className = '';
  loginMsg.textContent = 'Signing in...';
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    loginMsg.className = 'err';
    loginMsg.textContent = error.message;
  }
  // success path handled by onAuthStateChange below
}

async function handleSignupSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  loginMsg.className = '';
  loginMsg.textContent = 'Creating account...';
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    loginMsg.className = 'err';
    loginMsg.textContent = error.message;
    return;
  }
  if (data.session) {
    // email confirmation is off — onAuthStateChange fires and signs the user straight in
    return;
  }
  loginMsg.className = 'ok';
  loginMsg.textContent = 'Account created — check your email to confirm it, then sign in.';
  signupForm.reset();
  setAuthMode('signin');
}

function setAuthMode(mode) {
  const isSignup = mode === 'signup';
  loginForm.classList.toggle('hidden', isSignup);
  signupForm.classList.toggle('hidden', !isSignup);
  toggleAuthModeLink.textContent = isSignup ? 'Already have an account? Sign In' : 'Need an account? Sign Up';
  loginMsg.className = '';
  loginMsg.textContent = '';
}

async function handleSignOut() {
  appInitialized = false;
  if (onSignedOut) onSignedOut();
  await supabase.auth.signOut();
}

export function getSession() {
  return currentSession;
}

export function initAuth({ onSignIn, onSignOut } = {}) {
  onSignedIn = onSignIn;
  onSignedOut = onSignOut;

  loginForm.addEventListener('submit', handleLoginSubmit);
  signupForm.addEventListener('submit', handleSignupSubmit);
  signOutBtn.addEventListener('click', handleSignOut);
  toggleAuthModeLink.addEventListener('click', (e) => {
    e.preventDefault();
    setAuthMode(signupForm.classList.contains('hidden') ? 'signup' : 'signin');
  });

  // onAuthStateChange fires once immediately with the current session (if any)
  // on subscription, then again on every future sign-in/sign-out/token refresh —
  // this is the single source of truth, no separate getSession() call needed.
  supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
      showApp(session);
      if (!appInitialized) {
        appInitialized = true;
        if (onSignedIn) onSignedIn(session);
      }
    } else {
      appInitialized = false;
      showLogin();
    }
  });
}
