// ========================================
// FIREBASE CONFIGURATION
// ========================================
// Replace these values with your Firebase project settings
// Get them from: Firebase Console > Project Settings > Your apps > Firebase SDK snippet

const firebaseConfig = {
    apiKey: "AIzaSyACV5Puqyq-1Q-wuFwa2lrPyUpaviFY77Y",
    authDomain: "mafia-69d6f.firebaseapp.com",
    databaseURL: "https://mafia-69d6f-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "mafia-69d6f",
    storageBucket: "mafia-69d6f.firebasestorage.app",
    messagingSenderId: "159915134277",
    appId: "1:159915134277:web:274a0f64285a61ccd4822c"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

console.log('🔥 Firebase Configured!');
