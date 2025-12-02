import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBsvcMmGIGb5CobOHZswOjSq8owF8VftfQ",
  authDomain: "visualizae-3-0-app.firebaseapp.com",
  projectId: "visualizae-3-0-app",
  storageBucket: "visualizae-3-0-app.firebasestorage.app",
  messagingSenderId: "796518112786",
  appId: "1:796518112786:web:9af709ec8673939fcf82cb"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
