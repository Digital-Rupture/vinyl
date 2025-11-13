// VETERAN CLASS NOTE: This script is organized into four main sections:
// 1. Setup & Utilities (Variables, Firebase, Helper Functions)
// 2. Authentication (SSO Sign-In/Sign-Out Logic) <--- NEW CODE HERE
// 3. Core Display Logic (Fetching Data and Rendering Cards)
// 4. User Interaction & Initialization
// This structure helps with maintainability and debugging!

// =================================================================
// 1. SETUP & UTILITIES
// =================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    signInAnonymously,
    signInWithCustomToken,
    onAuthStateChanged,
    signInWithPopup, // New for SSO
    GoogleAuthProvider, // New for Google SSO
    FacebookAuthProvider, // New for Facebook SSO
    OAuthProvider, // Used for Apple and Microsoft SSO
    signOut // New for sign out
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    onSnapshot,
    setLogLevel,
    addDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// Global state variables
let db;
let auth;
let userId = null;
let allRecords = [];
let isAuthReady = false;

// Global state for filtering
let currentFilters = {
    format: '',
    yearFrom: null,
    yearTo: null,
};


// Configuration and Paths
const COLLECTION_PATH = 'records'; 
const DATA_PATH = '/assets/json/initialcollection.json'; 

// Firebase Configuration (MUST be provided by the environment)
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';


// Helper function for showing temporary messages
/**
 * Displays a message in the designated message box element.
 * @param {HTMLElement} messageBox The message box element.
 * @param {string} message The message text.
 * @param {'success'|'error'|'warning'|'loading'} type The type of message.
 * @param {string} [extraContent=''] Optional HTML content to append to the message.
 * @param {number} [duration=5000] Duration in ms before hiding the message.
 */
function showMessage(messageBox, message, type, extraContent = '', duration = 5000) {
    if (!messageBox) return;

    messageBox.classList.remove('hidden', 'success', 'error', 'warning', 'loading');
    
    // Clear previous classes and set new one
    messageBox.className = 'message-box fixed top-4 right-4 z-50 p-3 rounded-lg shadow-xl';
    
    // Assign specific color/style class based on type
    let typeClass = '';
    switch(type) {
        case 'success':
            typeClass = 'bg-green-600 text-white';
            break;
        case 'error':
            typeClass = 'bg-red-600 text-white';
            break;
        case 'warning':
            typeClass = 'bg-yellow-500 text-gray-900';
            break;
        case 'loading':
            typeClass = 'bg-teal-500 text-white animate-pulse';
            break;
        default:
            typeClass = 'bg-gray-700 text-white';
    }
    messageBox.classList.add(typeClass);
    
    messageBox.innerHTML = `<div>${message}</div>${extraContent}`;
    
    // Hide after duration, unless it's a loading message
    if (type !== 'loading' && duration > 0) {
        setTimeout(() => {
            messageBox.classList.add('hidden');
        }, duration);
    }
}


/**
 * Determines a value indicator class based on the estimated value range.
 * @param {number} low The low estimated value.
 * @param {number} high The high estimated value.
 * @returns {string} Tailwind CSS classes for the indicator.
 */
function getValueIndicatorClass(low, high) {
    const avg = (low + high) / 2;
    if (avg >= 40) return 'bg-[var(--color-value-high)]';
    if (avg >= 20) return 'bg-[var(--color-value-mid)]';
    return 'bg-[var(--color-value-low)]';
}


// =================================================================
// 2. AUTHENTICATION (SSO Sign-In/Sign-Out Logic)
// =================================================================

/**
 * Handles SSO sign-in using the specified provider ID.
 * @param {string} providerId The provider ID ('google.com', 'apple.com', 'facebook.com', 'microsoft.com').
 */
