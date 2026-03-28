import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyCJKmF7ikPFx2VkOSontyvdCaCMnwlqY6U",
    authDomain: "uber-app-9ecf7.firebaseapp.com",
    projectId: "uber-app-9ecf7",
    storageBucket: "uber-app-9ecf7.firebasestorage.app",
    messagingSenderId: "579912198595",
    appId: "1:579912198595:web:29eb7df8f94ab784a53576",
    measurementId: "G-KVP0PXS5Q1"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);