async function handleSignIn(providerId) {
    const messageBox = document.getElementById('message-box');
    let provider;

    switch (providerId) {
        case 'google.com':
            provider = new GoogleAuthProvider();
            break;
        case 'facebook.com':
            provider = new FacebookAuthProvider();
            break;
        case 'apple.com':
            provider = new OAuthProvider('apple.com');
            // Apple requires 'popup' and additional scopes/parameters for production
            // If running into issues, check Firebase documentation for Apple SSO setup
            break;
        case 'microsoft.com':
            provider = new OAuthProvider('microsoft.com');
            break;
        default:
            showMessage(messageBox, `Unsupported provider: ${providerId}`, 'error');
            return;
    }

    try {
        showMessage(messageBox, `Attempting sign-in with ${providerId}...`, 'loading');
        await signInWithPopup(auth, provider);
        // onAuthStateChanged will handle the UI update after successful sign-in
        showMessage(messageBox, `Successfully signed in with ${providerId}!`, 'success', '', 3000);
        
    } catch (error) {
        console.error("SSO Sign-In Error:", error);
        let errorMessage = "Authentication failed.";
        
        // Handle common errors
        if (error.code === 'auth/account-exists-with-different-credential') {
            errorMessage = 'An account already exists with this email using a different sign-in method.';
        } else if (error.code === 'auth/popup-closed-by-user') {
             errorMessage = 'Sign-in window closed. Please try again.';
        } else {
             errorMessage = `Sign-in failed. Check console for details.`;
        }

        // Add a reminder about Firebase console configuration
        errorMessage += "<div class='mt-2 text-xs'>Ensure provider is enabled in Firebase Console.</div>";

        showMessage(messageBox, errorMessage, 'error', '', 8000);
    }
}

/**
 * Handles signing the user out.
 */
async function handleSignOut() {
    const messageBox = document.getElementById('message-box');
    try {
        await signOut(auth);
        // The onAuthStateChanged listener will handle UI updates
        showMessage(messageBox, 'You have been signed out.', 'warning');
    } catch (error) {
        console.error("Sign-Out Error:", error);
        showMessage(messageBox, `Sign-out failed: ${error.message}`, 'error');
    }
}

// =================================================================
// 3. CORE DISPLAY LOGIC
// =================================================================

/**
 * Renders the album cards based on the provided records.
 * @param {HTMLElement} gridElement The container element for the cards.
 * @param {Array<Object>} records The array of records to display.
 */
function renderRecords(gridElement, records) {
    gridElement.innerHTML = ''; // Clear existing content

    if (records.length === 0) {
        gridElement.innerHTML = '<p class="col-span-full text-center text-gray-500 py-10">No records found matching your search or filters.</p>';
        return;
    }

    records.forEach(record => {
        // Simple placeholder image logic
        const imagePlaceholder = `https://placehold.co/400x400/262626/E0E0E0?text=${record.artist.split(' ')[0]}%0A${record.title.substring(0, 10)}...`;

        const card = document.createElement('div');
        card.className = 'album-card group'; // Use the custom class from styles.css
        card.innerHTML = `
            <div class="relative">
                <!-- Album Cover Placeholder -->
                <img src="${imagePlaceholder}" alt="Cover art for ${record.title}" class="w-full h-auto object-cover rounded-t-lg transition duration-300 group-hover:opacity-80">
                
                <!-- Value Indicator Label (REMOVED, just keeping the placeholder class for structure) -->
                <div class="absolute top-2 left-2 px-3 py-1 rounded-full text-xs font-semibold text-gray-900 ${getValueIndicatorClass(record.estimated_value_low, record.estimated_value_high)}">
                    Value: $${record.estimated_value_low.toFixed(2)} - $${record.estimated_value_high.toFixed(2)}
                </div>
            </div>
            
            <div class="p-4">
                <p class="text-[var(--color-text-secondary)] text-sm font-body uppercase">${record.artist}</p>
                <h3 class="text-xl font-heading font-extrabold text-[var(--color-text-primary)] leading-tight mt-1 mb-2">${record.title}</h3>
                <p class="text-sm text-[var(--color-text-secondary)]">
                    <span class="font-semibold text-[var(--color-accent-teal)]">Year:</span> ${record.original_release_year}
                </p>
                <p class="text-sm text-[var(--color-text-secondary)] mt-1">
                    <span class="font-semibold text-[var(--color-accent-teal)]">Label:</span> ${record.label}
                </p>
                <p class="text-xs text-gray-500 mt-2">ID: ${record.id}</p>
            </div>
        `;
        gridElement.appendChild(card);
    });
}

/**
 * Fetches the initial data and starts the Firestore listener.
 * @param {HTMLElement} messageBox The message box element.
 * @param {HTMLElement} recordGrid The element where records are rendered.
 * @param {HTMLElement} loadingIndicator The loading indicator element.
 */
async function setupDataListeners(messageBox, recordGrid, loadingIndicator) {
    try {
        // --- 1. Load initial data from JSON file (Fallback/Seed Data) ---
        const response = await fetch(DATA_PATH);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const initialJsonData = await response.json();
        
        // --- 2. Set up Firestore Real-time Listener (ONLY if Auth is Ready) ---
        if (db && userId) {
            // Path: /artifacts/{appId}/users/{userId}/records
            const recordsRef = collection(db, 'artifacts', appId, 'users', userId, COLLECTION_PATH);
            
            // Listen for real-time changes
            onSnapshot(recordsRef, (snapshot) => {
                const firestoreRecords = snapshot.docs.map(doc => ({
                    ...doc.data(),
                    id: doc.id // Use Firestore doc ID for identification
                }));

                // Combine initial data and Firestore data (Firestore overrides by ID/conceptually)
                allRecords = initialJsonData.map(initialRecord => {
                    // Check for a match using the unique catalog number
                    const firestoreMatch = firestoreRecords.find(fr => fr.catalog_no === initialRecord.catalog_no);
                    return firestoreMatch ? {...initialRecord, ...firestoreMatch} : initialRecord;
                });
                
                // Add any records only in Firestore that weren't in the initial set (e.g., new uploads)
                const newRecords = firestoreRecords.filter(fr => !initialJsonData.some(ir => ir.catalog_no === fr.catalog_no));
                allRecords = [...allRecords, ...newRecords];


                // Re-render the combined and potentially filtered list
                applySearchAndFilter(recordGrid, document.getElementById('search-input').value);
                loadingIndicator.style.display = 'none';
                showMessage(messageBox, `Collection loaded! (${allRecords.length} records)`, 'success', '', 2000);

            }, (error) => {
                showMessage(messageBox, `Firestore listener failed: ${error.message}`, 'error');
                loadingIndicator.style.display = 'none';
            });
        } else {
            // If Firestore isn't ready or user is signed out, just load the initial data
            allRecords = initialJsonData;
            applySearchAndFilter(recordGrid, document.getElementById('search-input').value);
            loadingIndicator.style.display = 'none';
            showMessage(messageBox, `Initial collection loaded! (${allRecords.length} records). Sign in to enable saving.`, 'warning', '', 5000);
        }

    } catch (error) {
        showMessage(messageBox, `Failed to fetch initial data: ${error.message}`, 'error');
        loadingIndicator.style.display = 'none';
    }
}


// =================================================================
// 4. USER INTERACTION & INITIALIZATION
// =================================================================

/**
 * Filters and searches the allRecords array and re-renders the grid.
 * @param {HTMLElement} gridElement The container element for the cards.
 * @param {string} searchTerm The text to search for.
 */
function applySearchAndFilter(gridElement, searchTerm) {
    const term = searchTerm ? searchTerm.toLowerCase() : '';
    let filteredRecords = allRecords;

    // 1. Apply Search
    if (term) {
        filteredRecords = filteredRecords.filter(record =>
            record.artist.toLowerCase().includes(term) ||
            record.title.toLowerCase().includes(term) ||
            record.catalog_no.toLowerCase().includes(term)
        );
    }

    // 2. Apply Filters (Year Range)
    const { yearFrom, yearTo } = currentFilters;

    filteredRecords = filteredRecords.filter(record => {
        const recordYear = parseInt(record.original_release_year, 10);
        let matchesYear = true;

        if (yearFrom !== null && !isNaN(yearFrom) && recordYear < yearFrom) {
            matchesYear = false;
        }
        if (yearTo !== null && !isNaN(yearTo) && recordYear > yearTo) {
            matchesYear = false;
        }

        return matchesYear;
    });


    // Re-render the filtered set
    renderRecords(gridElement, filteredRecords);
    
    // Update count in header
    document.getElementById('record-count').textContent = filteredRecords.length;
}


/**
 * Updates the display elements based on the current authentication state.
 * @param {firebase.User | null} user The current Firebase user object.
 */
function updateAuthUI(user) {
    const userIdDisplay = document.getElementById('user-id-display');
    const authStatus = document.getElementById('auth-status');
    const signInButtons = document.getElementById('sso-buttons');
    const signOutButton = document.getElementById('sign-out-btn');

    if (user && user.uid) {
        // User is signed in
        userId = user.uid;
        userIdDisplay.textContent = `UID: ${userId}`;
        
        // Determine the display name (prefers displayName, then email, then 'User')
        const displayName = user.displayName || user.email || 'User';

        // Show status and hide SSO buttons
        authStatus.innerHTML = `Signed in as: <strong>${displayName}</strong>`;
        authStatus.classList.remove('text-red-400');
        authStatus.classList.add('text-green-400');

        signInButtons.classList.add('hidden');
        signOutButton.classList.remove('hidden');

    } else {
        // User is signed out or anonymous
        userId = null;
        userIdDisplay.textContent = `UID: Not Signed In (Anonymous)`;

        authStatus.textContent = 'Please sign in to enable personalized saving and data access.';
        authStatus.classList.remove('text-green-400');
        authStatus.classList.add('text-red-400');
        
        signInButtons.classList.remove('hidden');
        signOutButton.classList.add('hidden');
    }
}


/**
 * Attaches all necessary event listeners for UI interactions.
 */
function attachEventListeners(
    searchInput,
    recordGrid,
    filterButton,
    filterModal,
    closeModalButton,
    resetFilterButton,
    applyFilterButton
) {
    // --- Search Listener ---
    searchInput.addEventListener('input', () => {
        applySearchAndFilter(recordGrid, searchInput.value);
    });

    // --- Filter Modal Listeners ---
    filterButton.addEventListener('click', () => {
        filterModal.classList.remove('hidden');
    });

    closeModalButton.addEventListener('click', () => {
        filterModal.classList.add('hidden');
    });

    // Close on outside click
    filterModal.addEventListener('click', (e) => {
        if (e.target === filterModal) {
            filterModal.classList.add('hidden');
        }
    });

    // --- Apply Filter Listener ---
    applyFilterButton.addEventListener('click', () => {
        const yearFromInput = document.getElementById('filter-year-from');
        const yearToInput = document.getElementById('filter-year-to');

        // Update global filter state
        currentFilters.yearFrom = yearFromInput.value ? parseInt(yearFromInput.value, 10) : null;
        currentFilters.yearTo = yearToInput.value ? parseInt(yearToInput.value, 10) : null;

        applySearchAndFilter(recordGrid, searchInput.value);
        filterModal.classList.add('hidden');
        showMessage(document.getElementById('message-box'), 'Filters applied successfully!', 'success', '', 2000);
    });

    // --- Reset Filter Listener ---
    resetFilterButton.addEventListener('click', () => {
        document.getElementById('filter-year-from').value = '';
        document.getElementById('filter-year-to').value = '';
        currentFilters.yearFrom = null;
        currentFilters.yearTo = null;

        applySearchAndFilter(recordGrid, searchInput.value);
        filterModal.classList.add('hidden');
        showMessage(document.getElementById('message-box'), 'Filters reset.', 'warning', '', 2000);
    });

    // --- SSO Button Listeners ---
    document.getElementById('google-btn').addEventListener('click', () => handleSignIn('google.com'));
    document.getElementById('apple-btn').addEventListener('click', () => handleSignIn('apple.com'));
    document.getElementById('facebook-btn').addEventListener('click', () => handleSignIn('facebook.com'));
    document.getElementById('microsoft-btn').addEventListener('click', () => handleSignIn('microsoft.com'));
    document.getElementById('sign-out-btn').addEventListener('click', handleSignOut);

}


/**
 * Initializes Firebase and sets up the application.
 */
async function initApp() {
    const messageBox = document.getElementById('message-box');
    const loadingIndicator = document.getElementById('loading-indicator');
    loadingIndicator.style.display = 'flex'; // Show loading

    try {
        // --- 1. Initialize Firebase ---
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        setLogLevel('debug'); // Enable detailed Firestore logging

        // --- 2. Handle Authentication ---
        // This listener fires on auth state change (e.g., after sign-in)
        onAuthStateChanged(auth, (user) => {
            updateAuthUI(user);
            if (user) {
                // User is signed in
                isAuthReady = true;
                // Re-run data setup once auth is ready
                setupDataListeners(messageBox, document.getElementById('record-grid'), loadingIndicator);
                
            } else {
                // User is signed out or anonymous sign-in failed/succeeded
                isAuthReady = true;
                // Load data using the fallback if sign-in wasn't successful
                setupDataListeners(messageBox, document.getElementById('record-grid'), loadingIndicator);
            }
        });

        // Attempt initial sign-in (custom token or anonymous for environment setup)
        if (typeof __initial_auth_token !== 'undefined') { 
            await signInWithCustomToken(auth, __initial_auth_token); 
        } else { 
            await signInAnonymously(auth); 
        }

        // --- 3. Get UI Elements and Attach Event Listeners ---
        const searchInput = document.getElementById('search-input');
        const recordGrid = document.getElementById('record-grid');
        const filterButton = document.getElementById('filter-btn');
        const filterModal = document.getElementById('filter-modal');
        const closeModalButton = document.getElementById('close-modal-button');
        const resetFilterButton = document.getElementById('reset-filter-button');
        const applyFilterButton = document.getElementById('apply-filter-button');

        attachEventListeners(
            searchInput,
            recordGrid,
            filterButton,
            filterModal,
            closeModalButton,
            resetFilterButton,
            applyFilterButton
        );


    } catch (error) {
        showMessage(messageBox, `Failed to initialize application: ${error.message}`, 'error');
        loadingIndicator.style.display = 'none';
    }
}

// Start the application when the window loads
window.onload = initApp;

// =================================================================
// 5. SAMPLE FUNCTION TO SAVE DATA (For Future Upload Feature)
// =================================================================

/**
 * Saves a new record to the user's private collection in Firestore.
 * @param {Object} record The record object to save.
 * @param {HTMLElement} messageBox The message box element.
 */
async function saveRecord(record, messageBox) {
    if (!db || !userId) {
        showMessage(messageBox, 'Database not ready or user not signed in.', 'error');
        return;
    }
    try {
        // Path: /artifacts/{appId}/users/{userId}/records
        const recordsRef = collection(db, 'artifacts', appId, 'users', userId, COLLECTION_PATH);
        await addDoc(recordsRef, record);
        showMessage(messageBox, 'Record successfully saved to Firestore!', 'success');
    } catch (e) {
        showMessage(messageBox, `Error adding document: ${e.message}`, 'error');
        console.error("Error adding document: ", e);
    }
}
